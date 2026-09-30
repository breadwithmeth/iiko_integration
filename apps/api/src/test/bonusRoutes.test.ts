import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { env } from "../lib/env.js";
import { IikoOrderStatusService } from "../services/IikoOrderStatusService.js";

const ids = vi.hoisted(() => ({
  adminId: crypto.randomUUID(),
  operatorId: crypto.randomUUID()
}));

const prismaMock = vi.hoisted(() => ({
  session: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  apiError: { create: vi.fn() },
  auditLog: { create: vi.fn() },
  productGroup: { findMany: vi.fn() },
  order: { findMany: vi.fn() }
}));

vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

const kitchenGroups = [
  { groupId: "kitchen-root", name: "Кухня", parentGroupId: null },
  { groupId: "salads", name: "Салаты", parentGroupId: "kitchen-root" },
  { groupId: "soups", name: "Супы", parentGroupId: "kitchen-root" },
  { groupId: "drinks", name: "Напитки", parentGroupId: null }
];

const bonusOrders = [
  {
    id: "order-1",
    createdAt: new Date("2026-09-01T10:00:00Z"),
    externalNumber: "CALL-20260901-000001",
    operator: { id: ids.operatorId, name: "Анна" },
    items: [
      { name: "Стейк", price: 3900, amount: 1, product: { parentGroupId: "salads" } },
      { name: "Кола", price: 800, amount: 2, product: { parentGroupId: "drinks" } }
    ]
  },
  {
    id: "order-2",
    createdAt: new Date("2026-09-02T10:00:00Z"),
    externalNumber: "CALL-20260902-000002",
    operator: { id: ids.operatorId, name: "Анна" },
    items: [
      { name: "Салат", price: 2200, amount: 1, product: { parentGroupId: "salads" } },
      { name: "Суп", price: 1100, amount: 1, product: { parentGroupId: "soups" } }
    ]
  }
];

describe("Bonus routes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // buildApp() запускает фоновую проверку статусов — отключаем, чтобы она
    // не создавала лишних вызовов prisma.order.findMany
    vi.spyOn(IikoOrderStatusService.prototype, "checkPendingOrders").mockResolvedValue();
    // Тесты не должны зависеть от значений в .env — фиксируем дефолтную конфигурацию
    env.KITCHEN_CATEGORY_NAMES = "";
    env.KITCHEN_ROOT_GROUP_NAME = "Кухня";
    prismaMock.session.findUnique.mockResolvedValue({ jti: "jti", expiresAt: new Date(Date.now() + 60_000) });
    prismaMock.apiError.create.mockResolvedValue({});
    prismaMock.productGroup.findMany.mockResolvedValue(kitchenGroups);
  });

  it("GET /api/bonus/categories возвращает активные кухонные категории", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: ids.adminId, role: "ADMIN", jti: "jti", name: "Admin", email: "admin@example.com" });

    const response = await app.inject({ method: "GET", url: "/api/bonus/categories", headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      found: true,
      rootGroupName: "Кухня",
      categories: ["Салаты", "Супы"]
    });
  });

  it("GET /api/bonus/orders считает бонус только по позициям кухни", async () => {
    prismaMock.order.findMany.mockResolvedValue(bonusOrders);
    const app = await buildApp();
    const token = app.jwt.sign({ sub: ids.adminId, role: "ADMIN", jti: "jti", name: "Admin", email: "admin@example.com" });

    const response = await app.inject({ method: "GET", url: "/api/bonus/orders", headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.kitchen.found).toBe(true);

    // order-1: только стейк (кухня), кола не кухонная — база 3900, 1 категория = 1%
    const first = body.items.find((o: { orderId: string }) => o.orderId === "order-1");
    expect(first.kitchenSum).toBe(3900);
    expect(first.categories).toEqual(["Салаты"]);
    expect(first.percent).toBe(1);
    expect(first.bonus).toBe(39);

    // order-2: две категории = 2% от 3300
    const second = body.items.find((o: { orderId: string }) => o.orderId === "order-2");
    expect(second.uniqueCategories).toBe(2);
    expect(second.percent).toBe(2);
    expect(second.bonus).toBe(66);

    expect(body.summary.ordersCount).toBe(2);
    expect(body.summary.kitchenSalesTotal).toBe(7200);
    expect(body.summary.bonusesTotal).toBe(105);
  });

  it("GET /api/bonus/orders исключает отмененные и ошибочные заказы", async () => {
    prismaMock.order.findMany.mockResolvedValue([]);
    const app = await buildApp();
    const token = app.jwt.sign({ sub: ids.adminId, role: "ADMIN", jti: "jti", name: "Admin", email: "admin@example.com" });

    await app.inject({ method: "GET", url: "/api/bonus/orders", headers: { authorization: `Bearer ${token}` } });

    const where = prismaMock.order.findMany.mock.calls[0][0].where;
    expect(where.status.in).toEqual(["CREATED", "CLOSED"]);
  });

  it("GET /api/bonus/orders для оператора подставляет только его заказы", async () => {
    prismaMock.order.findMany.mockResolvedValue([]);
    const app = await buildApp();
    const token = app.jwt.sign({ sub: ids.operatorId, role: "OPERATOR", jti: "jti", name: "Оператор", email: "op@example.com" });

    // Оператор пытается запросить чужие данные — фильтр принудительно по своему id
    await app.inject({
      method: "GET",
      url: `/api/bonus/orders?operatorId=${ids.adminId}`,
      headers: { authorization: `Bearer ${token}` }
    });

    const where = prismaMock.order.findMany.mock.calls[0][0].where;
    expect(where.operatorId).toBe(ids.operatorId);
  });

  it("GET /api/bonus/operators возвращает сводный отчет по операторам", async () => {
    prismaMock.order.findMany.mockResolvedValue(bonusOrders);
    const app = await buildApp();
    const token = app.jwt.sign({ sub: ids.adminId, role: "ADMIN", jti: "jti", name: "Admin", email: "admin@example.com" });

    const response = await app.inject({ method: "GET", url: "/api/bonus/operators", headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items).toHaveLength(1);

    const row = body.items[0];
    expect(row.operator.name).toBe("Анна");
    expect(row.ordersWithKitchen).toBe(2);
    expect(row.kitchenSalesTotal).toBe(7200);
    expect(row.bonusesTotal).toBe(105);
    expect(row.payoutTotal).toBe(105);

    expect(body.summary.ordersWithKitchen).toBe(2);
    expect(body.summary.payoutTotal).toBe(105);
  });

  it("возвращает пустые отчеты, если группа «Кухня» не найдена", async () => {
    prismaMock.productGroup.findMany.mockResolvedValue([{ groupId: "drinks", name: "Напитки", parentGroupId: null }]);
    const app = await buildApp();
    const token = app.jwt.sign({ sub: ids.adminId, role: "ADMIN", jti: "jti", name: "Admin", email: "admin@example.com" });

    const ordersResponse = await app.inject({ method: "GET", url: "/api/bonus/orders", headers: { authorization: `Bearer ${token}` } });
    const operatorsResponse = await app.inject({ method: "GET", url: "/api/bonus/operators", headers: { authorization: `Bearer ${token}` } });

    expect(ordersResponse.json().kitchen.found).toBe(false);
    expect(ordersResponse.json().items).toEqual([]);
    expect(operatorsResponse.json().items).toEqual([]);
    expect(prismaMock.order.findMany).not.toHaveBeenCalled();
  });

  it("требует авторизацию", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/bonus/orders" });
    expect(response.statusCode).toBe(401);
  });
});
