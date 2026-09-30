import { useMemo, useState } from "react";
import { Award, Calendar, ChevronDown, Download, Percent, ShoppingCart, UtensilsCrossed, Wallet } from "lucide-react";
import { formatMoney } from "../api/client";
import { useAuthStore } from "../stores/authStore";
import {
  useBonusCategories,
  useBonusOperators,
  useBonusOrders,
  useUsers,
  type BonusOrderRow,
  type BonusOperatorRow
} from "../api/hooks";

type PeriodPreset = "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth" | "thisQuarter" | "custom";
type BonusTab = "orders" | "operators";

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
  if (preset === "custom" || !PRESETS.find((p) => p.value === preset)) {
    return `${dateFrom} – ${dateTo}`;
  }
  return PRESETS.find((p) => p.value === preset)?.label ?? `${dateFrom} – ${dateTo}`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function formatMoney2(value: number): string {
  return new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT" }).format(value);
}

function formatOrderTime(row: BonusOrderRow): string {
  return new Date(row.createdAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function BonusPage() {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === "ADMIN";

  const [tab, setTab] = useState<BonusTab>("orders");
  const [preset, setPreset] = useState<PeriodPreset>("thisMonth");
  const [showCustom, setShowCustom] = useState(false);
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [openDropdown, setOpenDropdown] = useState(false);
  const [operatorId, setOperatorId] = useState("");

  const { dateFrom, dateTo } = useMemo(() => {
    if (preset === "custom") {
      return { dateFrom: customDateFrom, dateTo: customDateTo };
    }
    return getPresetDates(preset);
  }, [preset, customDateFrom, customDateTo]);

  const categories = useBonusCategories();
  const orders = useBonusOrders(dateFrom || undefined, dateTo || undefined, operatorId || undefined);
  const operators = useBonusOperators(dateFrom || undefined, dateTo || undefined, operatorId || undefined);
  const users = useUsers(isAdmin);

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

  const isLoading = (tab === "orders" ? orders.isLoading : operators.isLoading) && !(tab === "orders" ? orders.data : operators.data);
  const kitchen = (tab === "orders" ? orders.data?.kitchen : operators.data?.kitchen) ?? categories.data;

  const periodLabel = formatPeriodLabel(preset, dateFrom, dateTo);

  function exportOrdersCSV(data: BonusOrderRow[]) {
    const period = preset === "custom" ? `${dateFrom}-${dateTo}` : preset;
    downloadCSV(
      `kitchen-bonus-orders-${period}.csv`,
      ["Дата и время заказа", "Номер заказа", "ФИ оператора", "Категории кухни", "Кол-во уникальных категорий", "Сумма блюд кухни", "Примененный %", "Итоговый бонус оператора"],
      data.map((row) => [
        formatOrderTime(row),
        row.externalNumber,
        row.operator.name,
        row.categories.join(", "),
        String(row.uniqueCategories),
        row.kitchenSum.toFixed(2),
        `${row.percent}%`,
        row.bonus.toFixed(2)
      ])
    );
  }

  function exportOperatorsCSV(data: BonusOperatorRow[]) {
    const period = preset === "custom" ? `${dateFrom}-${dateTo}` : preset;
    downloadCSV(
      `kitchen-bonus-operators-${period}.csv`,
      ["ФИО оператора", "Всего оформлено заказов с кухней", "Общая сумма продаж кухни", "Сумма всех бонусов по заказам оператора", "Итого начислено бонусов по кухне (сумма к выплате)"],
      data.map((row) => [
        row.operator.name,
        String(row.ordersWithKitchen),
        row.kitchenSalesTotal.toFixed(2),
        row.bonusesTotal.toFixed(2),
        row.payoutTotal.toFixed(2)
      ])
    );
  }

  return (
    <section className="page-panel">
      <div className="page-header">
        <h1><UtensilsCrossed size={24} /> Бонусы кухни</h1>
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
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                />
              </label>
              <label>
                <span>До</span>
                <input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  min={customDateFrom}
                />
              </label>
            </div>
          )}
          {isAdmin && (
            <select value={operatorId} onChange={(e) => setOperatorId(e.target.value)} aria-label="Оператор">
              <option value="">Все операторы</option>
              {(users.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {kitchen && !kitchen.found && (
        <div className="bonus-warning">
          Группа «{kitchen.rootGroupName}» не найдена в номенклатуре iiko. Синхронизируйте меню
          (Настройки → iiko) и проверьте название группы в переменной KITCHEN_ROOT_GROUP_NAME.
        </div>
      )}

      {kitchen?.found && kitchen.categories.length > 0 && (
        <div className="bonus-categories">
          <span className="bonus-categories-label">Категории кухни:</span>
          {kitchen.categories.map((category) => (
            <span key={category} className="bonus-chip">{category}</span>
          ))}
        </div>
      )}

      <div className="tab-switch">
        <button className={`tab-button ${tab === "orders" ? "active" : ""}`} onClick={() => setTab("orders")}>
          <ShoppingCart size={16} /> По заказам
        </button>
        <button className={`tab-button ${tab === "operators" ? "active" : ""}`} onClick={() => setTab("operators")}>
          <Award size={16} /> По операторам
        </button>
      </div>

      {isLoading ? (
        <div className="loading">Загрузка...</div>
      ) : tab === "orders" ? (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <ShoppingCart size={24} />
              <div className="stat-info">
                <span className="stat-value">{orders.data?.summary.ordersCount ?? 0}</span>
                <span className="stat-label">Заказов с кухней</span>
              </div>
            </div>
            <div className="stat-card">
              <UtensilsCrossed size={24} />
              <div className="stat-info">
                <span className="stat-value">{formatMoney(orders.data?.summary.kitchenSalesTotal ?? 0)}</span>
                <span className="stat-label">Сумма блюд кухни</span>
              </div>
            </div>
            <div className="stat-card highlight">
              <Percent size={24} />
              <div className="stat-info">
                <span className="stat-value upt-value">{formatMoney(orders.data?.summary.bonusesTotal ?? 0)}</span>
                <span className="stat-label">Сумма бонусов</span>
              </div>
            </div>
          </div>

          <div className="operator-stats">
            <div className="table-header">
              <h2>Детальный отчет по заказам</h2>
              <button
                className="secondary-button"
                disabled={(orders.data?.items.length ?? 0) === 0}
                onClick={() => exportOrdersCSV(orders.data?.items ?? [])}
              >
                <Download size={16} /> Экспорт CSV
              </button>
            </div>
            {(orders.data?.items.length ?? 0) === 0 ? (
              <div className="empty-state">Нет заказов с блюдами кухни за выбранный период</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Дата и время заказа</th>
                    <th>Номер заказа</th>
                    <th>ФИ оператора</th>
                    <th>Категории кухни</th>
                    <th>Уник. категорий</th>
                    <th>Сумма блюд кухни</th>
                    <th>Примененный %</th>
                    <th>Итоговый бонус</th>
                  </tr>
                </thead>
                <tbody>
                  {(orders.data?.items ?? []).map((row, index) => (
                    <tr key={row.orderId} className={index % 2 === 0 ? "even" : "odd"}>
                      <td>{formatDateTime(row.createdAt)}</td>
                      <td>{row.externalNumber}</td>
                      <td>{row.operator.name}</td>
                      <td>{row.categories.join(", ")}</td>
                      <td className="orders-count">{row.uniqueCategories}</td>
                      <td className="amount">{formatMoney(row.kitchenSum)}</td>
                      <td className="orders-count">{row.percent}%</td>
                      <td className="amount bonus-cell">{formatMoney2(row.bonus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <ShoppingCart size={24} />
              <div className="stat-info">
                <span className="stat-value">{operators.data?.summary.ordersWithKitchen ?? 0}</span>
                <span className="stat-label">Заказов с кухней</span>
              </div>
            </div>
            <div className="stat-card">
              <UtensilsCrossed size={24} />
              <div className="stat-info">
                <span className="stat-value">{formatMoney(operators.data?.summary.kitchenSalesTotal ?? 0)}</span>
                <span className="stat-label">Продажи кухни</span>
              </div>
            </div>
            <div className="stat-card highlight">
              <Wallet size={24} />
              <div className="stat-info">
                <span className="stat-value upt-value">{formatMoney(operators.data?.summary.payoutTotal ?? 0)}</span>
                <span className="stat-label">Итого к выплате</span>
              </div>
            </div>
          </div>

          <div className="operator-stats">
            <div className="table-header">
              <h2>Сводный отчет по операторам (для начисления ЗП)</h2>
              <button
                className="secondary-button"
                disabled={(operators.data?.items.length ?? 0) === 0}
                onClick={() => exportOperatorsCSV(operators.data?.items ?? [])}
              >
                <Download size={16} /> Экспорт CSV
              </button>
            </div>
            {(operators.data?.items.length ?? 0) === 0 ? (
              <div className="empty-state">Нет данных по бонусам за выбранный период</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ФИО оператора</th>
                    <th>Заказов с кухней</th>
                    <th>Продажи кухни</th>
                    <th>Сумма бонусов</th>
                    <th>Итого к выплате</th>
                  </tr>
                </thead>
                <tbody>
                  {(operators.data?.items ?? []).map((row, index) => (
                    <tr key={row.operator.id} className={index % 2 === 0 ? "even" : "odd"}>
                      <td>{row.operator.name}</td>
                      <td className="orders-count">{row.ordersWithKitchen}</td>
                      <td className="amount">{formatMoney(row.kitchenSalesTotal)}</td>
                      <td className="amount">{formatMoney2(row.bonusesTotal)}</td>
                      <td className="amount bonus-cell">{formatMoney2(row.payoutTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </section>
  );
}
