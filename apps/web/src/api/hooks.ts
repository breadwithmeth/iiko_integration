import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateOrderInput, ProductDto } from "@iiko-call-center/shared";
import { api } from "./client";
import type { AuthUser } from "../stores/authStore";

export interface DirectoryItem {
  id: string;
  iikoId: string;
  name: string;
  kind?: string;
  rawData?: unknown;
}

export function useLogin() {
  return useMutation({
    mutationFn: (input: { email: string; password: string }) => api<{ token: string; user: AuthUser }>("/api/auth/login", { method: "POST", body: JSON.stringify(input) })
  });
}

export function useMe(enabled: boolean) {
  return useQuery({ queryKey: ["me"], queryFn: () => api<AuthUser>("/api/me"), enabled });
}

export function useOrganizations() {
  return useQuery({ queryKey: ["organizations"], queryFn: () => api<DirectoryItem[]>("/api/iiko/organizations") });
}

export function useTerminalGroups(organizationId?: string) {
  return useQuery({
    queryKey: ["terminal-groups", organizationId],
    queryFn: () => api<DirectoryItem[]>(`/api/iiko/terminal-groups${organizationId ? `?organizationId=${organizationId}` : ""}`),
    enabled: Boolean(organizationId)
  });
}

export function useOrderTypes(organizationId?: string) {
  return useQuery({
    queryKey: ["order-types", organizationId],
    queryFn: () => api<DirectoryItem[]>(`/api/iiko/order-types${organizationId ? `?organizationId=${organizationId}` : ""}`),
    enabled: Boolean(organizationId)
  });
}

export function usePaymentTypes(organizationId?: string) {
  return useQuery({
    queryKey: ["payment-types", organizationId],
    queryFn: () => api<DirectoryItem[]>(`/api/iiko/payment-types${organizationId ? `?organizationId=${organizationId}` : ""}`),
    enabled: Boolean(organizationId)
  });
}

export function useProducts(search: string, category?: string, page = 1) {
  const params = new URLSearchParams({ search, page: String(page), pageSize: "1000" });
  if (category) params.set("category", category);
  return useQuery({
    queryKey: ["products", search, category, page],
    queryFn: () => api<{ items: ProductDto[]; total: number; groups: Array<{ groupId: string; name: string }> }>(`/api/products?${params.toString()}`)
  });
}

export function useSyncMenu() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ synced: number; revision?: string }>("/api/iiko/sync/menu", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] })
  });
}

export function useSyncDirectories() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<unknown>("/api/iiko/sync/directories", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["terminal-groups"] });
      queryClient.invalidateQueries({ queryKey: ["order-types"] });
      queryClient.invalidateQueries({ queryKey: ["payment-types"] });
    }
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrderInput & { idempotencyKey: string }) => api<unknown>("/api/orders", { method: "POST", body: JSON.stringify(input) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["orders"] })
  });
}

export function useOrders(filters: URLSearchParams) {
  return useQuery({ queryKey: ["orders", filters.toString()], queryFn: () => api<{ items: OrderDto[]; total: number }>(`/api/orders?${filters.toString()}`) });
}

export function useOrder(id?: string) {
  return useQuery({ queryKey: ["orders", id], queryFn: () => api<OrderDto>(`/api/orders/${id}`), enabled: Boolean(id) });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => api<{ message?: string; order?: OrderDto }>(`/api/orders/${orderId}/cancel`, { method: "POST" }),
    onSuccess: (_, orderId) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders", orderId] });
    }
  });
}

export function usePrintBill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => api<{ success: boolean; message?: string; printResponse?: unknown }>(`/api/orders/${orderId}/print-bill`, { method: "POST" }),
    onSuccess: (_, orderId) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders", orderId] });
    }
  });
}

export function useCloseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => api<{ success: boolean; message?: string; closeResponse?: unknown }>(`/api/orders/${orderId}/close`, { method: "POST" }),
    onSuccess: (_, orderId) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders", orderId] });
    }
  });
}

export function useOrderStats(dateFrom?: string, dateTo?: string) {
  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  return useQuery({
    queryKey: ["order-stats", dateFrom, dateTo],
    queryFn: () => api<OrderStatsResponse>(`/api/orders/stats?${params.toString()}`),
    enabled: true
  });
}

export function useOperatorOrders(operatorId: string, dateFrom?: string, dateTo?: string) {
  const params = new URLSearchParams({ operator: operatorId });
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  return useQuery({
    queryKey: ["operator-orders", operatorId, dateFrom, dateTo],
    queryFn: () => api<{ items: OrderDto[]; total: number }>(`/api/orders?${params.toString()}`),
    enabled: Boolean(operatorId)
  });
}

export function useUptKpi(dateFrom?: string, dateTo?: string) {
  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  return useQuery({
    queryKey: ["upt-kpi", dateFrom, dateTo],
    queryFn: () => api<UptKpiResponse>(`/api/orders/upt-kpi?${params.toString()}`),
    enabled: true
  });
}

export interface UptKpiResponse {
  summary: {
    totalOrders: number;
    totalItems: number;
    totalAmount: number;
    upt: number;
    avgCheck: number;
    ordersByStatus: Record<string, number>;
  };
  byOperator: Array<{
    operator: { id: string; name: string; email: string };
    totalOrders: number;
    totalItems: number;
    totalAmount: number;
    upt: number;
    avgCheck: number;
    ordersByStatus: Record<string, number>;
  }>;
}

export interface OrderStatsResponse {
  summary: {
    totalOrders: number;
    totalAmount: number;
    ordersByStatus: Record<string, number>;
  };
  byOperator: Array<{
    operator: { id: string; name: string; email: string };
    totalOrders: number;
    totalAmount: number;
    ordersByStatus: Record<string, number>;
  }>;
}

export interface OrderDto {
  id: string;
  externalNumber: string;
  status: string;
  total: number;
  iikoOrderId?: string | null;
  iikoPosId?: string | null;
  correlationId?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  customer: { phone: string; firstName?: string | null; lastName?: string | null; email?: string | null };
  items: Array<{ id: string; name: string; price: number; amount: number; comment?: string | null }>;
  operator: { name: string };
  organization: { name: string; iikoId: string };
  terminalGroup: { name: string; iikoId: string };
  orderType?: { name: string; iikoId: string } | null;
  paymentType?: { name: string; iikoId: string; kind: string } | null;
}
