import { create } from "zustand";
import type { CartItem } from "@iiko-call-center/shared";

interface CartState {
  items: CartItem[];
  add: (item: CartItem) => void;
  setAmount: (productId: string, amount: number) => void;
  setComment: (productId: string, comment: string) => void;
  remove: (productId: string) => void;
  clear: () => void;
  total: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  add: (item) =>
    set((state) => {
      const existing = state.items.find((candidate) => candidate.productId === item.productId && candidate.productSizeId === item.productSizeId);
      if (existing) {
        return { items: state.items.map((candidate) => (candidate === existing ? { ...candidate, amount: candidate.amount + 1 } : candidate)) };
      }
      return { items: [...state.items, item] };
    }),
  setAmount: (productId, amount) =>
    set((state) => ({
      items: state.items
        .map((item) => (item.productId === productId ? { ...item, amount: Math.max(0, amount) } : item))
        .filter((item) => item.amount > 0)
    })),
  setComment: (productId, comment) => set((state) => ({ items: state.items.map((item) => (item.productId === productId ? { ...item, comment } : item)) })),
  remove: (productId) => set((state) => ({ items: state.items.filter((item) => item.productId !== productId) })),
  clear: () => set({ items: [] }),
  total: () =>
    get().items.reduce((sum, item) => {
      const modifiers = (item.modifiers ?? []).reduce((acc, modifier) => acc + (modifier.price ?? 0) * modifier.amount, 0);
      return sum + (item.price + modifiers) * item.amount;
    }, 0)
}));
