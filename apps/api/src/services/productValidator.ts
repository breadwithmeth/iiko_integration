import type { Product } from "@prisma/client";
/**
 * Returns true if the Prisma Product record represents a DISH and its price is greater than zero.
 */
export const isDishWithPositivePrice = (product: Product): boolean =>
  product.type === "DISH" && Number(product.defaultSalePrice) > 0;
