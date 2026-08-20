import { prisma } from "../lib/prisma.js";
import { sanitize } from "../lib/sanitize.js";
import type { IikoErrorResponse } from "../types/iiko.js";
import { env } from "../lib/env.js";
import { IikoAuthService } from "./IikoAuthService.js";
import { Prisma } from "@prisma/client";

type JsonObject = Record<string, unknown>;

export class IikoHttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: IikoErrorResponse
  ) {
    super(message);
  }
}

export class IikoHttpClient {
  constructor(private readonly auth: IikoAuthService) {}

  async post<T>(path: string, body: JsonObject, event: string): Promise<T> {
    return this.request<T>("POST", path, body, event);
  }

  private async request<T>(method: string, path: string, body: JsonObject, event: string): Promise<T> {
    let token = await this.auth.getToken();
    let didRefresh = false;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const started = Date.now();
      const response = await fetch(`${env.IIKO_BASE_URL}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const text = await response.text();
      const data = text ? (JSON.parse(text) as unknown) : {};
      const correlationId = typeof data === "object" && data ? String((data as JsonObject).correlationId ?? "") : undefined;

      await prisma.iikoApiLog.create({
        data: {
          event,
          method,
          path,
          httpStatus: response.status,
          latencyMs: Date.now() - started,
          correlationId,
          requestBody: sanitize(body) as Prisma.InputJsonObject,
          responseBody: response.ok ? (sanitize(data) as Prisma.InputJsonObject) : undefined,
          errorBody: response.ok ? undefined : (sanitize(data) as Prisma.InputJsonObject)
        }
      });

      if (response.ok) {
        return data as T;
      }

      if (response.status === 401 && !didRefresh) {
        didRefresh = true;
        token = await this.auth.getToken(true);
        continue;
      }

      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        await sleep(250 * 2 ** attempt);
        continue;
      }

      const errorBody = data as IikoErrorResponse;
      throw new IikoHttpError(errorBody.errorDescription ?? errorBody.message ?? `iiko HTTP ${response.status}`, response.status, errorBody);
    }

    throw new IikoHttpError("iiko request retry limit exceeded");
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
