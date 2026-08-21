import { useParams } from "react-router-dom";
import { formatMoney } from "../api/client";
import { useOrder, useCancelOrder } from "../api/hooks";

export function OrderDetailsPage() {
  const { id } = useParams();
  const order = useOrder(id);
  const cancelOrder = useCancelOrder();
  const data = order.data;

  const canCancel = data?.status === "SUBMITTING" || data?.status === "CREATED";

  const handleCancel = async () => {
    if (!id) return;
    const confirmed = window.confirm("Вы уверены, что хотите отменить этот заказ?");
    if (!confirmed) return;
    await cancelOrder.mutateAsync(id);
    // The query invalidation will refresh the data
  };

  if (order.isLoading) return <div className="page-panel">Загрузка...</div>;
  if (!data) return <div className="page-panel">Заказ не найден</div>;

  return (
    <section className="page-panel detail-page">
      <h1>Заказ {data.externalNumber}</h1>
      <div className="detail-grid">
        <div>
          <h2>Клиент</h2>
          <p>{[data.customer.firstName, data.customer.lastName].filter(Boolean).join(" ") || "—"}</p>
          <p>{data.customer.phone}</p>
          <p>{data.customer.email ?? ""}</p>
        </div>
        <div>
          <h2>iiko</h2>
          <p>Order ID: {data.iikoOrderId ?? "—"}</p>
          <p>POS ID: {data.iikoPosId ?? "—"}</p>
          <p>Correlation ID: {data.correlationId ?? "—"}</p>
          <p>Статус: <span className={`status ${data.status.toLowerCase()}`}>{data.status}</span></p>
        </div>
      </div>
      <table className="data-table">
        <thead><tr><th>Позиция</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.id}>
              <td>{item.name}{item.comment && <small> · {item.comment}</small>}</td>
              <td>{item.amount}</td>
              <td>{formatMoney(item.price)}</td>
              <td>{formatMoney(item.price * item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="detail-total">Итого: {formatMoney(data.total)}</div>
      {canCancel && (
        <button
          className="danger-button"
          onClick={handleCancel}
          disabled={cancelOrder.isPending}
        >
          {cancelOrder.isPending ? "Отмена..." : "Отменить заказ"}
        </button>
      )}
    </section>
  );
}
