import { describe, expect, it, vi } from "vitest";
import { IikoNomenclatureService } from "../services/IikoNomenclatureService.js";

const prismaMock = vi.hoisted(() => ({
  organization: { findUnique: vi.fn() },
  productGroup: { upsert: vi.fn() },
  product: { upsert: vi.fn(), updateMany: vi.fn() }
}));

vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

describe("IikoNomenclatureService", () => {
  it("loads groups and all product pages and marks missing products deleted", async () => {
    prismaMock.organization.findUnique.mockResolvedValue({ id: "org-db", iikoId: "org-iiko" });
    const productsPage1 = Array.from({ length: 100 }, (_, index) => product(index));
    const productsPage2 = [product(100)];
    const client = {
      post: vi
        .fn()
        // Первый вызов — группы из /nomenclature/v1/group/list
        .mockResolvedValueOnce({
          groups: [
            { groupId: "group-1", name: "Салаты", parentId: null, isDeleted: false },
            { groupId: "group-2", name: "Супы", parentId: "group-1", isDeleted: false },
            { groupId: "group-3", name: "Удаленная группа", parentId: null, isDeleted: true }
          ]
        })
        .mockResolvedValueOnce({ totalCount: 101, products: productsPage1 })
        .mockResolvedValueOnce({ totalCount: 101, products: productsPage2 })
    };

    // Use limit=100 to test pagination (101 products total, 100 per page)
    const result = await new IikoNomenclatureService(client as never).syncMenu("org-iiko", 100);

    expect(result.synced).toBe(101);
    expect(client.post).toHaveBeenCalledTimes(3);
    // Удаленные группы не сохраняются
    expect(prismaMock.productGroup.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.productGroup.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { groupId: "group-2" }, update: expect.objectContaining({ name: "Супы", parentGroupId: "group-1" }) })
    );
    expect(prismaMock.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { deleted: true } }));
  });

  it("links product to its group when the group is known", async () => {
    prismaMock.organization.findUnique.mockResolvedValue({ id: "org-db", iikoId: "org-iiko" });
    const client = {
      post: vi
        .fn()
        .mockResolvedValueOnce({ groups: [{ groupId: "salads", name: "Салаты", parentId: null, isDeleted: false }] })
        .mockResolvedValueOnce({ totalCount: 1, products: [{ ...product(0), parentGroupId: "salads" }] })
    };

    await new IikoNomenclatureService(client as never).syncMenu("org-iiko", 100);

    expect(prismaMock.product.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ parentGroupId: "salads" })
      })
    );
  });
});

function product(index: number) {
  return {
    productId: `product-${index}`,
    name: `Товар ${index}`,
    type: "DISH",
    defaultSalePrice: 100,
    productArticle: String(index),
    code: String(index)
  };
}
