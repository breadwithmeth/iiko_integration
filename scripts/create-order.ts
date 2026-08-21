/**
 * Helper script to create an order via the local API.
 *
 * Usage (from project root):
 *   npx ts-node scripts/create-order.ts <customerPhone> <productId>
 *
 * The script will:
 *   1. Fetch the first organization, terminal group, and order type.
 *   2. Use the provided productId (must be a DISH with a positive price).
 *   3. POST /api/orders with a correctly‑formatted UUID for orderTypeId.
 *
 * Adjust the values (or extend the script) to suit your test scenario.
 */
import fetch from 'node-fetch';
import { randomUUID } from 'crypto';

const API_BASE = 'http://localhost:3000'; // adjust if your dev server runs elsewhere

// Simple helper to add Authorization header – replace with a real JWT token.
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'YOUR_JWT_HERE';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return (await res.json()) as T;
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AUTH_TOKEN}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`POST ${url} failed: ${res.status}\n${err}`);
  }
  return (await res.json()) as T;
}

async function main() {
  const [_, __, customerPhone, productId] = process.argv;
  if (!customerPhone || !productId) {
    console.error('Usage: npx ts-node scripts/create-order.ts <customerPhone> <productId>');
    process.exit(1);
  }

  // 1️⃣ Fetch organizations, terminal groups and order types (first available)
  const organizations = await getJson<any[]>(`${API_BASE}/api/iiko/organizations`);
  const org = organizations[0];
  if (!org) throw new Error('No organizations found');

  const terminalGroups = await getJson<any[]>(`${API_BASE}/api/iiko/terminal-groups?organizationId=${org.iikoId}`);
  const tg = terminalGroups[0];
  if (!tg) throw new Error('No terminal groups found');

  const orderTypes = await getJson<any[]>(`${API_BASE}/api/iiko/order-types?organizationId=${org.iikoId}`);
  const ot = orderTypes[0];
  if (!ot) throw new Error('No order types found');

  const paymentTypes = await getJson<any[]>(`${API_BASE}/api/iiko/payment-types?organizationId=${org.iikoId}`);
  const pt = paymentTypes[0];
  if (!pt) throw new Error('No payment types found');

  // 2️⃣ Build order payload – price and name will be looked up from the product endpoint.
  const product = await getJson<any>(`${API_BASE}/api/products?search=&category=&page=1`);
  const prod = (product.items ?? []).find((p: any) => p.productId === productId);
  if (!prod) throw new Error(`Product ${productId} not found`);
  if (prod.type !== 'DISH' || Number(prod.defaultSalePrice) <= 0) {
    throw new Error('Selected product is not a valid DISH with a positive price');
  }

  const payload = {
    idempotencyKey: randomUUID(),
    organizationId: org.iikoId,
    terminalGroupId: tg.iikoId,
    orderTypeId: ot.iikoId,
    paymentTypeId: pt.iikoId,
    paymentTypeKind: pt.kind ?? 'Cash',
    customer: { phone: customerPhone },
    items: [{ productId: prod.productId, name: prod.name, price: prod.defaultSalePrice, amount: 1 }],
  };

  console.log('Sending order payload:', JSON.stringify(payload, null, 2));
  const result = await postJson<any>(`${API_BASE}/api/orders`, payload);
  console.log('Order created:', result);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
