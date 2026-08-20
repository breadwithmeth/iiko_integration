import { Minus, Plus, Trash2 } from "lucide-react";
import { formatMoney } from "../api/client";
import { useCartStore } from "../stores/cartStore";

export function CartPanel({ disabled, onSubmit }: { disabled?: boolean; onSubmit: () => void }) {
  const items = useCartStore((state) => state.items);
  const setAmount = useCartStore((state) => state.setAmount);
  const setComment = useCartStore((state) => state.setComment);
  const remove = useCartStore((state) => state.remove);
  const total = useCartStore((state) => state.total());

  return (
    <aside className="cart-panel">
      <div className="panel-title">Текущий заказ</div>
      <div className="cart-items">
        {items.length === 0 && <div className="empty-state">Корзина пуста</div>}
        {items.map((item) => (
          <div className="cart-item" key={`${item.productId}-${item.productSizeId ?? "base"}`}>
            <div className="cart-item-head">
              <div>
                <strong>{item.name}</strong>
                <span>{formatMoney(item.price)}</span>
              </div>
              <button className="icon-button" onClick={() => remove(item.productId)} title="Удалить"><Trash2 size={16} /></button>
            </div>
            <div className="quantity-row">
              <button className="icon-button" onClick={() => setAmount(item.productId, item.amount - 1)} title="Уменьшить"><Minus size={16} /></button>
              <input value={item.amount} onChange={(event) => setAmount(item.productId, Number(event.target.value) || 0)} aria-label="Количество" />
              <button className="icon-button" onClick={() => setAmount(item.productId, item.amount + 1)} title="Увеличить"><Plus size={16} /></button>
            </div>
            <textarea placeholder="Комментарий к позиции" value={item.comment ?? ""} onChange={(event) => setComment(item.productId, event.target.value)} />
          </div>
        ))}
      </div>
      <div className="cart-total">
        <span>Итого</span>
        <strong>{formatMoney(total)}</strong>
      </div>
      <button className="primary-button wide" disabled={disabled || items.length === 0} onClick={onSubmit}>
        Оформить заказ
      </button>
    </aside>
  );
}
