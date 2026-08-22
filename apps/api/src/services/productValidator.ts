import type { Product } from "@prisma/client";
/**
 * Returns true if the Prisma Product record represents a DISH or GOODS and its price is greater than zero.
 */
export const isDishOrGoodsWithPositivePrice = (product: Product): boolean =>
  (product.type === "DISH" || product.type === "GOODS") && Number(product.defaultSalePrice) > 0;
