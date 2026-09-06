import { useState, useMemo } from "react";
import { BarChart3, Calendar, Download, TrendingUp, Users, ChevronDown } from "lucide-react";
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

export function StatisticsPage() {
  const [preset, setPreset] = useState<PeriodPreset>("thisMonth");
  const [showCustom, setShowCustom] = useState(false);
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [openDropdown, setOpenDropdown] = useState(false);

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