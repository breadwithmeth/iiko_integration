import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { calculateTotal } from "../../lib/money.js";
import { normalizePhone } from "../../lib/phone.js";
import { prisma } from "../../lib/prisma.js";
import { IikoAuthService } from "../../services/IikoAuthService.js";
import { IikoHttpClient, IikoHttpError } from "../../services/IikoHttpClient.js";
import { IikoOrderBuilder } from "../../services/IikoOrderBuilder.js";
import { isDishWithPositivePrice } from "../../services/productValidator.js";
import type { IikoOrderCreateResponse } from "../../types/iiko.js";

const modifierSchema = z.object({
  productId: z.string().uuid(),
  name: z.string(),
  amount: z.number().positive(),
  price: z.number().optional()
});

const itemSchema = z.object({
  productId: z.string().uuid(),
  productSizeId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  amount: z.number().positive(),
  comment: z.string().max(500).optional(),
  modifiers: z.array(modifierSchema).optional()
});

const createOrderSchema = z.object({
  idempotencyKey: z.string().uuid().optional(),
  organizationId: z.string().min(1),
  terminalGroupId: z.string().min(1),
  orderTypeId: z.string().min(1),
  paymentTypeId: z.string().min(1),
  paymentTypeKind: z.string().min(1),
  customer: z.object({
    phone: z.string().min(3),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    comment: z.string().optional()
  }),
  items: z.array(itemSchema).min(1)
});

const listQuerySchema = z.object({
  date: z.string().optional(),
  phone: z.string().optional(),
  externalNumber: z.string().optional(),
  status: z.string().optional(),
  operator: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1)
});

export async function orderRoutes(app: FastifyInstance) {
  const client = new IikoHttpClient(new IikoAuthService());
  const builder = new IikoOrderBuilder();

  app.post("/api/orders", { preHandler: [app.authenticate] }, async (request, reply) => {
    const input = createOrderSchema.parse(request.body);

    if (input.idempotencyKey) {
      const existing = await prisma.order.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: orderInclude
      });
      if (existing) {
        const body = serializeOrder(existing);
        return existing.status === "CREATED" ? body : reply.code(409).send(body);
      }
    }

    const [organization, terminalGroup, orderType, paymentType] = await Promise.all([
      prisma.organization.findUnique({ where: { iikoId: input.organizationId } }),
      prisma.terminalGroup.findUnique({ where: { iikoId: input.terminalGroupId } }),
      prisma.orderType.findUnique({ where: { iikoId: input.orderTypeId } }),
      prisma.paymentType.findUnique({ where: { iikoId: input.paymentTypeId } })
    ]);

    if (!organization || !terminalGroup || !orderType || !paymentType) {
      return reply.code(400).send({ message: "Organization, terminal group, order type or payment type is not synchronized" });
    }

    const products = await prisma.product.findMany({ where: { productId: { in: input.items.map((item) => item.productId) }, deleted: false } });
    if (products.length !== new Set(input.items.map((item) => item.productId)).size) {
  return reply.code(400).send({ message: "One or more products are unavailable" });
}

// Ensure all ordered products are DISH with a positive price
if (products.some(p => !isDishWithPositivePrice(p))) {
  return reply
    .code(400)
    .send({ message: "One or more ordered products are not DISH or have zero price" });
}

    const phone = normalizePhone(input.customer.phone);
    const total = calculateTotal(input.items);
    const orderId = crypto.randomUUID();
    const externalNumber = await nextExternalNumber();
    const payload = builder.build({
      orderId,
      externalNumber,
      organizationId: input.organizationId,
      terminalGroupId: input.terminalGroupId,
      orderTypeId: input.orderTypeId,
      customer: { ...input.customer, phone },
      items: input.items,
      payment: { paymentTypeId: input.paymentTypeId, paymentTypeKind: input.paymentTypeKind, sum: total }
    });

    const customer = await upsertCustomer(phone, input.customer);
    const order = await prisma.order.create({
      data: {
        id: orderId,
        idempotencyKey: input.idempotencyKey,
        externalNumber,
        organizationId: organization.id,
        terminalGroupId: terminalGroup.id,
        orderTypeId: orderType.id,
        paymentTypeId: paymentType.id,
        customerId: customer.id,
        operatorId: request.user.sub,
        status: "SUBMITTING",
        total: new Prisma.Decimal(total),
        requestPayload: payload as unknown as Prisma.InputJsonObject,
        submittedAt: new Date(),
        items: {
          create: input.items.map((item) => {
            const product = products.find((candidate) => candidate.productId === item.productId);
            return {
              productId: product?.id,
              iikoProductId: item.productId,
              productSizeId: item.productSizeId,
              name: item.name,
              price: new Prisma.Decimal(item.price),
              amount: new Prisma.Decimal(item.amount),
              comment: item.comment,
              modifiers: item.modifiers as Prisma.InputJsonValue
            };
          })
        }
      },
      include: orderInclude
    });

    try {
      const response = await client.post<IikoOrderCreateResponse>("/1/order/create", payload as unknown as Record<string, unknown>, "iiko.order.create");
      const status = response.orderInfo?.creationStatus === "Success" ? "CREATED" : "FAILED";
      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          status,
          iikoOrderId: response.orderInfo?.id,
          iikoPosId: response.orderInfo?.posId,
          correlationId: response.correlationId,
          responsePayload: response as unknown as Prisma.InputJsonObject,
          errorMessage: status === "FAILED" ? response.orderInfo?.errorInfo?.message ?? "iiko creation status is not Success" : undefined
        },
        include: orderInclude
      });
      await prisma.auditLog.create({ data: { userId: request.user.sub, event: "order.create", entity: "Order", entityId: order.id } });
      return serializeOrder(updated);
    } catch (error) {
      const isNetworkOrTimeout = !(error instanceof IikoHttpError) || !error.status;
      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          status: isNetworkOrTimeout ? "UNKNOWN" : "FAILED",
          errorMessage: error instanceof Error ? error.message : "Unknown iiko error",
          errorPayload: error instanceof IikoHttpError ? (error.body as Prisma.InputJsonObject) : undefined
        },
        include: orderInclude
      });
      return reply.code(isNetworkOrTimeout ? 504 : 400).send(serializeOrder(updated));
    }
  });

  app.get("/api/orders", { preHandler: [app.authenticate] }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    const where: Prisma.OrderWhereInput = {};
    if (request.user.role === "OPERATOR") where.operatorId = request.user.sub;
    if (query.status) where.status = query.status as Prisma.EnumOrderStatusFilter["equals"];
    if (query.externalNumber) where.externalNumber = { contains: query.externalNumber, mode: "insensitive" };
    if (query.operator && request.user.role === "ADMIN") where.operatorId = query.operator;
    if (query.phone) where.customer = { phone: { contains: normalizePhone(query.phone).replace("+", ""), mode: "insensitive" } };
    if (query.date) {
      const from = new Date(`${query.date}T00:00:00.000Z`);
      const to = new Date(from);
      to.setUTCDate(to.getUTCDate() + 1);
      where.createdAt = { gte: from, lt: to };
    }

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * 50,
        take: 50
      }),
      prisma.order.count({ where })
    ]);
    return { items: items.map(serializeOrder), total };
  });

  app.get("/api/orders/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const order = await prisma.order.findUnique({ where: { id: params.id }, include: orderInclude });
    if (!order || (request.user.role === "OPERATOR" && order.operatorId !== request.user.sub)) {
      return reply.code(404).send({ message: "Order not found" });
    }
    return serializeOrder(order);
  });
}

const orderInclude = {
  customer: true,
  items: true,
  organization: true,
  terminalGroup: true,
  orderType: true,
  paymentType: true,
  operator: { select: { id: true, name: true, email: true } }
} satisfies Prisma.OrderInclude;

async function upsertCustomer(phone: string, input: { firstName?: string; lastName?: string; email?: string; comment?: string }) {
  const existing = await prisma.customer.findFirst({ where: { phone } });
  if (existing) {
    return prisma.customer.update({
      where: { id: existing.id },
      data: { firstName: input.firstName, lastName: input.lastName, email: input.email || undefined, comment: input.comment }
    });
  }
  return prisma.customer.create({ data: { phone, firstName: input.firstName, lastName: input.lastName, email: input.email || undefined, comment: input.comment } });
}

async function nextExternalNumber() {
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const count = await prisma.order.count({
    where: {
      externalNumber: { startsWith: `CALL-${today}` }
    }
  });
  return `CALL-${today}-${String(count + 1).padStart(6, "0")}`;
}

function serializeOrder(order: Prisma.OrderGetPayload<{ include: typeof orderInclude }>) {
  return {
    ...order,
    total: Number(order.total),
    items: order.items.map((item) => ({
      ...item,
      price: Number(item.price),
      amount: Number(item.amount)
    }))
  };
}
