import { Link, Redirect, router } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { ApiClient } from "../src/lib/api-client";
import { formatMinorGuardianAgeBandLabel, useMinorGuardian, type MinorGuardianAgeBand } from "../src/state/minor-guardian";
import { validateEmail, validatePassword, validatePhone } from "../src/lib/validators";
import { useAppSession } from "../src/state/app-session";
import { InstanceConnectionCard } from "../src/ui/instance-connection-card";
import { AppScreen, ButtonRow, PrimaryButton, SecondaryButton, TextField } from "../src/ui/primitives";
import { colors } from "../src/ui/theme";

export default function RegisterScreen() {
  const { defaultInstanceConfig, instanceConfig } = useAppSession();
  const { setAgeBand } = useMinorGuardian();
  const plainTextPasswordFields = process.env.EXPO_PUBLIC_E2E_PLAINTEXT_PASSWORD_FIELDS === "true";
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ageBand, setAgeBandDraft] = useState<MinorGuardianAgeBand>("unknown");
  const [guardianConfirmed, setGuardianConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!instanceConfig) {
    return <Redirect href="/instance" />;
  }

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
    if (ageBand === "under_18" && !guardianConfirmed) {
      setError("若未满 18 周岁，请先确认监护提示");
      return;
    }

    setSubmitting(true);
    try {
      const apiClient = new ApiClient(instanceConfig.apiBaseUrl);
      await apiClient.register({
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        password
      });
      if (ageBand !== "unknown") {
        await setAgeBand(ageBand, "register");
      }
      setError(null);
      router.replace("/login");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "注册失败");
    } finally {
      setSubmitting(false);
    }
  };

  const selectAgeBand = (nextAgeBand: MinorGuardianAgeBand): void => {
    setAgeBandDraft(nextAgeBand);
    setGuardianConfirmed(false);
  };

  return (
    <AppScreen
      eyebrow="Onboarding"
      title="先把账号创建出来"
      subtitle="注册接口直接复用当前 Web 应用的认证契约，后续 iOS / Android 所有学习域都基于同一账号体系展开。"
    >
      <InstanceConnectionCard
        title="当前将连接到以下实例"
        instanceConfig={instanceConfig}
        defaultInstanceConfig={defaultInstanceConfig}
      />

      <TextField
        label="邮箱"
        testID="register.email"
        value={email}
        onChangeText={setEmail}
        placeholder="可选，和手机号二选一即可"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TextField
        label="手机号"
        testID="register.phone"
        value={phone}
        onChangeText={setPhone}
        placeholder="可选，和邮箱二选一即可"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TextField
        label="密码"
        testID="register.password"
        value={password}
        onChangeText={setPassword}
        placeholder="至少 8 位"
        secureTextEntry={!plainTextPasswordFields}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textContentType="none"
      />

      <TextField
        label="确认密码"
        testID="register.confirmPassword"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="再次输入密码"
        secureTextEntry={!plainTextPasswordFields}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textContentType="none"
      />

      <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "700" }}>年龄与监护说明</Text>
      <ButtonRow>
        <PrimaryButton
          label="已满 18 周岁"
          onPress={() => selectAgeBand("adult")}
          disabled={submitting}
          testID="register.ageBandAdult"
        />
        <SecondaryButton
          label="未满 18 周岁"
          onPress={() => selectAgeBand("under_18")}
          disabled={submitting}
          testID="register.ageBandMinor"
        />
      </ButtonRow>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>
        当前选择: {formatMinorGuardianAgeBandLabel(ageBand)}
      </Text>
      {ageBand === "under_18" ? (
        <>
          <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
            如你未满 18 周岁，请在监护人知情和同意下使用，并合理安排学习时长。
          </Text>
          <SecondaryButton
            label={guardianConfirmed ? "已确认监护说明" : "确认监护说明"}
            onPress={() => setGuardianConfirmed((current) => !current)}
            disabled={submitting}
            testID="register.guardianConfirm"
          />
        </>
      ) : null}

      {error ? <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{error}</Text> : null}

      <ButtonRow>
        <PrimaryButton
          label={submitting ? "注册中..." : "注册"}
          onPress={submit}
          disabled={submitting}
          testID="register.submit"
        />
        <SecondaryButton label="返回登录" onPress={() => router.replace("/login")} testID="register.backToLogin" />
      </ButtonRow>

      <Text style={{ color: colors.textMuted, fontSize: 14 }}>
        已有账号？{" "}
        <Link href="/login" testID="register.gotoLogin" style={{ color: colors.accent, fontWeight: "700" }}>
          去登录
        </Link>
      </Text>
    </AppScreen>
  );
}
