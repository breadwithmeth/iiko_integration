import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { IikoHttpClient } from "../services/IikoHttpClient.js";
import { IikoNomenclatureService } from "../services/IikoNomenclatureService.js";

const ids = vi.hoisted(() => ({
  userId: crypto.randomUUID(),
  organizationIikoId: crypto.randomUUID(),
  terminalGroupIikoId: crypto.randomUUID(),
  orderTypeIikoId: crypto.randomUUID(),
  paymentTypeIikoId: crypto.randomUUID(),
  productIikoId: crypto.randomUUID()
}));

const prismaMock = vi.hoisted(() => ({
  session: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  apiError: { create: vi.fn() },
  auditLog: { create: vi.fn() },
  organization: { findUnique: vi.fn(), findMany: vi.fn() },
  terminalGroup: { findUnique: vi.fn(), findMany: vi.fn() },
  orderType: { findUnique: vi.fn(), findMany: vi.fn() },
  paymentType: { findUnique: vi.fn(), findMany: vi.fn() },
  product: { findMany: vi.fn(), count: vi.fn() },
  productGroup: { findMany: vi.fn() },
  customer: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  order: { count: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  iikoApiLog: { create: vi.fn() },
  user: { findUnique: vi.fn() },
  $disconnect: vi.fn()
}));

vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

describe("API routes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    prismaMock.session.findUnique.mockResolvedValue({ jti: "jti", expiresAt: new Date(Date.now() + 60_000) });
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.apiError.create.mockResolvedValue({});
  });

  it("GET /api/products returns cached products", async () => {
    prismaMock.product.findMany.mockResolvedValue([{ id: "p-db", productId: ids.productIikoId, name: "Судак", type: "DISH", defaultSalePrice: { toString: () => "3900" }, group: { name: "Рыба" }, deleted: false }]);
    prismaMock.product.count.mockResolvedValue(1);
    prismaMock.productGroup.findMany.mockResolvedValue([{ groupId: "fish", name: "Рыба" }]);
    const app = await buildApp();
    const token = app.jwt.sign({ sub: ids.userId, role: "OPERATOR", jti: "jti", name: "Оператор", email: "op@example.com" });

    const response = await app.inject({ method: "GET", url: "/api/products?search=судак", headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    expect(response.json().items[0].name).toBe("Судак");
  });

  it("POST /api/iiko/sync/menu calls sync service", async () => {
    vi.spyOn(IikoNomenclatureService.prototype, "syncMenu").mockResolvedValue({ synced: 2, revision: "r1" });
    const app = await buildApp();
    const token = app.jwt.sign({ sub: ids.userId, role: "ADMIN", jti: "jti", name: "Admin", email: "admin@example.com" });

    const response = await app.inject({ method: "POST", url: "/api/iiko/sync/menu", headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ synced: 2, revision: "r1" });
  });

  it("POST /api/orders persists order and sends one iiko request", async () => {
    const orderId = crypto.randomUUID();
    prismaMock.organization.findUnique.mockResolvedValue({ id: "org-db", iikoId: ids.organizationIikoId });
    prismaMock.terminalGroup.findUnique.mockResolvedValue({ id: "tg-db", iikoId: ids.terminalGroupIikoId });
    prismaMock.orderType.findUnique.mockResolvedValue({ id: "ot-db", iikoId: ids.orderTypeIikoId });
    prismaMock.paymentType.findUnique.mockResolvedValue({ id: "pt-db", iikoId: ids.paymentTypeIikoId, kind: "Cash" });
    prismaMock.product.findMany.mockResolvedValue([{ id: "p-db", productId: ids.productIikoId, type: "DISH", defaultSalePrice: 3900 }]);
    prismaMock.customer.findFirst.mockResolvedValue(null);
    prismaMock.customer.create.mockResolvedValue({ id: "customer-db" });
    prismaMock.order.count.mockResolvedValue(0);
    prismaMock.order.create.mockResolvedValue({ id: orderId, externalNumber: "CALL-20260820-000001", total: { toString: () => "3900" }, items: [], status: "SUBMITTING" });
    prismaMock.order.update.mockResolvedValue({
      id: orderId,
      externalNumber: "CALL-20260820-000001",
      status: "CREATED",
      total: { toString: () => "3900" },
      iikoOrderId: "iiko-order",
      correlationId: "corr",
      items: [],
      customer: { phone: "+77771234567" },
      organization: {},
      terminalGroup: {},
      operator: {}
    });
    vi.spyOn(IikoHttpClient.prototype, "post").mockResolvedValue({ correlationId: "corr", orderInfo: { id: "iiko-order", creationStatus: "Success" } });
    const app = await buildApp();
    const token = app.jwt.sign({ sub: ids.userId, role: "OPERATOR", jti: "jti", name: "Оператор", email: "op@example.com" });

      const response = await app.inject({
        method: "POST",
        url: "/api/orders",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          idempotencyKey: crypto.randomUUID(),
          organizationId: ids.organizationIikoId,
          terminalGroupId: ids.terminalGroupIikoId,
          orderTypeId: ids.orderTypeIikoId,
          paymentTypeId: ids.paymentTypeIikoId,
          paymentTypeKind: "Cash",
          customer: { phone: "+7 777 123 45 67", firstName: "Сергей" },
          items: [{ productId: ids.productIikoId, name: "Судак", price: 3900, amount: 1 }]
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe("CREATED");
      expect(IikoHttpClient.prototype.post).toHaveBeenCalledTimes(1);
    });

it("POST /api/orders rejects non‑DISH/GOODS product", async () => {
      const orderId = crypto.randomUUID();
      prismaMock.organization.findUnique.mockResolvedValue({ id: "org-db", iikoId: ids.organizationIikoId });
      prismaMock.terminalGroup.findUnique.mockResolvedValue({ id: "tg-db", iikoId: ids.terminalGroupIikoId });
      prismaMock.orderType.findUnique.mockResolvedValue({ id: "ot-db", iikoId: ids.orderTypeIikoId });
      prismaMock.paymentType.findUnique.mockResolvedValue({ id: "pt-db", iikoId: ids.paymentTypeIikoId, kind: "Cash" });
      // Return a product that is not a DISH or GOODS (or has zero price)
      prismaMock.product.findMany.mockResolvedValue([
        { id: "p-db", productId: ids.productIikoId, type: "NON_DISH", defaultSalePrice: 0 }
      ]);
      prismaMock.customer.findFirst.mockResolvedValue(null);
      prismaMock.customer.create.mockResolvedValue({ id: "customer-db" });
      // The rest of mocks are not needed because the request should be rejected before reaching them

      const app = await buildApp();
      const token = app.jwt.sign({ sub: ids.userId, role: "OPERATOR", jti: "jti", name: "Оператор", email: "op@example.com" });

      const response = await app.inject({
        method: "POST",
        url: "/api/orders",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          idempotencyKey: crypto.randomUUID(),
          organizationId: ids.organizationIikoId,
          terminalGroupId: ids.terminalGroupIikoId,
          orderTypeId: ids.orderTypeIikoId,
          paymentTypeId: ids.paymentTypeIikoId,
          paymentTypeKind: "Cash",
          customer: { phone: "+7 777 123 45 67" },
          items: [{ productId: ids.productIikoId, name: "Invalid", price: 0, amount: 1 }]
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain("One or more ordered products are not DISH/GOODS or have zero price");
    });

    it("POST /api/orders accepts GOODS product with positive price", async () => {
      const orderId = crypto.randomUUID();
      prismaMock.organization.findUnique.mockResolvedValue({ id: "org-db", iikoId: ids.organizationIikoId });
      prismaMock.terminalGroup.findUnique.mockResolvedValue({ id: "tg-db", iikoId: ids.terminalGroupIikoId });
      prismaMock.orderType.findUnique.mockResolvedValue({ id: "ot-db", iikoId: ids.orderTypeIikoId });
      prismaMock.paymentType.findUnique.mockResolvedValue({ id: "pt-db", iikoId: ids.paymentTypeIikoId, kind: "Cash" });
      // Return a GOODS product with positive price
      prismaMock.product.findMany.mockResolvedValue([
        { id: "p-db", productId: ids.productIikoId, type: "GOODS", defaultSalePrice: 500 }
      ]);
      prismaMock.customer.findFirst.mockResolvedValue(null);
      prismaMock.customer.create.mockResolvedValue({ id: "customer-db" });
      prismaMock.order.count.mockResolvedValue(0);
      prismaMock.order.create.mockResolvedValue({ id: orderId, externalNumber: "CALL-20260820-000001", total: { toString: () => "500" }, items: [], status: "SUBMITTING" });
      prismaMock.order.update.mockResolvedValue({
        id: orderId,
        externalNumber: "CALL-20260820-000001",
        status: "CREATED",
        total: { toString: () => "500" },
        iikoOrderId: "iiko-order",
        correlationId: "corr",
        items: [],
        customer: { phone: "+77771234567" },
        organization: {},
        terminalGroup: {},
        operator: {}
      });
      vi.spyOn(IikoHttpClient.prototype, "post").mockResolvedValue({ correlationId: "corr", orderInfo: { id: "iiko-order", creationStatus: "Success" } });
      const app = await buildApp();
      const token = app.jwt.sign({ sub: ids.userId, role: "OPERATOR", jti: "jti", name: "Оператор", email: "op@example.com" });

      const response = await app.inject({
        method: "POST",
        url: "/api/orders",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          idempotencyKey: crypto.randomUUID(),
          organizationId: ids.organizationIikoId,
          terminalGroupId: ids.terminalGroupIikoId,
          orderTypeId: ids.orderTypeIikoId,
          paymentTypeId: ids.paymentTypeIikoId,
          paymentTypeKind: "Cash",
          customer: { phone: "+7 777 123 45 67", firstName: "Сергей" },
          items: [{ productId: ids.productIikoId, name: "Goods Item", price: 500, amount: 1 }]
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe("CREATED");
      expect(IikoHttpClient.prototype.post).toHaveBeenCalledTimes(1);
    });

  it("POST /api/iiko/sync/menu returns 400 when organization missing", async () => {
    // Simulate missing organization in DB
    prismaMock.organization.findUnique.mockResolvedValue(null);
    const app = await buildApp();
    const token = app.jwt.sign({ sub: ids.userId, role: "ADMIN", jti: "jti", name: "Admin", email: "admin@example.com" });

    const response = await app.inject({ method: "POST", url: "/api/iiko/sync/menu", headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("Organization must be synchronized before menu");
  });
});
