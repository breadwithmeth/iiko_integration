import { prisma } from "../lib/prisma.js";
import { OrderStatus, Prisma } from "@prisma/client";
import { IikoHttpClient } from "./IikoHttpClient.js";
import { IikoAuthService } from "./IikoAuthService.js";
import type { IikoOrderStatusRequest, IikoOrderStatusResponse, IikoOrderCancelRequest, IikoOrderCancelResponse } from "../types/iiko.js";
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
   * Cancel an order via iiko API
   */
  async cancelOrder(orderId: string, organizationId: string): Promise<IikoOrderCancelResponse | null> {
    const request: IikoOrderCancelRequest = {
      organizationId,
      orderId
    };

    try {
      return await this.client.post<IikoOrderCancelResponse>(
        "/1/order/cancel",
        request as unknown as Record<string, unknown>,
        "iiko.order.cancel"
      );
    } catch (error) {
      // Log error but don't throw - we'll handle it in the caller
      console.error(`Failed to cancel order ${orderId}:`, error);
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

    // Map iiko creationStatus to our internal status
    // The /1/order/by_id endpoint returns creationStatus: "Success" | "InProgress" | "Error"
    const creationStatus = iikoOrder.creationStatus as string | undefined;
    const status = this.mapCreationStatus(creationStatus);

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        iikoStatus: iikoOrder.status ?? creationStatus,
        lastStatusCheckAt: new Date(),
        lastStatusResponse: response as unknown as Prisma.InputJsonValue
      }
    });

    console.log(`Updated order ${orderId} status to ${status} (iiko creationStatus: ${creationStatus})`);
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
   * Map iiko creationStatus to internal status
   */
  private mapCreationStatus(creationStatus: string | undefined): OrderStatus {
    if (!creationStatus) return OrderStatus.UNKNOWN;

    const statusMap: Record<string, OrderStatus> = {
      "Success": OrderStatus.CREATED,
      "InProgress": OrderStatus.SUBMITTING,
      "Error": OrderStatus.FAILED
    };

    return statusMap[creationStatus] || OrderStatus.UNKNOWN;
  }
}
