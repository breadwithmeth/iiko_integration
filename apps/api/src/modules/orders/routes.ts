import { Prisma, OrderStatus } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { calculateTotal } from "../../lib/money.js";
import { normalizePhone } from "../../lib/phone.js";
import { prisma } from "../../lib/prisma.js";
import { IikoAuthService } from "../../services/IikoAuthService.js";
import { IikoHttpClient, IikoHttpError } from "../../services/IikoHttpClient.js";
import { IikoOrderBuilder } from "../../services/IikoOrderBuilder.js";
import { IikoOrderStatusService } from "../../services/IikoOrderStatusService.js";
import { isDishOrGoodsWithPositivePrice } from "../../services/productValidator.js";
import { requireRole } from "../../middleware/auth.js";
import type { IikoOrderCreateResponse, IikoOrderCancelResponse } from "../../types/iiko.js";

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
  priceCategoryId: z.string().min(1).optional(),
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
  const auth = new IikoAuthService();
  const client = new IikoHttpClient(auth);
  const builder = new IikoOrderBuilder();
  const statusService = new IikoOrderStatusService(auth);

  const mapCreationStatus = (status: string | undefined): OrderStatus => {
    switch (status) {
      case "Success":
        return OrderStatus.CREATED;
      case "InProgress":
        return OrderStatus.SUBMITTING;
      case "Error":
      default:
        return OrderStatus.FAILED;
    }
  };

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

// Ensure all ordered products are DISH or GOODS with a positive price
	if (products.some(p => !isDishOrGoodsWithPositivePrice(p))) {
	  return reply
	    .code(400)
	    .send({ message: "One or more ordered products are not DISH/GOODS or have zero price" });
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
      priceCategoryId: input.priceCategoryId,
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
      const creationStatus = response.orderInfo?.creationStatus;
      const status = mapCreationStatus(creationStatus);
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
      
      // Check order status immediately after creation
      if (updated.iikoOrderId && updated.organizationId) {
        // Run in background - don't wait for it to complete
        statusService.updateOrderStatus(updated.id, updated.iikoOrderId, updated.organization.iikoId)
          .catch(err => console.error(`Background status check failed for order ${updated.id}:`, err));
      }

      // Print bill and close order after creation (only if status is CREATED)
      if (updated.iikoOrderId && updated.organization?.iikoId && status === "CREATED") {
        const orgIikoId = updated.organization.iikoId;
        const iikoOrderId = updated.iikoOrderId;
        
        // Print bill first
        statusService.printBill(iikoOrderId, orgIikoId)
          .then(printResponse => {
            const printSuccess = printResponse?.orderInfo?.printStatus === "Success" || printResponse?.orderInfo?.printStatus === "Printed";
            
            if (printResponse) {
              console.log(`Print bill response for order ${iikoOrderId}:`, printResponse);
              console.log(`Print bill ${printSuccess ? 'SUCCEEDED' : 'FAILED/NO_STATUS'} for order ${iikoOrderId}`);
            } else {
              console.log(`Print bill returned no response for order ${iikoOrderId}`);
            }
            
            // Always try to close order after print bill attempt
            const delay = printSuccess ? 10000 : 5000;
            console.log(`Scheduling close order for ${iikoOrderId} in ${delay}ms (printSuccess: ${printSuccess})`);
            
            setTimeout(() => {
              statusService.closeOrder(iikoOrderId, orgIikoId)
                .then(closeResponse => {
                  if (closeResponse) {
                    console.log(`Close order response for order ${iikoOrderId}:`, closeResponse);
                    const closeSuccess = closeResponse.orderInfo?.closeStatus === "Success" || closeResponse.orderInfo?.closeStatus === "Closed";
                    console.log(`Close order ${closeSuccess ? 'SUCCEEDED' : 'FAILED/NO_STATUS'} for order ${iikoOrderId}`);
                  } else {
                    console.log(`Close order returned no response for order ${iikoOrderId}`);
                  }
                })
                .catch(err => console.error(`Close order failed for order ${iikoOrderId}:`, err));
            }, delay);
          })
          .catch(err => {
            console.error(`Print bill failed for order ${iikoOrderId}:`, err);
            // Even if print bill throws, try to close order after 5 seconds
            console.log(`Print bill threw error, scheduling close order for ${iikoOrderId} in 5000ms`);
            setTimeout(() => {
              statusService.closeOrder(iikoOrderId, orgIikoId)
                .then(closeResponse => {
                  if (closeResponse) {
                    console.log(`Close order response for order ${iikoOrderId}:`, closeResponse);
                  } else {
                    console.log(`Close order returned no response for order ${iikoOrderId}`);
                  }
                })
                .catch(closeErr => console.error(`Close order failed for order ${iikoOrderId}:`, closeErr));
            }, 5000);
          });
      }
      
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

// Statistics endpoint - only for ADMIN
  app.get("/api/orders/stats", requireRole(app, ["ADMIN"]), async (request) => {
    const query = z.object({
      date: z.string().optional(),        // Single day (backward compatibility)
      dateFrom: z.string().optional(),    // Period start (inclusive)
      dateTo: z.string().optional(),      // Period end (inclusive)
      operatorId: z.string().optional()
    }).parse(request.query);

    const where: Prisma.OrderWhereInput = {};
    if (query.operatorId) where.operatorId = query.operatorId;

    // Exclude FAILED orders (ошибка)
    where.status = { not: "FAILED" };

    // Date filtering logic
    if (query.date) {
      // Single day - backward compatible
      const from = new Date(`${query.date}T00:00:00.000Z`);
      const to = new Date(from);
      to.setUTCDate(to.getUTCDate() + 1);
      where.createdAt = { gte: from, lt: to };
    } else if (query.dateFrom || query.dateTo) {
      // Date range
      const createdAtFilter: Prisma.DateTimeFilter = {};
      if (query.dateFrom) {
        const from = new Date(`${query.dateFrom}T00:00:00.000Z`);
        createdAtFilter.gte = from;
      }
      if (query.dateTo) {
        const to = new Date(`${query.dateTo}T23:59:59.999Z`);
        createdAtFilter.lte = to;
      }
      where.createdAt = createdAtFilter;
    }
    // If no date params provided - no date filter (all time)

    // Get orders with operator info
    const orders = await prisma.order.findMany({
      where,
      include: { operator: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" }
    });

    // Aggregate by operator
    const statsByOperator = new Map<string, {
      operator: { id: string; name: string; email: string };
      totalOrders: number;
      totalAmount: number;
      ordersByStatus: Record<string, number>;
    }>();

    for (const order of orders) {
      const operatorKey = order.operatorId;
      const existing = statsByOperator.get(operatorKey);
      const amount = Number(order.total);

      if (existing) {
        existing.totalOrders += 1;
        existing.totalAmount += amount;
        existing.ordersByStatus[order.status] = (existing.ordersByStatus[order.status] || 0) + 1;
      } else {
        statsByOperator.set(operatorKey, {
          operator: order.operator,
          totalOrders: 1,
          totalAmount: amount,
          ordersByStatus: { [order.status]: 1 }
        });
      }
    }

    // Convert to array and sort by total amount desc
    const operatorStats = Array.from(statsByOperator.values()).sort((a, b) => b.totalAmount - a.totalAmount);

    // Overall totals
    const totalOrders = orders.length;
    const totalAmount = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const ordersByStatus = orders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      summary: { totalOrders, totalAmount, ordersByStatus },
      byOperator: operatorStats
    };
  });

  app.get("/api/orders/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const order = await prisma.order.findUnique({ where: { id: params.id }, include: orderInclude });
    if (!order || (request.user.role === "OPERATOR" && order.operatorId !== request.user.sub)) {
      return reply.code(404).send({ message: "Order not found" });
    }
    return serializeOrder(order);
  });

  app.post("/api/orders/:id/cancel", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: { organization: true }
    });

    if (!order || (request.user.role === "OPERATOR" && order.operatorId !== request.user.sub)) {
      return reply.code(404).send({ message: "Order not found" });
    }

    // Check if order can be cancelled
    if (!order.iikoOrderId) {
      return reply.code(400).send({ message: "Order has no iiko order ID, cannot cancel" });
    }

    // Check if order is already cancelled or in a non-cancellable state
    if (order.status === "CANCELLED") {
      return reply.code(400).send({ message: "Order is already cancelled" });
    }

    if (order.status === "FAILED" || order.status === "UNKNOWN") {
      return reply.code(400).send({ message: `Cannot cancel order with status: ${order.status}` });
    }

    const auth = new IikoAuthService();
    const statusService = new IikoOrderStatusService(auth);

    try {
      const cancelResponse = await statusService.cancelOrder(order.iikoOrderId, order.organization.iikoId);

      if (!cancelResponse) {
        return reply.code(500).send({ message: "Failed to cancel order: no response from iiko" });
      }

      // Check if cancellation was successful
      const cancelStatus = cancelResponse.orderInfo?.cancelStatus;
      const errorInfo = cancelResponse.orderInfo?.errorInfo;

      if (cancelStatus === "Success" || cancelStatus === "Cancelled") {
        // Update order status to CANCELLED
        const updated = await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "CANCELLED",
            iikoStatus: cancelStatus,
            errorMessage: undefined,
            lastStatusCheckAt: new Date(),
            lastStatusResponse: cancelResponse as unknown as Prisma.InputJsonValue
          },
          include: orderInclude
        });
        await prisma.auditLog.create({ data: { userId: request.user.sub, event: "order.cancel", entity: "Order", entityId: order.id } });
        return serializeOrder(updated);
      } else {
        // Cancellation failed
        const errorMessage = errorInfo?.message ?? errorInfo?.description ?? `iiko cancellation status: ${cancelStatus}`;
        const updated = await prisma.order.update({
          where: { id: order.id },
          data: {
            errorMessage,
            lastStatusCheckAt: new Date(),
            lastStatusResponse: cancelResponse as unknown as Prisma.InputJsonValue
          },
          include: orderInclude
        });
        return reply.code(400).send({ message: errorMessage, order: serializeOrder(updated) });
      }
    } catch (error) {
      console.error(`Failed to cancel order ${order.id}:`, error);
      return reply.code(500).send({ message: "Internal server error while cancelling order" });
    }
  });

  app.post("/api/orders/:id/print-bill", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: { organization: true }
    });

    if (!order || (request.user.role === "OPERATOR" && order.operatorId !== request.user.sub)) {
      return reply.code(404).send({ message: "Order not found" });
    }

    if (!order.iikoOrderId) {
      return reply.code(400).send({ message: "Order has no iiko order ID" });
    }

    if (!order.organization?.iikoId) {
      return reply.code(400).send({ message: "Order organization not synced" });
    }

    const auth = new IikoAuthService();
    const statusService = new IikoOrderStatusService(auth);

    try {
      const printResponse = await statusService.printBill(order.iikoOrderId, order.organization.iikoId);

      if (!printResponse) {
        return reply.code(500).send({ message: "Failed to print bill: no response from iiko" });
      }

      const printStatus = printResponse.orderInfo?.printStatus;
      const errorInfo = printResponse.orderInfo?.errorInfo;

      if (printStatus === "Success" || printStatus === "Printed") {
        await prisma.auditLog.create({ data: { userId: request.user.sub, event: "order.print_bill", entity: "Order", entityId: order.id } });
        return { success: true, message: "Чек отправлен на печать", printResponse };
      } else {
        const errorMessage = errorInfo?.message ?? errorInfo?.description ?? `iiko print status: ${printStatus}`;
        return reply.code(400).send({ message: errorMessage, printResponse });
      }
    } catch (error) {
      console.error(`Failed to print bill for order ${order.id}:`, error);
      return reply.code(500).send({ message: "Internal server error while printing bill" });
    }
  });

  app.post("/api/orders/:id/close", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: { organization: true }
    });

    if (!order || (request.user.role === "OPERATOR" && order.operatorId !== request.user.sub)) {
      return reply.code(404).send({ message: "Order not found" });
    }

    if (!order.iikoOrderId) {
      return reply.code(400).send({ message: "Order has no iiko order ID" });
    }

    if (!order.organization?.iikoId) {
      return reply.code(400).send({ message: "Order organization not synced" });
    }

    const auth = new IikoAuthService();
    const statusService = new IikoOrderStatusService(auth);

    try {
      const closeRequest = {
        organizationId: order.organization.iikoId,
        orderId: order.iikoOrderId,
        chequeAdditionalInfo: {
          needReceipt: true,
          isInternetPayment: true
        }
      };
      console.log(`[CLOSE_ORDER] Manual request for order ${order.iikoOrderId}:`, JSON.stringify(closeRequest));

      const closeResponse = await statusService.closeOrder(order.iikoOrderId, order.organization.iikoId);

      if (!closeResponse) {
        return reply.code(500).send({ message: "Failed to close order: no response from iiko" });
      }

      const closeStatus = closeResponse.orderInfo?.closeStatus;
      const errorInfo = closeResponse.orderInfo?.errorInfo;

      if (closeStatus === "Success" || closeStatus === "Closed") {
        await prisma.auditLog.create({ data: { userId: request.user.sub, event: "order.close", entity: "Order", entityId: order.id } });
        return { success: true, message: "Заказ закрыт", closeResponse };
      } else {
        const errorMessage = errorInfo?.message ?? errorInfo?.description ?? `iiko close status: ${closeStatus}`;
        return reply.code(400).send({ message: errorMessage, closeResponse });
      }
    } catch (error) {
      console.error(`Failed to close order ${order.id}:`, error);
      return reply.code(500).send({ message: "Internal server error while closing order" });
    }
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
