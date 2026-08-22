import { useParams } from "react-router-dom";
import { formatMoney } from "../api/client";
import { useOrder, useCancelOrder, usePrintBill, useCloseOrder } from "../api/hooks";

export function OrderDetailsPage() {
  const { id } = useParams();
  const order = useOrder(id);
  const cancelOrder = useCancelOrder();
  const printBill = usePrintBill();
  const closeOrder = useCloseOrder();
  const data = order.data;

  const canCancel = data?.status === "SUBMITTING" || data?.status === "CREATED";
  const canPrintBill = data?.iikoOrderId && data?.status === "CREATED";
  const canCloseOrder = data?.iikoOrderId && (data?.status === "CREATED" || data?.status === "CLOSED");

  const handleCancel = async () => {
    if (!id) return;
    const confirmed = window.confirm("Вы уверены, что хотите отменить этот заказ?");
    if (!confirmed) return;
    await cancelOrder.mutateAsync(id);
  };

  const handlePrintBill = async () => {
    if (!id) return;
    await printBill.mutateAsync(id);
    alert("Чек отправлен на печать");
  };

  const handleCloseOrder = async () => {
    if (!id) return;
    const confirmed = window.confirm("Вы уверены, что хотите закрыть этот заказ?");
    if (!confirmed) return;
    await closeOrder.mutateAsync(id);
    alert("Заказ закрыт");
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
      <div className="detail-actions">
        {canPrintBill && (
          <button
            className="primary-button"
            onClick={handlePrintBill}
            disabled={printBill.isPending}
          >
            {printBill.isPending ? "Печать..." : "🖨 Печать чека"}
          </button>
        )}
        {canCloseOrder && (
          <button
            className="secondary-button"
            onClick={handleCloseOrder}
            disabled={closeOrder.isPending}
          >
            {closeOrder.isPending ? "Закрытие..." : "🔒 Закрыть заказ"}
          </button>
        )}
        {canCancel && (
          <button
            className="danger-button"
            onClick={handleCancel}
            disabled={cancelOrder.isPending}
          >
            {cancelOrder.isPending ? "Отмена..." : "Отменить заказ"}
          </button>
        )}
      </div>
    </section>
  );
}
