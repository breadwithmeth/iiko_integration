import { useState } from "react";
import { formatMoney } from "../api/client";
import { useProducts } from "../api/hooks";

export function ProductsPage() {
  const [search, setSearch] = useState("");
  const products = useProducts(search);
  return (
    <section className="page-panel">
      <h1>Товары</h1>
      <input className="full-input" placeholder="Поиск по названию, артикулу или коду" value={search} onChange={(event) => setSearch(event.target.value)} />
      <table className="data-table">
        <thead><tr><th>Название</th><th>Категория</th><th>Артикул</th><th>Код</th><th>Цена</th><th>Доступность</th></tr></thead>
        <tbody>
          {products.data?.items.map((product) => (
            <tr key={product.id}>
              <td>{product.name}</td>
              <td>{product.groupName ?? "—"}</td>
              <td>{product.article ?? "—"}</td>
              <td>{product.code ?? "—"}</td>
              <td>{formatMoney(product.defaultSalePrice)}</td>
              <td>{product.deleted ? "Удален" : "Доступен"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
