import { env } from "../lib/env.js";
import type { IikoTokenResponse } from "../types/iiko.js";

export class IikoAuthService {
  private token?: string;
  private expiresAt = 0;
  private pending?: Promise<string>;

  async getToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.token && Date.now() < this.expiresAt) {
      return this.token;
    }
    if (!forceRefresh && this.pending) {
      return this.pending;
    }
    this.pending = this.fetchToken();
    try {
      return await this.pending;
    } finally {
      this.pending = undefined;
    }
  }

  clear() {
    this.token = undefined;
    this.expiresAt = 0;
  }

  private async fetchToken(): Promise<string> {
    if (!env.IIKO_API_KEY || !env.IIKO_APP_ID || !env.IIKO_CLIENT_SECRET) {
      throw new Error("iiko credentials are not configured");
    }

    const response = await fetch(`${env.IIKO_BASE_URL}/v2/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: env.IIKO_API_KEY,
        appId: env.IIKO_APP_ID,
        clientSecret: env.IIKO_CLIENT_SECRET
      })
    });

    if (!response.ok) {
      throw new Error(`Unable to obtain iiko token: HTTP ${response.status}`);
    }

    const data = (await response.json()) as IikoTokenResponse;
    this.token = data.token;
    this.expiresAt = Date.now() + 50 * 60 * 1000;
    return data.token;
  }
}
