import { describe, expect, it, vi } from "vitest";
import { IikoNomenclatureService } from "../services/IikoNomenclatureService.js";

const prismaMock = vi.hoisted(() => ({
  organization: { findUnique: vi.fn() },
  productGroup: { upsert: vi.fn() },
  product: { upsert: vi.fn(), updateMany: vi.fn() }
}));

vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

describe("IikoNomenclatureService", () => {
  it("loads all product pages and marks missing products deleted", async () => {
    prismaMock.organization.findUnique.mockResolvedValue({ id: "org-db", iikoId: "org-iiko" });
    const productsPage1 = Array.from({ length: 100 }, (_, index) => product(index));
    const productsPage2 = [product(100)];
    const client = {
      post: vi
        .fn()
        .mockResolvedValueOnce({ totalCount: 101, products: productsPage1 })
        .mockResolvedValueOnce({ totalCount: 101, products: productsPage2 })
    };

    // Use limit=100 to test pagination (101 products total, 100 per page)
    const result = await new IikoNomenclatureService(client as never).syncMenu("org-iiko", 100);

    expect(result.synced).toBe(101);
    expect(client.post).toHaveBeenCalledTimes(2);
    expect(prismaMock.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { deleted: true } }));
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
