import { beforeEach, describe, expect, it, vi } from "vitest";
import { IikoAuthService } from "../services/IikoAuthService.js";

describe("IikoAuthService", () => {
  beforeEach(() => {
    process.env.IIKO_API_KEY = "api-key";
    process.env.IIKO_APP_ID = "app-id";
    process.env.IIKO_CLIENT_SECRET = "secret";
    vi.restoreAllMocks();
  });

  it("caches token between calls", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ correlationId: "c1", token: "token-1" })
    } as Response);

    const service = new IikoAuthService();
    await expect(service.getToken()).resolves.toBe("token-1");
    await expect(service.getToken()).resolves.toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
