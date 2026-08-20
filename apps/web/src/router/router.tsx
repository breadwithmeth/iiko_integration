import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "../components/AppLayout";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { LoginPage } from "../pages/LoginPage";
import { NewOrderPage } from "../pages/NewOrderPage";
import { OrdersPage } from "../pages/OrdersPage";
import { OrderDetailsPage } from "../pages/OrderDetailsPage";
import { ProductsPage } from "../pages/ProductsPage";
import { SettingsIikoPage } from "../pages/SettingsIikoPage";
import { UsersPage } from "../pages/UsersPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/orders/new" replace /> },
      { path: "orders", element: <OrdersPage /> },
      { path: "orders/new", element: <NewOrderPage /> },
      { path: "orders/:id", element: <OrderDetailsPage /> },
      { path: "products", element: <ProductsPage /> },
      { path: "settings", element: <Navigate to="/settings/iiko" replace /> },
      { path: "settings/iiko", element: <SettingsIikoPage /> },
      { path: "settings/users", element: <UsersPage /> }
    ]
  }
]);
