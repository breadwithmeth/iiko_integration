import { useState, useMemo, Fragment } from "react";
import { BarChart3, Calendar, Download, TrendingUp, Users, ChevronDown, ChevronRight, Package, Clock, User, CreditCard, Truck, MapPin } from "lucide-react";
import { formatMoney } from "../api/client";
import { useOrderStats, useOperatorOrders, type OrderStatsResponse, type OrderDto } from "../api/hooks";

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

type PeriodPreset = "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth" | "thisQuarter" | "custom";

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "today", label: "Сегодня" },
  { value: "yesterday", label: "Вчера" },
  { value: "last7", label: "Последние 7 дней" },
  { value: "thisMonth", label: "Этот месяц" },
  { value: "lastMonth", label: "Прошлый месяц" },
  { value: "thisQuarter", label: "Этот квартал" },
  { value: "custom", label: "Произвольный период" }
];

function getPresetDates(preset: PeriodPreset): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  switch (preset) {
    case "today":
      return { dateFrom: today, dateTo: today };
    case "yesterday": {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const d = yesterday.toISOString().slice(0, 10);
      return { dateFrom: d, dateTo: d };
    }
    case "last7": {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 6);
      return { dateFrom: weekAgo.toISOString().slice(0, 10), dateTo: today };
    }
    case "thisMonth": {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      return { dateFrom: firstDay.toISOString().slice(0, 10), dateTo: today };
    }
    case "lastMonth": {
      const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDayLastMonth = new Date(firstDayThisMonth);
      lastDayLastMonth.setDate(lastDayLastMonth.getDate() - 1);
      const firstDayLastMonth = new Date(lastDayLastMonth.getFullYear(), lastDayLastMonth.getMonth(), 1);
      return { dateFrom: firstDayLastMonth.toISOString().slice(0, 10), dateTo: lastDayLastMonth.toISOString().slice(0, 10) };
    }
    case "thisQuarter": {
      const quarter = Math.floor(now.getMonth() / 3);
      const firstDay = new Date(now.getFullYear(), quarter * 3, 1);
      return { dateFrom: firstDay.toISOString().slice(0, 10), dateTo: today };
    }
    case "custom":
    default:
      return { dateFrom: today, dateTo: today };
  }
}

function formatPeriodLabel(preset: PeriodPreset, dateFrom: string, dateTo: string): string {
  if (preset === "custom" || !PRESETS.find(p => p.value === preset)) {
    return `${dateFrom} – ${dateTo}`;
  }
  return PRESETS.find(p => p.value === preset)?.label ?? `${dateFrom} – ${dateTo}`;
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

// Component for a single operator row with expandable orders
interface OperatorRowProps {
  op: OrderStatsResponse["byOperator"][0];
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  dateFrom?: string;
  dateTo?: string;
  expandedOrders: Set<string>;
  onToggleOrder: (orderId: string) => void;
}

function OperatorRow({ op, index, isExpanded, onToggle, dateFrom, dateTo, expandedOrders, onToggleOrder }: OperatorRowProps) {
  const operatorOrders = useOperatorOrders(op.operator.id, dateFrom, dateTo);
  const orders = operatorOrders.data?.items ?? [];
  const isLoadingOrders = operatorOrders.isLoading;

  return (
    <Fragment key={op.operator.id}>
      <tr className={`${index % 2 === 0 ? "even" : "odd"} operator-row ${isExpanded ? "expanded" : ""}`} onClick={onToggle}>
        <td className="expand-cell">
          <ChevronRight size={16} className={isExpanded ? "rotated" : ""} />
        </td>
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
      {isExpanded && (
        <tr className="operator-detail-row">
          <td colSpan={6}>
            <div className="operator-detail">
              {isLoadingOrders ? (
                <div className="loading-inline">Загрузка заказов...</div>
              ) : orders.length === 0 ? (
                <div className="empty-state">У оператора нет заказов за этот период</div>
              ) : (
                <table className="orders-table">
                  <thead>
                    <tr>
                      <th style={{ width: "40px" }}></th>
                      <th>№ заказа</th>
                      <th>Время</th>
                      <th>Клиент</th>
                      <th>Статус</th>
                      <th>Сумма</th>
                      <th>Оплата</th>
                      <th>Тип заказа</th>
                      <th>Терминал</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order, orderIndex) => {
                      const isOrderExpanded = expandedOrders.has(order.id);
                      return (
                        <Fragment key={order.id}>
                          <tr className={`${orderIndex % 2 === 0 ? "even" : "odd"} order-row ${isOrderExpanded ? "expanded" : ""}`} onClick={(e) => { e.stopPropagation(); onToggleOrder(order.id); }}>
                            <td className="expand-cell">
                              <ChevronRight size={16} className={isOrderExpanded ? "rotated" : ""} />
                            </td>
                            <td className="order-number">{order.externalNumber}</td>
                            <td className="order-time">{formatDateTime(order.createdAt)}</td>
                            <td className="order-customer">
                              <div className="customer-name">
                                {order.customer.firstName} {order.customer.lastName}
                              </div>
                              <div className="customer-phone">{order.customer.phone}</div>
                            </td>
                            <td>
                              <span className={`status-chip ${STATUS_COLORS[order.status] || ""}`}>
                                {STATUS_LABELS[order.status] || order.status}
                              </span>
                            </td>
                            <td className="order-amount">{formatMoney(order.total)}</td>
                            <td>{order.paymentType?.name ?? "—"}</td>
                            <td>{order.orderType?.name ?? "—"}</td>
                            <td>{order.terminalGroup?.name ?? "—"}</td>
                          </tr>
                          {isOrderExpanded && (
                            <tr className="order-detail-row">
                              <td colSpan={9}>
                                <div className="order-detail">
                                  <div className="order-info-grid">
                                    <div className="order-info-item">
                                      <User size={16} /> <span>Клиент: {order.customer.firstName} {order.customer.lastName} ({order.customer.phone})</span>
                                    </div>
                                    <div className="order-info-item">
                                      <Clock size={16} /> <span>Создан: {formatDateTime(order.createdAt)}</span>
                                    </div>
                                    <div className="order-info-item">
                                      <CreditCard size={16} /> <span>Оплата: {order.paymentType?.name ?? "—"}</span>
                                    </div>
                                    <div className="order-info-item">
                                      <Truck size={16} /> <span>Доставка: {order.orderType?.name ?? "—"}</span>
                                    </div>
                                    <div className="order-info-item">
                                      <MapPin size={16} /> <span>Организация: {order.organization?.name ?? "—"}</span>
                                    </div>
                                    <div className="order-info-item">
                                      <MapPin size={16} /> <span>Терминал: {order.terminalGroup?.name ?? "—"}</span>
                                    </div>
                                  </div>
                                  <div className="order-items">
                                    <h4><Package size={16} /> Товары в заказе ({order.items.length})</h4>
                                    <table className="items-table">
                                      <thead>
                                        <tr>
                                          <th>Название</th>
                                          <th>Кол-во</th>
                                          <th>Цена</th>
                                          <th>Сумма</th>
                                          {order.items.some(item => item.comment) && <th>Комментарий</th>}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {order.items.map((item, itemIndex) => (
                                          <tr key={item.id} className={itemIndex % 2 === 0 ? "even" : "odd"}>
                                            <td>{item.name}</td>
                                            <td className="text-center">{item.amount}</td>
                                            <td className="text-right">{formatMoney(item.price)}</td>
                                            <td className="text-right">{formatMoney(item.price * item.amount)}</td>
                                            {item.comment && <td>{item.comment}</td>}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export function StatisticsPage() {
  const [preset, setPreset] = useState<PeriodPreset>("thisMonth");
  const [showCustom, setShowCustom] = useState(false);
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [openDropdown, setOpenDropdown] = useState(false);
  const [expandedOperators, setExpandedOperators] = useState<Set<string>>(new Set());
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  // Initialize custom dates when switching to custom mode
  const { dateFrom, dateTo } = useMemo(() => {
    if (preset === "custom") {
      return { dateFrom: customDateFrom, dateTo: customDateTo };
    }
    return getPresetDates(preset);
  }, [preset, customDateFrom, customDateTo]);

  const stats = useOrderStats(dateFrom || undefined, dateTo || undefined);

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

  const handlePresetChange = (newPreset: PeriodPreset) => {
    setPreset(newPreset);
    setOpenDropdown(false);
    setExpandedOperators(new Set());
    setExpandedOrders(new Set());
    if (newPreset === "custom") {
      setShowCustom(true);
      const dates = getPresetDates("thisMonth");
      setCustomDateFrom(dates.dateFrom);
      setCustomDateTo(dates.dateTo);
    } else {
      setShowCustom(false);
    }
  };

  const handleCustomDateChange = (from: string, to: string) => {
    setCustomDateFrom(from);
    setCustomDateTo(to);
    setExpandedOperators(new Set());
    setExpandedOrders(new Set());
  };

  const toggleOperator = (operatorId: string) => {
    setExpandedOperators(prev => {
      const next = new Set(prev);
      if (next.has(operatorId)) {
        next.delete(operatorId);
      } else {
        next.add(operatorId);
      }
      return next;
    });
  };

  const toggleOrder = (orderId: string) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const periodLabel = formatPeriodLabel(preset, dateFrom, dateTo);

  return (
    <section className="page-panel">
      <div className="page-header">
        <h1><BarChart3 size={24} /> Статистика заказов</h1>
        <div className="filters">
          <div className="period-selector">
            <div className="period-trigger" onClick={() => setOpenDropdown(!openDropdown)}>
              <Calendar size={16} />
              <span>{periodLabel}</span>
              <ChevronDown size={16} className={openDropdown ? "rotated" : ""} />
            </div>
            {openDropdown && (
              <div className="period-dropdown" onClick={(e) => e.stopPropagation()}>
                {PRESETS.map((p) => (
                  <button
                    key={p.value}
                    className={`period-option ${preset === p.value ? "active" : ""}`}
                    onClick={() => handlePresetChange(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {showCustom && (
            <div className="custom-date-inputs">
              <label>
                <span>От</span>
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => handleCustomDateChange(e.target.value, customDateTo)}
                  max={new Date().toISOString().slice(0, 10)}
                />
              </label>
              <label>
                <span>До</span>
                <input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => handleCustomDateChange(customDateFrom, e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  min={customDateFrom}
                />
              </label>
            </div>
          )}
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
          <button className="secondary-button" onClick={() => exportToCSV(byOperator, preset, dateFrom, dateTo)}>
            <Download size={16} /> Экспорт CSV
          </button>
        </div>
        {byOperator.length === 0 ? (
          <div className="empty-state">Нет данных за выбранный период</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: "40px" }}></th>
                <th>Оператор</th>
                <th>Email</th>
                <th>Заказов</th>
                <th>Сумма</th>
                <th>Статусы</th>
              </tr>
            </thead>
            <tbody>
              {byOperator.map((op, index) => (
                <OperatorRow
                  key={op.operator.id}
                  op={op}
                  index={index}
                  isExpanded={expandedOperators.has(op.operator.id)}
                  onToggle={() => toggleOperator(op.operator.id)}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  expandedOrders={expandedOrders}
                  onToggleOrder={toggleOrder}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function exportToCSV(
  data: OrderStatsResponse["byOperator"],
  preset: PeriodPreset,
  dateFrom: string,
  dateTo: string
) {
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

  const periodSuffix = preset === "custom" ? `${dateFrom}-${dateTo}` : preset;
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `order-stats-${periodSuffix}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}