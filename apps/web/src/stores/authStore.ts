import { create } from "zustand";
import type { Role } from "@iiko-call-center/shared";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem("cc_token"),
  user: localStorage.getItem("cc_user") ? JSON.parse(localStorage.getItem("cc_user")!) : null,
  setAuth: (token, user) => {
    localStorage.setItem("cc_token", token);
    localStorage.setItem("cc_user", JSON.stringify(user));
    set({ token, user });
  },
  logout: () => {
    localStorage.removeItem("cc_token");
    localStorage.removeItem("cc_user");
    set({ token: null, user: null });
  }
}));
