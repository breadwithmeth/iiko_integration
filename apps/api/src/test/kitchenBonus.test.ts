import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../lib/env.js";
import {
  aggregateBonusByOperator,
  calculateOrderBonus,
  computeOrderBonuses,
  getKitchenCategoryInfo,
  loadKitchenCategoryConfig,
  resolveKitchenCategory,
  type KitchenCategoryConfig
} from "../services/KitchenBonusService.js";

const prismaMock = vi.hoisted(() => ({
  productGroup: { findMany: vi.fn() }
}));

vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

// Конфигурация: корень «Кухня», категории «Салаты» и «Супы»,
// у «Салатов» есть вложенная подгруппа; «Напитки» — вне кухни.
const config: KitchenCategoryConfig = {
  found: true,
  rootGroupId: "root",
  rootGroupName: "Кухня",
  categoryByGroupId: new Map([
    ["salads", "Салаты"],
    ["soups", "Супы"]
  ]),
  groupById: new Map([
    ["root", { groupId: "root", name: "Кухня", parentGroupId: null }],
    ["salads", { groupId: "salads", name: "Салаты", parentGroupId: "root" }],
    ["soups", { groupId: "soups", name: "Супы", parentGroupId: "root" }],
    ["warm-salads", { groupId: "warm-salads", name: "Теплые салаты", parentGroupId: "salads" }],
    ["drinks", { groupId: "drinks", name: "Напитки", parentGroupId: null }]
  ])
};

describe("resolveKitchenCategory", () => {
  it("определяет категорию для прямой дочерней группы корня", () => {
    expect(resolveKitchenCategory("salads", config)).toBe("Салаты");
    expect(resolveKitchenCategory("soups", config)).toBe("Супы");
  });

  it("поднимается по цепочке родителей для вложенных подгрупп", () => {
    expect(resolveKitchenCategory("warm-salads", config)).toBe("Салаты");
  });

  it("возвращает null для группы вне кухни", () => {
    expect(resolveKitchenCategory("drinks", config)).toBeNull();
  });

  it("возвращает null для позиции без группы", () => {
    expect(resolveKitchenCategory(null, config)).toBeNull();
    expect(resolveKitchenCategory(undefined, config)).toBeNull();
  });

  it("возвращает null, если корневая группа не найдена", () => {
    const emptyConfig: KitchenCategoryConfig = {
      found: false,
      rootGroupId: null,
      rootGroupName: "Кухня",
      categoryByGroupId: new Map(),
      groupById: new Map()
    };
    expect(resolveKitchenCategory("salads", emptyConfig)).toBeNull();
  });
});

describe("calculateOrderBonus", () => {
  it("1 блюдо из 1 категории = 1%", () => {
    const calc = calculateOrderBonus([{ name: "Стейк", price: 3900, amount: 1, category: "Основной стол" }]);
    expect(calc.uniqueCategories).toBe(1);
    expect(calc.percent).toBe(1);
    expect(calc.kitchenSum).toBe(390000);
    expect(calc.bonus).toBe(3900);
  });

  it("5 стейков из 1 категории = 1% (количество не увеличивает процент)", () => {
    const calc = calculateOrderBonus(
      Array.from({ length: 5 }, () => ({ name: "Стейк", price: 3900, amount: 1, category: "Основной стол" }))
    );
    expect(calc.uniqueCategories).toBe(1);
    expect(calc.percent).toBe(1);
    expect(calc.bonus).toBe(19500);
  });

  it("блюда из 2 категорий = 2%", () => {
    const calc = calculateOrderBonus([
      { name: "Стейк", price: 3900, amount: 1, category: "Основной стол" },
      { name: "Цезарь", price: 2200, amount: 1, category: "Салаты" }
    ]);
    expect(calc.uniqueCategories).toBe(2);
    expect(calc.percent).toBe(2);
    expect(calc.kitchenSum).toBe(610000);
    expect(calc.bonus).toBe(12200);
  });

  it("пороги 3/4/5 категорий дают 3/4/5%", () => {
    const make = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        name: `Блюдо ${i}`,
        price: 1000,
        amount: 1,
        category: `Категория ${i}`
      }));

    expect(calculateOrderBonus(make(3)).percent).toBe(3);
    expect(calculateOrderBonus(make(4)).percent).toBe(4);
    expect(calculateOrderBonus(make(5)).percent).toBe(5);
  });

  it("6 и более категорий ограничены максимальным порогом 5%", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      name: `Блюдо ${i}`,
      price: 1000,
      amount: 1,
      category: `Категория ${i}`
    }));
    const calc = calculateOrderBonus(items);
    expect(calc.uniqueCategories).toBe(6);
    expect(calc.percent).toBe(5);
  });

  it("дробное количество учитывается в базе", () => {
    const calc = calculateOrderBonus([{ name: "Салат", price: 1000, amount: 0.5, category: "Салаты" }]);
    expect(calc.kitchenSum).toBe(50000);
    expect(calc.bonus).toBe(500);
  });

  it("бонус округляется до копеек", () => {
    const calc = calculateOrderBonus([{ name: "Салат", price: 333.33, amount: 1, category: "Салаты" }]);
    // 33333 коп. * 1% = 333.33 -> 333
    expect(calc.percent).toBe(1);
    expect(calc.bonus).toBe(333);
  });

  it("пустой список позиций — процент и бонус 0", () => {
    const calc = calculateOrderBonus([]);
    expect(calc.percent).toBe(0);
    expect(calc.bonus).toBe(0);
    expect(calc.kitchenSum).toBe(0);
  });
});

describe("computeOrderBonuses", () => {
  const operator = { id: "op-1", name: "Оператор" };

  it("база процента — только позиции кухни, не весь чек", () => {
    const details = computeOrderBonuses(
      [
        {
          id: "o1",
          createdAt: new Date("2026-09-01T10:00:00Z"),
          externalNumber: "CALL-1",
          operator,
          items: [
            { name: "Стейк", price: 3900, amount: 1, product: { parentGroupId: "salads" } },
            { name: "Кола", price: 800, amount: 2, product: { parentGroupId: "drinks" } },
            { name: "Хлеб", price: 300, amount: 1, product: null }
          ]
        }
      ],
      config
    );
    expect(details).toHaveLength(1);
    expect(details[0].kitchenSum).toBe(3900);
    expect(details[0].categories).toEqual(["Салаты"]);
    expect(details[0].percent).toBe(1);
    expect(details[0].bonus).toBe(39);
  });

  it("две разные категории дают 2% даже по одной единице", () => {
    const details = computeOrderBonuses(
      [
        {
          id: "o1",
          createdAt: new Date("2026-09-01T10:00:00Z"),
          externalNumber: "CALL-1",
          operator,
          items: [
            { name: "Стейк", price: 1000, amount: 1, product: { parentGroupId: "salads" } },
            { name: "Суп", price: 1000, amount: 1, product: { parentGroupId: "soups" } }
          ]
        }
      ],
      config
    );
    expect(details[0].uniqueCategories).toBe(2);
    expect(details[0].percent).toBe(2);
    expect(details[0].bonus).toBe(40);
  });

  it("заказы без позиций кухни исключаются из отчета", () => {
    const details = computeOrderBonuses(
      [
        {
          id: "o1",
          createdAt: new Date("2026-09-01T10:00:00Z"),
          externalNumber: "CALL-1",
          operator,
          items: [{ name: "Кола", price: 800, amount: 1, product: { parentGroupId: "drinks" } }]
        }
      ],
      config
    );
    expect(details).toHaveLength(0);
  });

  it("сортирует строки по дате заказа (сначала свежие)", () => {
    const details = computeOrderBonuses(
      [
        {
          id: "o1",
          createdAt: new Date("2026-09-01T10:00:00Z"),
          externalNumber: "CALL-1",
          operator,
          items: [{ name: "Салат", price: 1000, amount: 1, product: { parentGroupId: "salads" } }]
        },
        {
          id: "o2",
          createdAt: new Date("2026-09-02T10:00:00Z"),
          externalNumber: "CALL-2",
          operator,
          items: [{ name: "Суп", price: 1000, amount: 1, product: { parentGroupId: "soups" } }]
        }
      ],
      config
    );
    expect(details.map((d) => d.orderId)).toEqual(["o2", "o1"]);
  });
});

describe("aggregateBonusByOperator", () => {
  it("агрегирует заказы, продажи и бонусы по операторам", () => {
    const details = computeOrderBonuses(
      [
        {
          id: "o1",
          createdAt: new Date("2026-09-01T10:00:00Z"),
          externalNumber: "CALL-1",
          operator: { id: "op-1", name: "Анна" },
          items: [
            { name: "Стейк", price: 3900, amount: 1, product: { parentGroupId: "salads" } },
            { name: "Суп", price: 1100, amount: 1, product: { parentGroupId: "soups" } }
          ]
        },
        {
          id: "o2",
          createdAt: new Date("2026-09-02T10:00:00Z"),
          externalNumber: "CALL-2",
          operator: { id: "op-1", name: "Анна" },
          items: [{ name: "Салат", price: 2200, amount: 1, product: { parentGroupId: "warm-salads" } }]
        },
        {
          id: "o3",
          createdAt: new Date("2026-09-03T10:00:00Z"),
          externalNumber: "CALL-3",
          operator: { id: "op-2", name: "Мария" },
          items: [{ name: "Стейк", price: 10000, amount: 1, product: { parentGroupId: "salads" } }]
        }
      ],
      config
    );
    const rows = aggregateBonusByOperator(details);

    expect(rows).toHaveLength(2);
    const anna = rows.find((r) => r.operator.id === "op-1")!;
    expect(anna.ordersWithKitchen).toBe(2);
    // 3900 + 1100 + 2200 = 7200
    expect(anna.kitchenSalesTotal).toBe(7200);
    // o1: 5000 * 2% = 100; o2: 2200 * 1% = 22
    expect(anna.bonusesTotal).toBe(122);
    expect(anna.payoutTotal).toBe(122);

    const maria = rows.find((r) => r.operator.id === "op-2")!;
    expect(maria.ordersWithKitchen).toBe(1);
    expect(maria.bonusesTotal).toBe(100);
  });

  it("сортирует операторов по сумме бонусов по убыванию", () => {
    const details = computeOrderBonuses(
      [
        {
          id: "o1",
          createdAt: new Date("2026-09-01T10:00:00Z"),
          externalNumber: "CALL-1",
          operator: { id: "op-1", name: "Анна" },
          items: [{ name: "Салат", price: 1000, amount: 1, product: { parentGroupId: "salads" } }]
        },
        {
          id: "o2",
          createdAt: new Date("2026-09-02T10:00:00Z"),
          externalNumber: "CALL-2",
          operator: { id: "op-2", name: "Мария" },
          items: [{ name: "Стейк", price: 100000, amount: 1, product: { parentGroupId: "soups" } }]
        }
      ],
      config
    );
    const rows = aggregateBonusByOperator(details);
    expect(rows.map((r) => r.operator.id)).toEqual(["op-2", "op-1"]);
  });
});

describe("loadKitchenCategoryConfig", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Тесты не должны зависеть от значений в .env — фиксируем дефолтную конфигурацию
    env.KITCHEN_CATEGORY_NAMES = "";
    env.KITCHEN_ROOT_GROUP_NAME = "Кухня";
  });

  it("собирает категории из прямых дочерних групп корня", async () => {
    prismaMock.productGroup.findMany.mockResolvedValue([
      { groupId: "root", name: "Кухня", parentGroupId: null },
      { groupId: "salads", name: "Салаты", parentGroupId: "root" },
      { groupId: "soups", name: "Супы", parentGroupId: "root" },
      { groupId: "drinks", name: "Напитки", parentGroupId: null }
    ]);

    const loaded = await loadKitchenCategoryConfig();
    const info = getKitchenCategoryInfo(loaded);

    expect(info.found).toBe(true);
    expect(info.rootGroupName).toBe("Кухня");
    expect(info.categories).toEqual(["Салаты", "Супы"]);
  });

  it("не находит корень, если группы «Кухня» нет в номенклатуре", async () => {
    prismaMock.productGroup.findMany.mockResolvedValue([
      { groupId: "drinks", name: "Напитки", parentGroupId: null }
    ]);

    const loaded = await loadKitchenCategoryConfig();
    const info = getKitchenCategoryInfo(loaded);

    expect(info.found).toBe(false);
    expect(info.categories).toEqual([]);
  });

  it("использует явный список имен, если он задан (приоритет над корневой группой)", async () => {
    const original = env.KITCHEN_CATEGORY_NAMES;
    env.KITCHEN_CATEGORY_NAMES = "Салаты, Супы, Основные блюда, Гарниры";
    try {
      prismaMock.productGroup.findMany.mockResolvedValue([
        { groupId: "menu", name: "МЕНЮ", parentGroupId: null },
        { groupId: "salads", name: "Салаты", parentGroupId: "menu" },
        { groupId: "soups", name: "Супы", parentGroupId: "menu" },
        { groupId: "mains", name: "Основные блюда", parentGroupId: "menu" },
        { groupId: "sauces", name: "Соуса", parentGroupId: "menu" },
        { groupId: "kitchen", name: "Кухня", parentGroupId: null }
      ]);

      const loaded = await loadKitchenCategoryConfig();
      const info = getKitchenCategoryInfo(loaded);

      expect(info.found).toBe(true);
      // «Соуса» не в списке — не кухонная категория; корневая группа игнорируется
      expect(info.categories).toEqual(["Основные блюда", "Салаты", "Супы"]);
      expect(resolveKitchenCategory("sauces", loaded)).toBeNull();
      expect(resolveKitchenCategory("salads", loaded)).toBe("Салаты");
    } finally {
      env.KITCHEN_CATEGORY_NAMES = original;
    }
  });
});
