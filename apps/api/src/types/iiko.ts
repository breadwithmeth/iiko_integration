export interface IikoTokenResponse {
  correlationId: string;
  token: string;
}

export interface IikoOrganization {
  id: string;
  name: string;
  country?: string;
  restaurantAddress?: string;
  currencyIsoName?: string;
  isCloud?: boolean;
  defaultCallCenterPaymentTypeId?: string;
  [key: string]: unknown;
}

export interface IikoProduct {
  productId: string;
  name: string;
  type: string;
  productArticle?: string | null;
  code?: string | null;
  description?: string | null;
  parentGroupId?: string | null;
  defaultSalePrice?: number | null;
  images?: Array<{ imageUrl?: string; url?: string }> | null;
  frontImageId?: string | null;
  productSizeId?: string | null;
  modifierSchemaId?: string | null;
  modifierSchemaRedefinitions?: unknown;
  modifiers?: unknown;
  revision?: string | number | null;
  modifiedAt?: string | null;
  [key: string]: unknown;
}

export interface IikoProductGroup {
  id: string;
  name: string;
  parentGroup?: string | null;
  parentGroupId?: string | null;
  [key: string]: unknown;
}

export interface IikoPayment {
  paymentTypeKind: string;
  sum: number;
  paymentTypeId: string;
  isProcessedExternally: boolean;
  isFiscalizedExternally: boolean;
  isPrepay: boolean;
}

export interface IikoOrderItem {
  type: "Product";
  productId: string;
  amount: number;
  price?: number;
  productSizeId?: string | null;
  comment?: string;
  modifiers?: Array<{ productId: string; amount: number; price?: number }>;
}

export interface IikoOrder {
  id: string;
  externalNumber: string;
  customer: {
    name?: string;
    surname?: string;
    email?: string;
    comment?: string;
    shouldReceivePromoActionsInfo?: boolean;
    shouldReceiveOrderStatusNotifications?: boolean;
    gender?: string;
    type?: string;
  };
  phone: string;
  guestCount: number;
  guests: { count: number };
  items: IikoOrderItem[];
  payments: IikoPayment[];
  tabName?: string;
  menuId?: string | null;
  priceCategoryId?: string;
  orderTypeId: string;
  sourceKey?: string;
  externalData?: Array<{ key: string; value: string; isPublic: boolean }>;
}

export interface IikoOrderCreateRequest {
  organizationId: string;
  terminalGroupId: string;
  order: IikoOrder;
  createOrderSettings: {
    servicePrint: boolean;
    transportToFrontTimeout: number;
    checkStopList: boolean;
  };
}

export interface IikoOrderCreateResponse {
  correlationId: string;
  orderInfo?: {
    id?: string;
    posId?: string;
    externalNumber?: string;
    organizationId?: string;
    creationStatus?: string;
    errorInfo?: {
      code?: string;
      message?: string;
      description?: string;
    };
  };
}

export interface IikoErrorResponse {
  correlationId?: string;
  errorDescription?: string;
  error?: string;
  message?: string;
  [key: string]: unknown;
}
