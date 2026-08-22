import type { ProductDto } from "@iiko-call-center/shared";
/**
 * Returns true if the product is a DISH or GOODS and has a positive price.
 * This helper is used both in UI filtering and can be reused elsewhere.
 */
export const isValidDishOrGoods = (product: ProductDto): boolean =>
  (product.type === "DISH" || product.type === "GOODS") && product.defaultSalePrice > 0;
