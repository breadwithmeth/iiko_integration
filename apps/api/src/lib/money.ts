import { CartItem } from "@iiko-call-center/shared";

export function calculateTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => {
    const modifierTotal = (item.modifiers ?? []).reduce((acc, modifier) => {
      return acc + (modifier.price ?? 0) * modifier.amount;
    }, 0);
    return sum + (item.price + modifierTotal) * item.amount;
  }, 0);
}
