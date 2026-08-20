import { describe, expect, it } from "vitest";
import { calculateTotal } from "../lib/money.js";

describe("calculateTotal", () => {
  it("sums item and modifier prices", () => {
    expect(
      calculateTotal([
        { productId: crypto.randomUUID(), name: "Судак", price: 3900, amount: 2, modifiers: [{ productId: crypto.randomUUID(), name: "Соус", amount: 1, price: 300 }] }
      ])
    ).toBe(8400);
  });
});
