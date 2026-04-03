import { useState } from "react";
import type { ApiClient } from "../lib/api-client";
import { loadCachedSessionProfile } from "../lib/session-profile-cache";
import { validateEmail, validatePhone } from "../lib/validators";
import { TokenStorage } from "../lib/token-storage";

type LoginPageProps = {
  apiClient: Pick<ApiClient, "login" | "getProfile">;
  tokenStorage: TokenStorage;
  onLoginSuccess?: () => void;
};

export const LoginPage = ({ apiClient, tokenStorage, onLoginSuccess }: LoginPageProps) => {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    if (!identifier.trim()) {
      setError("请输入邮箱或手机号");
      return;
    }

    const identifierValue = identifier.trim();
    if (!validateEmail(identifierValue) && !validatePhone(identifierValue)) {
      setError("请输入有效邮箱或手机号");
      return;
    }

    if (password.length < 8) {
      setError("密码至少 8 位");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const tokens = await apiClient.login({
        identifier: identifierValue,
        password,
        device_id: "client-default"
      });

      tokenStorage.save({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
        userId: tokens.user_id
      });
      void loadCachedSessionProfile(apiClient, tokens.access_token).catch(() => undefined);

      onLoginSuccess?.();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <h1>登录</h1>
      {error ? <p role="alert">{error}</p> : null}

      <label htmlFor="login-identifier">邮箱或手机号</label>
      <input
        id="login-identifier"
        name="login-identifier"
        value={identifier}
        onChange={(event) => setIdentifier(event.target.value)}
      />

      <label htmlFor="login-password">密码</label>
      <input
        id="login-password"
        name="login-password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      <button type="button" onClick={submit} disabled={loading}>
        {loading ? "登录中..." : "登录"}
      </button>
    </section>
  );
};
