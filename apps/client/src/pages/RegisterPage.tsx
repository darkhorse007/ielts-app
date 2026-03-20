import { useState } from "react";
import { validateEmail, validatePassword, validatePhone } from "../lib/validators";
import type { ApiClient } from "../lib/api-client";

type RegisterPageProps = {
  apiClient: Pick<ApiClient, "register">;
  onRegistered?: () => void;
};

export const RegisterPage = ({ apiClient, onRegistered }: RegisterPageProps) => {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (): Promise<void> => {
    if (!email.trim() && !phone.trim()) {
      setError("请填写邮箱或手机号");
      return;
    }
    if (email.trim() && !validateEmail(email)) {
      setError("邮箱格式不正确");
      return;
    }
    if (phone.trim() && !validatePhone(phone)) {
      setError("手机号格式不正确");
      return;
    }
    if (!validatePassword(password)) {
      setError("密码至少 8 位");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入密码不一致");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await apiClient.register({
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        password
      });
      onRegistered?.();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "注册失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <h1>注册</h1>
      {error ? <p role="alert">{error}</p> : null}

      <label htmlFor="register-email">邮箱</label>
      <input
        id="register-email"
        name="register-email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <label htmlFor="register-phone">手机号</label>
      <input
        id="register-phone"
        name="register-phone"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
      />

      <label htmlFor="register-password">密码</label>
      <input
        id="register-password"
        name="register-password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      <label htmlFor="register-password-confirm">确认密码</label>
      <input
        id="register-password-confirm"
        name="register-password-confirm"
        type="password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
      />

      <button type="button" disabled={loading} onClick={submit}>
        {loading ? "注册中..." : "注册"}
      </button>
    </section>
  );
};
