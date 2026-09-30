import { OrderStatus, Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import {
  aggregateBonusByOperator,
  computeOrderBonuses,
  getKitchenCategoryInfo,
  loadKitchenCategoryConfig,
  type BonusOrderInput,
  type KitchenCategoryConfig
} from "../../services/KitchenBonusService.js";

const reportQuerySchema = z.object({
  date: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  operatorId: z.string().optional()
});

/**
 * Бонус начисляется только по успешно созданным заказам.
 * CREATED — отправлен в iiko; CLOSED — создан и автоматически закрыт
 * (печать счета + закрытие). Отмененные и ошибочные исключены.
 */
const BONUS_STATUSES: OrderStatus[] = [OrderStatus.CREATED, OrderStatus.CLOSED];

type ReportQuery = z.infer<typeof reportQuerySchema>;

type BonusOrderRow = Prisma.OrderGetPayload<{
  select: {
    id: true;
    createdAt: true;
    externalNumber: true;
    operator: { select: { id: true; name: true } };
    items: { select: { name: true; price: true; amount: true; product: { select: { parentGroupId: true } } } };
  };
}>;

function buildReportWhere(query: ReportQuery, request: FastifyRequest): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = { status: { in: BONUS_STATUSES } };

  // Оператор видит только свои заказы, ADMIN может фильтровать по оператору
  const operatorId = request.user.role === "ADMIN" ? query.operatorId : request.user.sub;
  if (operatorId) where.operatorId = operatorId;

  if (query.date) {
    const from = new Date(`${query.date}T00:00:00.000Z`);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 1);
    where.createdAt = { gte: from, lt: to };
  } else if (query.dateFrom || query.dateTo) {
    const createdAtFilter: Prisma.DateTimeFilter = {};
    if (query.dateFrom) createdAtFilter.gte = new Date(`${query.dateFrom}T00:00:00.000Z`);
    if (query.dateTo) createdAtFilter.lte = new Date(`${query.dateTo}T23:59:59.999Z`);
    where.createdAt = createdAtFilter;
  }
  return where;
}

async function fetchBonusOrders(query: ReportQuery, request: FastifyRequest): Promise<BonusOrderRow[]> {
  return prisma.order.findMany({
    where: buildReportWhere(query, request),
    select: {
      id: true,
      createdAt: true,
      externalNumber: true,
      operator: { select: { id: true, name: true } },
      items: {
        select: {
          name: true,
          price: true,
          amount: true,
          product: { select: { parentGroupId: true } }
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildKitchenMeta(config: KitchenCategoryConfig) {
  return getKitchenCategoryInfo(config);
}

export async function bonusRoutes(app: FastifyInstance) {
  // Активная конфигурация кухонных категорий (для плашки в UI)
  app.get("/api/bonus/categories", { preHandler: [app.authenticate] }, async () => {
    const config = await loadKitchenCategoryConfig();
    return buildKitchenMeta(config);
  });

  // Детальный отчет по заказам
  app.get("/api/bonus/orders", { preHandler: [app.authenticate] }, async (request) => {
    const query = reportQuerySchema.parse(request.query);
    const config = await loadKitchenCategoryConfig();
    const kitchen = buildKitchenMeta(config);
    if (!config.found) {
      return {
        kitchen,
        summary: { ordersCount: 0, kitchenSalesTotal: 0, bonusesTotal: 0 },
        items: []
      };
    }

    const orders = await fetchBonusOrders(query, request);
    const items = computeOrderBonuses(orders as BonusOrderInput[], config);
    return {
      kitchen,
      summary: {
        ordersCount: items.length,
        kitchenSalesTotal: roundMoney(items.reduce((sum, o) => sum + o.kitchenSum, 0)),
        bonusesTotal: roundMoney(items.reduce((sum, o) => sum + o.bonus, 0))
      },
      items
    };
  });

  // Сводный отчет по операторам за период (для начисления ЗП)
  app.get("/api/bonus/operators", { preHandler: [app.authenticate] }, async (request) => {
    const query = reportQuerySchema.parse(request.query);
    const config = await loadKitchenCategoryConfig();
    const kitchen = buildKitchenMeta(config);
    if (!config.found) {
      return {
        kitchen,
        summary: { ordersWithKitchen: 0, kitchenSalesTotal: 0, bonusesTotal: 0, payoutTotal: 0 },
        items: []
      };
    }

    const orders = await fetchBonusOrders(query, request);
    const items = aggregateBonusByOperator(computeOrderBonuses(orders as BonusOrderInput[], config));
    return {
      kitchen,
      summary: {
        ordersWithKitchen: items.reduce((sum, o) => sum + o.ordersWithKitchen, 0),
        kitchenSalesTotal: roundMoney(items.reduce((sum, o) => sum + o.kitchenSalesTotal, 0)),
        bonusesTotal: roundMoney(items.reduce((sum, o) => sum + o.bonusesTotal, 0)),
        payoutTotal: roundMoney(items.reduce((sum, o) => sum + o.payoutTotal, 0))
      },
      items
    };
  });
}
