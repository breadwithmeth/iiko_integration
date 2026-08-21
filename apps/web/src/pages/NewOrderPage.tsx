import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCcw, Search } from "lucide-react";
import type { ProductDto } from "@iiko-call-center/shared";
import { isValidDish } from "../utils/product";
import { ApiError, formatMoney } from "../api/client";
import { useCreateOrder, useOrderTypes, useOrganizations, usePaymentTypes, useProducts, useSyncMenu, useTerminalGroups, useSyncDirectories } from "../api/hooks";
import { CartPanel } from "../components/CartPanel";
import { useCartStore } from "../stores/cartStore";

export function NewOrderPage() {
  const [organizationId, setOrganizationId] = useState("");
  const [terminalGroupId, setTerminalGroupId] = useState("");
  const [orderTypeId, setOrderTypeId] = useState("");
  const [paymentTypeId, setPaymentTypeId] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [customer, setCustomer] = useState({ phone: "", firstName: "", lastName: "", email: "", comment: "" });
  const [result, setResult] = useState<any>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const organizations = useOrganizations();
  const terminalGroups = useTerminalGroups(organizationId);
  const orderTypes = useOrderTypes(organizationId);
  const paymentTypes = usePaymentTypes(organizationId);
  const products = useProducts(debouncedQuery, category);
  const syncMenu = useSyncMenu();
  const syncDirectories = useSyncDirectories();
  const createOrder = useCreateOrder();
  const add = useCartStore((state) => state.add);
  const clear = useCartStore((state) => state.clear);
  const items = useCartStore((state) => state.items);
  const total = useCartStore((state) => state.total());

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 120);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!organizationId && organizations.data?.[0]) setOrganizationId(organizations.data[0].iikoId);
  }, [organizationId, organizations.data]);

  useEffect(() => {
    if (!terminalGroupId && terminalGroups.data?.length === 1) setTerminalGroupId(terminalGroups.data[0].iikoId);
    if (!orderTypeId && orderTypes.data?.[0]) setOrderTypeId(orderTypes.data[0].iikoId);
    if (!paymentTypeId && paymentTypes.data?.[0]) setPaymentTypeId(paymentTypes.data[0].iikoId);
  }, [terminalGroupId, orderTypeId, paymentTypeId, terminalGroups.data, orderTypes.data, paymentTypes.data]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        searchRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const productItems = (products.data?.items ?? []).filter(isValidDish);
  const paymentType = paymentTypes.data?.find((item) => item.iikoId === paymentTypeId);
  const canSubmit = Boolean(organizationId && terminalGroupId && orderTypeId && paymentTypeId && customer.phone && items.length && !createOrder.isPending);

  function addProduct(product: ProductDto) {
    add({
      productId: product.productId,
      productSizeId: product.productSizeId,
      name: product.name,
      price: product.defaultSalePrice,
      amount: 1
    });
  }

  function handleSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((value) => Math.min(value + 1, Math.max(0, productItems.length - 1)));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((value) => Math.max(0, value - 1));
    }
    if (event.key === "Enter" && productItems[selectedIndex]) {
      event.preventDefault();
      addProduct(productItems[selectedIndex]);
    }
  }

  async function submitOrder() {
    if (!canSubmit || !paymentType) return;
    setResult(null);
    try {
      const response = await createOrder.mutateAsync({
        idempotencyKey: crypto.randomUUID(),
        organizationId,
        terminalGroupId,
        orderTypeId,
        paymentTypeId,
        paymentTypeKind: paymentType.kind ?? "",
        customer,
        items
      });
      setResult(response);
      clear();
    } catch (error) {
      if (error instanceof ApiError) setResult(error.body);
    }
  }

  const grouped = useMemo(() => products.data?.groups ?? [], [products.data?.groups]);

  return (
    <div className="workspace-grid">
      <aside className="category-panel">
        <div className="panel-title">Категории</div>
        <button className={!category ? "category active" : "category"} onClick={() => setCategory(undefined)}>Все</button>
        {grouped.map((group) => (
          <button key={group.groupId} className={category === group.groupId ? "category active" : "category"} onClick={() => setCategory(group.groupId)}>
            {group.name}
          </button>
        ))}
      </aside>

      <section className="menu-panel">
        <div className="order-config">
          <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
            {organizations.data?.map((item) => <option key={item.iikoId} value={item.iikoId}>{item.name}</option>)}
          </select>
          <select value={terminalGroupId} onChange={(event) => setTerminalGroupId(event.target.value)}>
            <option value="">Terminal group</option>
            {terminalGroups.data?.map((item) => <option key={item.iikoId} value={item.iikoId}>{item.name}</option>)}
          </select>
          <select value={orderTypeId} onChange={(event) => setOrderTypeId(event.target.value)}>
            <option value="">Тип заказа</option>
            {orderTypes.data?.map((item) => <option key={item.iikoId} value={item.iikoId}>{item.name}</option>)}
          </select>
          <select value={paymentTypeId} onChange={(event) => setPaymentTypeId(event.target.value)}>
            <option value="">Оплата</option>
            {paymentTypes.data?.map((item) => <option key={item.iikoId} value={item.iikoId}>{item.name}</option>)}
          </select>
          <button className="secondary-button" onClick={() => syncMenu.mutate()} disabled={syncMenu.isPending} title="Обновить меню"><RefreshCcw size={17} /> Обновить меню</button>
              <button className="secondary-button" onClick={() => syncDirectories.mutate()} disabled={syncDirectories.isPending} title="Синхронизировать справочники"><RefreshCcw size={17} /> Синхронизация</button>
        </div>

        <div className="customer-grid">
          <input placeholder="Телефон *" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} />
          <input placeholder="Имя" value={customer.firstName} onChange={(event) => setCustomer({ ...customer, firstName: event.target.value })} />
          <input placeholder="Фамилия" value={customer.lastName} onChange={(event) => setCustomer({ ...customer, lastName: event.target.value })} />
          <input placeholder="Email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} />
          <input className="span-2" placeholder="Комментарий клиента" value={customer.comment} onChange={(event) => setCustomer({ ...customer, comment: event.target.value })} />
        </div>

        <div className="search-row">
          <Search size={18} />
          <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleSearchKey} placeholder="Поиск блюда по названию, артикулу или коду" />
        </div>

        <div className="product-list">
          {productItems.map((product, index) => (
            <button key={product.id} className={index === selectedIndex ? "product-row selected" : "product-row"} onClick={() => addProduct(product)}>
              <div className="product-image">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span>{product.name.slice(0, 1)}</span>}</div>
              <div className="product-main">
                <strong>{product.name}</strong>
                <span>{product.groupName ?? "Без категории"} · арт. {product.article || "—"} · код {product.code || "—"}</span>
              </div>
              <div className="product-price">{formatMoney(product.defaultSalePrice)}</div>
            </button>
          ))}
        </div>
        {result && <OrderResult result={result} total={total} onNew={() => setResult(null)} />}
      </section>

      <CartPanel disabled={!canSubmit} onSubmit={submitOrder} />
    </div>
  );
}

function OrderResult({ result, total, onNew }: { result: any; total: number; onNew: () => void }) {
  const created = result.status === "CREATED";
  return (
    <div className={created ? "result-box success" : "result-box error"}>
      <h2>{created ? "Заказ успешно создан" : "Не удалось создать заказ"}</h2>
      <p>№ {result.externalNumber}</p>
      {result.iikoOrderId && <p>iiko Order ID: {result.iikoOrderId}</p>}
      {result.correlationId && <p>Correlation ID: {result.correlationId}</p>}
      <p>Статус: {result.status}</p>
      <p>Сумма: {formatMoney(result.total ?? total)}</p>
      {result.errorMessage && <p>Ошибка: {result.errorMessage}</p>}
      <button className="secondary-button" onClick={onNew}>Новый заказ</button>
    </div>
  );
}
