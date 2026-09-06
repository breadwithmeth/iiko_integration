import { useState } from "react";
import { BarChart3, Calendar, Download, TrendingUp, Users } from "lucide-react";
import { formatMoney } from "../api/client";
import { useOrderStats, type OrderStatsResponse } from "../api/hooks";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  SUBMITTING: "Отправка",
  CREATED: "Создан",
  FAILED: "Ошибка",
  UNKNOWN: "Неизвестен",
  CANCELLED: "Отменен",
  CLOSED: "Закрыт"
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "status-draft",
  SUBMITTING: "status-submitting",
  CREATED: "status-created",
  FAILED: "status-failed",
  UNKNOWN: "status-unknown",
  CANCELLED: "status-cancelled",
  CLOSED: "status-closed"
};

export function StatisticsPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const stats = useOrderStats(date);

  const data = stats.data;
  const isLoading = stats.isLoading;

  if (isLoading && !data) {
    return (
      <section className="page-panel">
        <h1>Статистика заказов</h1>
        <div className="loading">Загрузка...</div>
      </section>
    );
  }

  const summary = data?.summary ?? { totalOrders: 0, totalAmount: 0, ordersByStatus: {} };
  const byOperator = data?.byOperator ?? [];

  return (
    <section className="page-panel">
      <div className="page-header">
        <h1><BarChart3 size={24} /> Статистика заказов</h1>
        <div className="filters">
          <label>
            <Calendar size={16} /> Дата
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
            />
          </label>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <TrendingUp size={24} />
          <div className="stat-info">
            <span className="stat-value">{summary.totalOrders}</span>
            <span className="stat-label">Всего заказов</span>
          </div>
        </div>
        <div className="stat-card highlight">
          <BarChart3 size={24} />
          <div className="stat-info">
            <span className="stat-value">{formatMoney(summary.totalAmount)}</span>
            <span className="stat-label">Общая сумма</span>
          </div>
        </div>
        <div className="stat-card">
          <Users size={24} />
          <div className="stat-info">
            <span className="stat-value">{byOperator.length}</span>
            <span className="stat-label">Операторов</span>
          </div>
        </div>
      </div>

      {/* Status Distribution */}
      <div className="status-distribution">
        <h2>Распределение по статусам</h2>
        <div className="status-chips">
          {Object.entries(summary.ordersByStatus).map(([status, count]) => (
            <span key={status} className={`status-chip ${STATUS_COLORS[status] || ""}`}>
              {STATUS_LABELS[status] || status}: {count}
            </span>
          ))}
          {Object.keys(summary.ordersByStatus).length === 0 && (
            <span className="status-chip empty">Нет данных</span>
          )}
        </div>
      </div>

      {/* Operator Stats Table */}
      <div className="operator-stats">
        <div className="table-header">
          <h2>Статистика по операторам</h2>
          <button className="secondary-button" onClick={() => exportToCSV(byOperator, date)}>
            <Download size={16} /> Экспорт CSV
          </button>
        </div>
        {byOperator.length === 0 ? (
          <div className="empty-state">Нет данных за выбранную дату</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Оператор</th>
                <th>Email</th>
                <th>Заказов</th>
                <th>Сумма</th>
                <th>Статусы</th>
              </tr>
            </thead>
            <tbody>
              {byOperator.map((op, index) => (
                <tr key={op.operator.id} className={index % 2 === 0 ? "even" : "odd"}>
                  <td>{op.operator.name}</td>
                  <td>{op.operator.email}</td>
                  <td className="orders-count">{op.totalOrders}</td>
                  <td className="amount">{formatMoney(op.totalAmount)}</td>
                  <td>
                    <div className="status-mini-chips">
                      {Object.entries(op.ordersByStatus).map(([status, count]) => (
                        <span key={status} className={`status-mini ${STATUS_COLORS[status] || ""}`}>
                          {STATUS_LABELS[status] || status}: {count}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function exportToCSV(data: OrderStatsResponse["byOperator"], date: string) {
  const headers = ["Оператор", "Email", "Кол-во заказов", "Сумма", "Статусы"];
  const rows = data.map((op) => [
    op.operator.name,
    op.operator.email,
    String(op.totalOrders),
    String(op.totalAmount / 100), // Convert from kopecks to rubles
    Object.entries(op.ordersByStatus)
      .map(([status, count]) => `${STATUS_LABELS[status] || status}: ${count}`)
      .join("; ")
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `order-stats-${date}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}