import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Text } from "react-native";
import { normalizeInstanceConfig } from "../src/lib/runtime-config";
import { useAppSession } from "../src/state/app-session";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, TextField } from "../src/ui/primitives";
import { colors } from "../src/ui/theme";

export default function InstanceConfigScreen() {
  const { instanceConfig, saveInstanceConfig, defaultInstanceConfig } = useAppSession();
  const [apiBaseUrl, setApiBaseUrl] = useState(instanceConfig?.apiBaseUrl ?? defaultInstanceConfig?.apiBaseUrl ?? "");
  const [wsBaseUrl, setWsBaseUrl] = useState(instanceConfig?.wsBaseUrl ?? defaultInstanceConfig?.wsBaseUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!instanceConfig && defaultInstanceConfig) {
      setApiBaseUrl(defaultInstanceConfig.apiBaseUrl);
      setWsBaseUrl(defaultInstanceConfig.wsBaseUrl);
    }
  }, [defaultInstanceConfig, instanceConfig]);

  const submit = async (): Promise<void> => {
    setSaving(true);
    try {
      const normalized = normalizeInstanceConfig({
        apiBaseUrl,
        wsBaseUrl
      });
      await saveInstanceConfig(normalized);
      setError(null);
      router.replace("/");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "实例配置保存失败");
    } finally {
      setSaving(false);
    }
  };

  const preview = (() => {
    try {
      return normalizeInstanceConfig({
        apiBaseUrl,
        wsBaseUrl
      });
    } catch {
      return null;
    }
  })();

  return (
    <AppScreen
      eyebrow="Self-Hosted"
      title="绑定你的 API / WS 实例"
      subtitle="移动端默认复用当前 Fastify API 与 WebSocket。若在真机或模拟器上调试，请填写设备可达地址，而不是盲目使用 localhost。"
    >
      <InfoCard tone="accent">
        <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 20 }}>
          推荐本地起点：`http://127.0.0.1:8787` 适合与服务端运行在同一主机的场景。真机调试时，通常需要改成局域网 IP。
        </Text>
      </InfoCard>

      <TextField
        label="API Base URL"
        value={apiBaseUrl}
        onChangeText={setApiBaseUrl}
        placeholder="http://127.0.0.1:8787"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TextField
        label="WS Base URL"
        value={wsBaseUrl}
        onChangeText={setWsBaseUrl}
        placeholder="留空则按 API 地址自动推导"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>当前设备</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}>{Platform.OS}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 12 }}>
          预览 API: {preview?.apiBaseUrl ?? "待输入"}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>
          预览 WS: {preview?.wsBaseUrl ?? "待输入"}
        </Text>
      </InfoCard>

      {error ? (
        <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{error}</Text>
      ) : null}

      <ButtonRow>
        <PrimaryButton label={saving ? "保存中..." : "保存实例"} onPress={submit} disabled={saving} />
        <SecondaryButton label="返回入口" onPress={() => router.replace("/")} />
      </ButtonRow>
    </AppScreen>
  );
}
