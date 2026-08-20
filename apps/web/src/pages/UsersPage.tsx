import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
}

export function UsersPage() {
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "OPERATOR" });
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<UserRow[]>("/api/users") });
  const create = useMutation({
    mutationFn: () => api<UserRow>("/api/users", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setForm({ email: "", name: "", password: "", role: "OPERATOR" });
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <section className="page-panel">
      <h1>Операторы</h1>
      <form className="filters" onSubmit={submit}>
        <input placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <input placeholder="Имя" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <input placeholder="Пароль" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
          <option>OPERATOR</option>
          <option>ADMIN</option>
        </select>
        <button className="secondary-button">Создать</button>
      </form>
      <table className="data-table">
        <thead><tr><th>Имя</th><th>Email</th><th>Роль</th><th>Статус</th></tr></thead>
        <tbody>
          {users.data?.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td>{user.role}</td><td>{user.active ? "Активен" : "Отключен"}</td></tr>)}
        </tbody>
      </table>
    </section>
  );
}
