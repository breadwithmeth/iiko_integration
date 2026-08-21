import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatMoney } from "../api/client";
import { useOrders, useCancelOrder } from "../api/hooks";

export function OrdersPage() {
  const [filters, setFilters] = useState({ date: "", phone: "", externalNumber: "", status: "" });
  const [applied, setApplied] = useState(new URLSearchParams());
  const orders = useOrders(applied);
  const cancelOrder = useCancelOrder();

  function apply(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    setApplied(params);
  }

  const items = useMemo(() => orders.data?.items ?? [], [orders.data]);

  const canCancel = (status: string) => status === "SUBMITTING" || status === "CREATED";

  const handleCancel = async (orderId: string) => {
    const confirmed = window.confirm("Вы уверены, что хотите отменить этот заказ?");
    if (!confirmed) return;
    await cancelOrder.mutateAsync(orderId);
  };

  return (
    <section className="page-panel">
      <h1>История заказов</h1>
      <form className="filters" onSubmit={apply}>
        <input type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} />
        <input placeholder="Телефон" value={filters.phone} onChange={(event) => setFilters({ ...filters, phone: event.target.value })} />
        <input placeholder="№ заказа" value={filters.externalNumber} onChange={(event) => setFilters({ ...filters, externalNumber: event.target.value })} />
        <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
          <option value="">Все статусы</option>
          {["DRAFT", "SUBMITTING", "CREATED", "FAILED", "UNKNOWN", "CANCELLED"].map((status) => <option key={status}>{status}</option>)}
        </select>
        <button className="secondary-button">Фильтр</button>
      </form>
      <table className="data-table">
        <thead>
          <tr><th>Дата</th><th>№ заказа</th><th>Клиент</th><th>Телефон</th><th>Сумма</th><th>Статус</th><th>iiko ID</th><th></th></tr>
        </thead>
        <tbody>
          {items.map((order) => (
            <tr key={order.id}>
              <td>{new Date(order.createdAt).toLocaleString("ru-KZ")}</td>
              <td><Link to={`/orders/${order.id}`}>{order.externalNumber}</Link></td>
              <td>{[order.customer.firstName, order.customer.lastName].filter(Boolean).join(" ") || "—"}</td>
              <td>{order.customer.phone}</td>
              <td>{formatMoney(order.total)}</td>
              <td><span className={`status ${order.status.toLowerCase()}`}>{order.status}</span></td>
              <td>{order.iikoOrderId ?? "—"}</td>
              <td>
                {canCancel(order.status) && (
                  <button
                    className="danger-button"
                    onClick={() => handleCancel(order.id)}
                    disabled={cancelOrder.isPending}
                  >
                    {cancelOrder.isPending ? "Отмена..." : "Отменить"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
