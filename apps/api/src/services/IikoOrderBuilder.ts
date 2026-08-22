import type { CartItem, CustomerInput } from "@iiko-call-center/shared";
import type { IikoOrderCreateRequest } from "../types/iiko.js";
import { normalizePhone } from "../lib/phone.js";

interface BuildInput {
  orderId: string;
  externalNumber: string;
  organizationId: string;
  terminalGroupId: string;
  orderTypeId: string;
  priceCategoryId?: string;
  customer: CustomerInput;
  items: CartItem[];
  payment: {
    paymentTypeId: string;
    paymentTypeKind: string;
    sum: number;
  };
}

export class IikoOrderBuilder {
  build(input: BuildInput): IikoOrderCreateRequest {
    return {
      organizationId: input.organizationId,
      terminalGroupId: input.terminalGroupId,
      
      order: {
        id: input.orderId,
        externalNumber: input.externalNumber,
        customer: {
          name: input.customer.firstName,
          surname: input.customer.lastName,
          email: input.customer.email,
          comment: input.customer.comment,
          shouldReceivePromoActionsInfo: false,
          shouldReceiveOrderStatusNotifications: true,
          gender: "NotSpecified",
          type: "regular"
        },
        phone: normalizePhone(input.customer.phone),
        guestCount: 1,
        guests: { count: 1 },
        tabName: `Заказ ${input.externalNumber}`,
        menuId: null,
        priceCategoryId: input.priceCategoryId,
        items: input.items.map((item) => ({
          type: "Product",
          productId: item.productId,
          price: item.price,
          amount: item.amount,
          productSizeId: item.productSizeId ?? undefined,
          comment: item.comment?.trim() || undefined,
          modifiers: item.modifiers?.map((modifier) => ({
            productId: modifier.productId,
            amount: modifier.amount,
            price: modifier.price
          }))
        })),
        payments: [
          {
            paymentTypeKind: input.payment.paymentTypeKind,
            sum: input.payment.sum,
            paymentTypeId: input.payment.paymentTypeId,
            isProcessedExternally: false,
            isFiscalizedExternally: false,
            isPrepay: false
          }
        ],
        orderTypeId: input.orderTypeId,
        chequeAdditionalInfo: {
          needReceipt: true,
          isInternetPayment: true
        }
      },
      createOrderSettings: {
        servicePrint: true,
        transportToFrontTimeout: 1,
        checkStopList: true
      }
    };
  }
}
