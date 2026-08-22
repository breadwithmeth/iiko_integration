import { prisma } from "../lib/prisma.js";
import { OrderStatus, Prisma } from "@prisma/client";
import { IikoHttpClient } from "./IikoHttpClient.js";
import { IikoAuthService } from "./IikoAuthService.js";
import type { IikoOrderStatusRequest, IikoOrderStatusResponse, IikoOrderCancelRequest, IikoOrderCancelResponse, IikoPrintBillRequest, IikoPrintBillResponse, IikoCloseOrderRequest, IikoCloseOrderResponse } from "../types/iiko.js";
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

    console.log(`[CHECK_STATUS] Checking status for order ${orderId} in org ${organizationId}`);

    try {
      const response = await this.client.post<IikoOrderStatusResponse>(
        "/1/order/by_id",
        request as unknown as Record<string, unknown>,
        "iiko.order.status.check"
      );
      
      console.log(`[CHECK_STATUS] Response for order ${orderId}:`, JSON.stringify(response));
      return response;
    } catch (error) {
      // Log error but don't throw - we'll handle it in the caller
      console.error(`[CHECK_STATUS] Failed for order ${orderId}:`, error);
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
   * Print bill/receipt for an order via iiko API
   */
  async printBill(orderId: string, organizationId: string): Promise<IikoPrintBillResponse | null> {
    const request: IikoPrintBillRequest = {
      organizationId,
      orderId,
      chequeAdditionalInfo: {
        needReceipt: true,
        isInternetPayment: true
      }
    };

    console.log(`[PRINT_BILL] Sending request for order ${orderId}:`, JSON.stringify(request));

    try {
      const response = await this.client.post<IikoPrintBillResponse>(
        "/1/order/print_bill",
        request as unknown as Record<string, unknown>,
        "iiko.order.print_bill"
      );
      
      console.log(`[PRINT_BILL] Response for order ${orderId}:`, JSON.stringify(response));
      return response;
    } catch (error) {
      // Log error but don't throw - we'll handle it in the caller
      console.error(`[PRINT_BILL] Failed for order ${orderId}:`, error);
      return null;
    }
  }

  /**
   * Close an order via iiko API
   */
  async closeOrder(orderId: string, organizationId: string): Promise<IikoCloseOrderResponse | null> {
    const request: IikoCloseOrderRequest = {
      organizationId,
      orderId,
      chequeAdditionalInfo: {
        needReceipt: true,
        isInternetPayment: true
      }
    };

    console.log(`[CLOSE_ORDER] Sending request for order ${orderId}:`, JSON.stringify(request));

    try {
      const response = await this.client.post<IikoCloseOrderResponse>(
        "/1/order/close",
        request as unknown as Record<string, unknown>,
        "iiko.order.close"
      );
      
      console.log(`[CLOSE_ORDER] Response for order ${orderId}:`, JSON.stringify(response));
      return response;
    } catch (error) {
      // Log error but don't throw - we'll handle it in the caller
      console.error(`[CLOSE_ORDER] Failed for order ${orderId}:`, error);
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

    // Check if status changed to CREATED (was not CREATED before)
    const wasCreated = order.status === "CREATED";
    const isNowCreated = status === "CREATED";
    const shouldTriggerPrintBill = isNowCreated && !wasCreated;

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

    // Trigger print bill when order becomes CREATED
    if (shouldTriggerPrintBill && order.organizationId) {
      // Get organization iikoId
      const organization = await prisma.organization.findUnique({
        where: { id: order.organizationId },
        select: { iikoId: true }
      });
      
      if (organization?.iikoId) {
        console.log(`Order ${orderId} became CREATED, triggering print bill...`);
        this.printBill(iikoOrderId, organization.iikoId)
          .then(printResponse => {
            if (printResponse) {
              console.log(`Print bill response for order ${iikoOrderId}:`, printResponse);
              
              // After successful print, wait 10 seconds then close order
              setTimeout(() => {
                this.closeOrder(iikoOrderId, organization.iikoId)
                  .then(closeResponse => {
                    if (closeResponse) {
                      console.log(`Close order response for order ${iikoOrderId}:`, closeResponse);
                    } else {
                      console.log(`Close order returned no response for order ${iikoOrderId}`);
                    }
                  })
                  .catch(err => console.error(`Close order failed for order ${iikoOrderId}:`, err));
              }, 10000); // 10 seconds delay
            } else {
              console.log(`Print bill returned no response for order ${iikoOrderId}`);
            }
          })
          .catch(err => console.error(`Print bill failed for order ${iikoOrderId}:`, err));
      }
    }
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

    console.log(`[CHECK_PENDING] Found ${pendingOrders?.length || 0} orders to check`);
    if (pendingOrders?.length) {
      pendingOrders.forEach(o => console.log(`[CHECK_PENDING] - Order ${o.id} (iiko: ${o.iikoOrderId}, status: ${o.status}, org: ${o.organization?.iikoId})`));
    }

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
