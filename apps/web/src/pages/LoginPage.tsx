import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLogin } from "../api/hooks";
import { useAuthStore } from "../stores/authStore";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();
  const setAuth = useAuthStore((state) => state.setAuth);
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = await login.mutateAsync({ email, password });
    setAuth(result.token, result.user);
    navigate("/orders/new");
  }

  return (
    <main className="login-screen">
      <form className="login-form" onSubmit={handleSubmit}>
        <h1>iiko Call Center</h1>
        <label>
          Email
          <input autoFocus type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Пароль
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {login.isError && <div className="error-box">Не удалось авторизоваться</div>}
        <button className="primary-button" disabled={login.isPending}>{login.isPending ? "Вход..." : "Войти"}</button>
      </form>
    </main>
  );
}
