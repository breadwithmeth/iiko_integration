import { prisma } from "../lib/prisma.js";
import { OrderStatus, Prisma } from "@prisma/client";
import { IikoHttpClient } from "./IikoHttpClient.js";
import { IikoAuthService } from "./IikoAuthService.js";
import type { IikoOrderStatusRequest, IikoOrderStatusResponse } from "../types/iiko.js";
import { env } from "../lib/env.js";

export class IikoOrderStatusService {
  private readonly client: IikoHttpClient;

  constructor(auth?: IikoAuthService) {
    this.client = new IikoHttpClient(auth || new IikoAuthService());
  }

  /**
   * Check status of a single order via iiko API
   */
  async checkOrderStatus(orderId: string, organizationId: string): Promise<IikoOrderStatusResponse | null> {
    const request: IikoOrderStatusRequest = {
      organizationIds: [organizationId],
      orderIds: [orderId]
    };

    try {
      return await this.client.post<IikoOrderStatusResponse>(
        "/1/order/by_id",
        request as unknown as Record<string, unknown>,
        "iiko.order.status.check"
      );
    } catch (error) {
      // Log error but don't throw - we'll handle it in the caller
      console.error(`Failed to check status for order ${orderId}:`, error);
      return null;
    }
  }

  /**
   * Update order status in database based on iiko response
   */
  async updateOrderStatus(orderId: string, iikoOrderId: string, organizationId: string): Promise<void> {
    const response = await this.checkOrderStatus(iikoOrderId, organizationId);
    
    if (!response?.orders?.[0]) {
      console.log(`No status info for order ${iikoOrderId}`);
      return;
    }

    const iikoOrder = response.orders[0];
    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      console.log(`Order ${orderId} not found in database`);
      return;
    }

    // Map iiko status to our internal status
    const status = this.mapIikoStatus(iikoOrder.status);

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        iikoStatus: iikoOrder.status,
        lastStatusCheckAt: new Date(),
        lastStatusResponse: response as unknown as Prisma.InputJsonValue
      }
    });

    console.log(`Updated order ${orderId} status to ${status} (iiko: ${iikoOrder.status})`);
  }

  /**
   * Check and update status for all orders that need checking
   */
  async checkPendingOrders(): Promise<void> {
    const pendingOrders = await prisma.order.findMany({
      where: {
        OR: [
          { status: OrderStatus.SUBMITTING },
          { status: OrderStatus.CREATED },
          { status: OrderStatus.UNKNOWN }
        ],
        iikoOrderId: { not: null }
      },
      include: {
        organization: true
      }
    });

    console.log(`Found ${pendingOrders?.length || 0} orders to check`);

    if (!pendingOrders) return;

    for (const order of pendingOrders) {
      try {
        if (order.iikoOrderId && order.organization?.iikoId) {
          await this.updateOrderStatus(
            order.id,
            order.iikoOrderId,
            order.organization.iikoId
          );
        }
      } catch (error) {
        console.error(`Failed to update status for order ${order.id}:`, error);
      }
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Start scheduled checking of order statuses
   */
  startScheduledCheck(intervalMinutes: number = 5): NodeJS.Timeout {
    const intervalMs = intervalMinutes * 60 * 1000;

    console.log(`Starting order status check every ${intervalMinutes} minutes`);

    // Run immediately
    this.checkPendingOrders().catch(console.error);

    // Then run on interval
    return setInterval(() => {
      this.checkPendingOrders().catch(console.error);
    }, intervalMs);
  }

  /**
   * Map iiko status to internal status
   */
  private mapIikoStatus(iikoStatus: string | undefined): OrderStatus {
    if (!iikoStatus) return OrderStatus.UNKNOWN;

    const statusMap: Record<string, OrderStatus> = {
      "New": OrderStatus.CREATED,
      "Accepted": OrderStatus.CREATED,
      "Cooking": OrderStatus.CREATED,
      "Waiting": OrderStatus.CREATED,
      "Completed": OrderStatus.CREATED,
      "Cancelled": OrderStatus.CANCELLED,
      "Rejected": OrderStatus.FAILED,
      "Delivered": OrderStatus.CREATED,
      "Closed": OrderStatus.CREATED
    };

    return statusMap[iikoStatus] || OrderStatus.UNKNOWN;
  }
}
