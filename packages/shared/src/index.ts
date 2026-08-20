export type Role = "ADMIN" | "OPERATOR";

export type OrderStatus = "DRAFT" | "SUBMITTING" | "CREATED" | "FAILED" | "UNKNOWN" | "CANCELLED";

export interface CartModifier {
  productId: string;
  name: string;
  amount: number;
  price?: number;
}

export interface CartItem {
  productId: string;
  productSizeId?: string | null;
  name: string;
  price: number;
  amount: number;
  comment?: string;
  modifiers?: CartModifier[];
}

export interface CustomerInput {
  phone: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  comment?: string;
}

export interface CreateOrderInput {
  organizationId: string;
  terminalGroupId: string;
  orderTypeId: string;
  paymentTypeId: string;
  paymentTypeKind: string;
  customer: CustomerInput;
  items: CartItem[];
}

export interface ProductDto {
  id: string;
  productId: string;
  name: string;
  type: string;
  article?: string | null;
  code?: string | null;
  description?: string | null;
  parentGroupId?: string | null;
  groupName?: string | null;
  defaultSalePrice: number;
  imageUrl?: string | null;
  deleted: boolean;
  productSizeId?: string | null;
  rawData?: unknown;
}
