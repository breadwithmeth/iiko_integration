import { describe, expect, it } from "vitest";
import { IikoOrderBuilder } from "../services/IikoOrderBuilder.js";

describe("IikoOrderBuilder", () => {
  it("builds iiko create order payload with product IDs and stop-list check", () => {
    const productId = crypto.randomUUID();
    const payload = new IikoOrderBuilder().build({
      orderId: crypto.randomUUID(),
      externalNumber: "CALL-20260820-000001",
      organizationId: crypto.randomUUID(),
      terminalGroupId: crypto.randomUUID(),
      orderTypeId: crypto.randomUUID(),
      customer: { phone: "+7 777 123 45 67", firstName: "Сергей" },
      items: [{ productId, name: "Филе судака", price: 3900, amount: 2, comment: "Без лука" }],
      payment: { paymentTypeId: crypto.randomUUID(), paymentTypeKind: "Cash", sum: 7800 }
    });

    expect(payload.order.phone).toBe("+77771234567");
    expect(payload.order.items[0]).toMatchObject({ type: "Product", productId, price: 3900, amount: 2, comment: "Без лука" });
    expect(payload.order.tabName).toBe("Заказ CALL-20260820-000001");
    expect(payload.order.menuId).toBeNull();
    expect(payload.order.customer.shouldReceivePromoActionsInfo).toBe(false);
    expect(payload.order.customer.shouldReceiveOrderStatusNotifications).toBe(true);
    expect(payload.order.customer.gender).toBe("NotSpecified");
    expect(payload.order.customer.type).toBe("regular");
    expect(payload.createOrderSettings.checkStopList).toBe(true);
    expect(payload.createOrderSettings.servicePrint).toBe(true);
    expect(payload.createOrderSettings.transportToFrontTimeout).toBe(1);
  });
});
