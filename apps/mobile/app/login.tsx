import { Link, router } from "expo-router";
import { useState } from "react";
import { Platform, Text } from "react-native";
import { ApiClient } from "../src/lib/api-client";
import { validateEmail, validatePhone } from "../src/lib/validators";
import { useAppSession } from "../src/state/app-session";
import { AppScreen, ButtonRow, PrimaryButton, SecondaryButton, TextField } from "../src/ui/primitives";
import { colors } from "../src/ui/theme";

export default function LoginScreen() {
  const { instanceConfig, saveSession } = useAppSession();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!instanceConfig) {
    router.replace("/instance");
    return null;
  }

  const submit = async (): Promise<void> => {
    const identifierValue = identifier.trim();
    if (!identifierValue) {
      setError("请输入邮箱或手机号");
      return;
    }
    if (!validateEmail(identifierValue) && !validatePhone(identifierValue)) {
      setError("请输入有效邮箱或手机号");
      return;
    }
    if (password.length < 8) {
      setError("密码至少 8 位");
      return;
    }

    setSubmitting(true);
    try {
      const apiClient = new ApiClient(instanceConfig.apiBaseUrl);
      const tokens = await apiClient.login({
        identifier: identifierValue,
        password,
        device_id: `mobile-${Platform.OS}`
      });
      await saveSession(tokens);
      setError(null);
      router.replace("/home");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppScreen
      eyebrow="Authentication"
      title="登录移动端工作台"
      subtitle="首期先打通认证与连接验证。成功登录后会把 access / refresh token 保存在安全存储中。"
    >
      <TextField
        label="邮箱或手机号"
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="you@example.com / +8613800000000"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TextField
        label="密码"
        value={password}
        onChangeText={setPassword}
        placeholder="至少 8 位"
        secureTextEntry
      />

      {error ? <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{error}</Text> : null}

      <ButtonRow>
        <PrimaryButton label={submitting ? "登录中..." : "登录"} onPress={submit} disabled={submitting} />
        <SecondaryButton label="改实例" onPress={() => router.push("/instance")} />
      </ButtonRow>

      <Text style={{ color: colors.textMuted, fontSize: 14 }}>
        还没有账号？{" "}
        <Link href="/register" style={{ color: colors.accent, fontWeight: "700" }}>
          去注册
        </Link>
      </Text>
    </AppScreen>
  );
}
