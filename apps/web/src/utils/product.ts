import type { ProductDto } from "@iiko-call-center/shared";
/**
 * Returns true if the product is a DISH and has a positive price.
 * This helper is used both in UI filtering and can be reused elsewhere.
 */
export const isValidDish = (product: ProductDto): boolean =>
  product.type === "DISH" && product.defaultSalePrice > 0;
