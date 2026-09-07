import { LogOut, PackageSearch, Settings, ShoppingCart, TableProperties, Users, BarChart3, Target } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuthStore } from "../stores/authStore";

export function AppLayout() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  async function handleLogout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    logout();
    navigate("/login");
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">iiko Call Center</div>
        <nav className="main-nav">
          <NavLink to="/orders/new"><ShoppingCart size={18} /> Новый заказ</NavLink>
          <NavLink to="/orders"><TableProperties size={18} /> История</NavLink>
          {user?.role === "ADMIN" && <NavLink to="/statistics"><BarChart3 size={18} /> Статистика</NavLink>}
          {user?.role === "ADMIN" && <NavLink to="/upt-kpi"><Target size={18} /> UPT KPI</NavLink>}
          <NavLink to="/products"><PackageSearch size={18} /> Товары</NavLink>
          {user?.role === "ADMIN" && <NavLink to="/settings/iiko"><Settings size={18} /> iiko</NavLink>}
          {user?.role === "ADMIN" && <NavLink to="/settings/users"><Users size={18} /> Операторы</NavLink>}
        </nav>
        <div className="operator">
          <span>Оператор: {user?.name}</span>
          <button className="icon-button" onClick={handleLogout} title="Выход"><LogOut size={18} /></button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
