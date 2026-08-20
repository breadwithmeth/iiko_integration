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
    expect(payload.order.items[0]).toMatchObject({ type: "Product", productId, amount: 2, comment: "Без лука" });
    expect(payload.createOrderSettings.checkStopList).toBe(true);
  });
});
