import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";

/** Максимальный порог бонуса — 5% при 5 и более категориях */
export const MAX_KITCHEN_BONUS_PERCENT = 5;

/** Значение денежного поля Prisma Decimal(12,2) — допускаем number | string | Decimal */
export type NumericLike = number | string | { toString(): string };

export interface KitchenCategoryConfig {
  /** Категории найдены (по корневой группе или по явному списку имен) */
  found: boolean;
  /** iiko id корневой группы; null — используется явный список имен или группа не найдена */
  rootGroupId: string | null;
  rootGroupName: string;
  /** groupId группы -> название кухонной категории */
  categoryByGroupId: Map<string, string>;
  /** все группы номенклатуры — для подъема по цепочке родителей */
  groupById: Map<string, { groupId: string; name: string; parentGroupId: string | null }>;
}

export interface KitchenCategoryInfo {
  found: boolean;
  rootGroupName: string;
  categories: string[];
}

/**
 * Загружает из кэша номенклатуры конфигурацию кухонных категорий.
 * Приоритет: явный список имен (KITCHEN_CATEGORY_NAMES), затем подгруппы
 * корневой группы (KITCHEN_ROOT_GROUP_NAME, по умолчанию «Кухня»).
 */
export async function loadKitchenCategoryConfig(): Promise<KitchenCategoryConfig> {
  const groups = await prisma.productGroup.findMany({
    select: { groupId: true, name: true, parentGroupId: true }
  });
  const groupById = new Map(groups.map((g) => [g.groupId, g]));

  const explicitNames = env.KITCHEN_CATEGORY_NAMES.split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const config: KitchenCategoryConfig = {
    found: false,
    rootGroupId: null,
    rootGroupName: env.KITCHEN_ROOT_GROUP_NAME,
    categoryByGroupId: new Map(),
    groupById
  };

  if (explicitNames.length > 0) {
    const byLowerName = new Map(explicitNames.map((name) => [name.toLowerCase(), name]));
    for (const group of groups) {
      const displayName = byLowerName.get(group.name.trim().toLowerCase());
      if (displayName) config.categoryByGroupId.set(group.groupId, displayName);
    }
    config.found = config.categoryByGroupId.size > 0;
    return config;
  }

  const rootName = env.KITCHEN_ROOT_GROUP_NAME.trim().toLowerCase();
  const root = groups.find((g) => g.name.trim().toLowerCase() === rootName);
  if (root) {
    config.rootGroupId = root.groupId;
    config.rootGroupName = root.name;
    for (const group of groups) {
      if (group.parentGroupId === root.groupId) {
        config.categoryByGroupId.set(group.groupId, group.name);
      }
    }
    config.found = true;
  }
  return config;
}

export function getKitchenCategoryInfo(config: KitchenCategoryConfig): KitchenCategoryInfo {
  return {
    found: config.found,
    rootGroupName: config.rootGroupName,
    categories: [...config.categoryByGroupId.values()].sort((a, b) => a.localeCompare(b, "ru"))
  };
}

/**
 * Определяет кухонную категорию позиции по группе товара:
 * поднимаемся по цепочке родителей — позиция кухонная, если среди
 * предков есть прямая дочерняя группа корня «Кухня».
 */
export function resolveKitchenCategory(
  parentGroupId: string | null | undefined,
  config: KitchenCategoryConfig
): string | null {
  if (!parentGroupId || config.categoryByGroupId.size === 0) return null;
  let currentId: string | null | undefined = parentGroupId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const category = config.categoryByGroupId.get(currentId);
    if (category) return category;
    currentId = config.groupById.get(currentId)?.parentGroupId ?? null;
  }
  return null;
}

export interface BonusKitchenItem {
  name: string;
  price: NumericLike;
  amount: NumericLike;
  category: string;
}

export interface OrderBonusCalculation {
  /** Сумма позиций кухни в копейках */
  kitchenSum: number;
  /** Уникальные категории, по алфавиту */
  categories: string[];
  uniqueCategories: number;
  /** Примененный процент 0..5 */
  percent: number;
  /** Бонус в копейках */
  bonus: number;
}

/**
 * Расчет бонуса по одному заказу:
 * - база — только позиции кухонных категорий (price × amount, без модификаторов);
 * - процент = число уникальных категорий, но не более 5;
 * - количество единиц внутри одной категории процент не увеличивает.
 */
export function calculateOrderBonus(items: BonusKitchenItem[]): OrderBonusCalculation {
  const kitchenSum = items.reduce(
    (sum, item) => sum + Math.round(Number(item.price) * Number(item.amount) * 100),
    0
  );
  const categories = [...new Set(items.map((item) => item.category))].sort((a, b) =>
    a.localeCompare(b, "ru")
  );
  const uniqueCategories = categories.length;
  const percent = uniqueCategories === 0 ? 0 : Math.min(uniqueCategories, MAX_KITCHEN_BONUS_PERCENT);
  const bonus = Math.round((kitchenSum * percent) / 100);
  return { kitchenSum, categories, uniqueCategories, percent, bonus };
}

/** Заказ в формате, который отдает prisma.order.findMany (select в модуле bonus/routes) */
export interface BonusOrderInput {
  id: string;
  createdAt: Date;
  externalNumber: string;
  operator: { id: string; name: string };
  items: Array<{
    name: string;
    price: NumericLike;
    amount: NumericLike;
    product: { parentGroupId: string | null } | null;
  }>;
}

export interface BonusOrderDetail {
  orderId: string;
  createdAt: Date;
  externalNumber: string;
  operator: { id: string; name: string };
  /** Список категорий кухни в чеке */
  categories: string[];
  /** Кол-во уникальных категорий */
  uniqueCategories: number;
  /** Сумма блюд кухни (в основных единицах) */
  kitchenSum: number;
  /** Примененный % */
  percent: number;
  /** Итоговый бонус оператора (в основных единицах) */
  bonus: number;
}

/**
 * Считает бонус по каждому заказу; возвращает строки только
 * по заказам, в которых есть позиции кухни.
 */
export function computeOrderBonuses(
  orders: BonusOrderInput[],
  config: KitchenCategoryConfig
): BonusOrderDetail[] {
  const details: BonusOrderDetail[] = [];
  for (const order of orders) {
    const kitchenItems: BonusKitchenItem[] = [];
    for (const item of order.items) {
      const category = resolveKitchenCategory(item.product?.parentGroupId, config);
      if (category) {
        kitchenItems.push({ name: item.name, price: item.price, amount: item.amount, category });
      }
    }
    if (kitchenItems.length === 0) continue;

    const calc = calculateOrderBonus(kitchenItems);
    details.push({
      orderId: order.id,
      createdAt: order.createdAt,
      externalNumber: order.externalNumber,
      operator: order.operator,
      categories: calc.categories,
      uniqueCategories: calc.uniqueCategories,
      kitchenSum: calc.kitchenSum / 100,
      percent: calc.percent,
      bonus: calc.bonus / 100
    });
  }
  return details.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export interface BonusOperatorRow {
  operator: { id: string; name: string };
  /** Всего оформлено заказов с кухней */
  ordersWithKitchen: number;
  /** Общая сумма продаж кухни */
  kitchenSalesTotal: number;
  /** Сумма всех бонусов по заказам оператора */
  bonusesTotal: number;
  /** Итого начислено бонусов по кухне (сумма к выплате) */
  payoutTotal: number;
}

/** Сводный отчет по операторам за период (для начисления ЗП) */
export function aggregateBonusByOperator(details: BonusOrderDetail[]): BonusOperatorRow[] {
  const byOperator = new Map<string, BonusOperatorRow>();
  for (const detail of details) {
    let row = byOperator.get(detail.operator.id);
    if (!row) {
      row = {
        operator: detail.operator,
        ordersWithKitchen: 0,
        kitchenSalesTotal: 0,
        bonusesTotal: 0,
        payoutTotal: 0
      };
      byOperator.set(detail.operator.id, row);
    }
    row.ordersWithKitchen += 1;
    row.kitchenSalesTotal += detail.kitchenSum;
    row.bonusesTotal += detail.bonus;
  }

  const rows = [...byOperator.values()].map((row) => ({
    ...row,
    kitchenSalesTotal: roundMoney(row.kitchenSalesTotal),
    bonusesTotal: roundMoney(row.bonusesTotal),
    payoutTotal: roundMoney(row.bonusesTotal)
  }));
  return rows.sort((a, b) => b.bonusesTotal - a.bonusesTotal);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
