import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Text } from "react-native";
import { ApiClient, ApiNetworkError, ApiRequestError } from "../src/lib/api-client";
import { getInstanceConfigRisks, isSameInstanceConfig, normalizeInstanceConfig, type InstanceConfig } from "../src/lib/runtime-config";
import { useAppSession } from "../src/state/app-session";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, TextField } from "../src/ui/primitives";
import { colors } from "../src/ui/theme";

const toInstanceConfigErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiNetworkError) {
    return error.message;
  }

  if (error instanceof ApiRequestError) {
    const requestLine = error.method && error.url ? ` (${error.method} ${error.url})` : "";
    return `${error.message}${requestLine}`;
  }

  return error instanceof Error ? error.message : fallback;
};

export default function InstanceConfigScreen() {
  const { instanceConfig, saveInstanceConfig, defaultInstanceConfig } = useAppSession();
  const [apiBaseUrl, setApiBaseUrl] = useState(instanceConfig?.apiBaseUrl ?? defaultInstanceConfig?.apiBaseUrl ?? "");
  const [wsBaseUrl, setWsBaseUrl] = useState(instanceConfig?.wsBaseUrl ?? defaultInstanceConfig?.wsBaseUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [validationStatus, setValidationStatus] = useState("未验证");
  const [validationResult, setValidationResult] = useState("-");

  useEffect(() => {
    if (!instanceConfig && defaultInstanceConfig) {
      setApiBaseUrl(defaultInstanceConfig.apiBaseUrl);
      setWsBaseUrl(defaultInstanceConfig.wsBaseUrl);
    }
  }, [defaultInstanceConfig, instanceConfig]);

  const resetValidationState = (): void => {
    setValidationStatus("未验证");
    setValidationResult("-");
  };

  const validateConnectionForConfig = async (
    input: {
      apiBaseUrl: string;
      wsBaseUrl?: string;
    },
    options?: {
      statusLabel?: string;
    }
  ): Promise<{
    apiBaseUrl: string;
    wsBaseUrl: string;
    healthStatus: string;
  }> => {
    const normalized = normalizeInstanceConfig(input);
    setValidationStatus("正在验证 /health");
    const apiClient = new ApiClient(normalized.apiBaseUrl);
    const health = await apiClient.health();
    setValidationStatus(options?.statusLabel ?? "已通过");
    setValidationResult(`/health=${health.status}`);
    return {
      ...normalized,
      healthStatus: health.status
    };
  };

  const validateConnection = async (): Promise<{
    apiBaseUrl: string;
    wsBaseUrl: string;
    healthStatus: string;
  }> =>
    validateConnectionForConfig({
      apiBaseUrl,
      wsBaseUrl
    });

  const submit = async (): Promise<void> => {
    setSaving(true);
    try {
      setError(null);
      const validated = await validateConnection();
      await saveInstanceConfig({
        apiBaseUrl: validated.apiBaseUrl,
        wsBaseUrl: validated.wsBaseUrl
      });
      setError(null);
      router.replace("/");
    } catch (submitError) {
      setValidationStatus("验证失败");
      setValidationResult("-");
      setError(toInstanceConfigErrorMessage(submitError, "实例配置保存失败"));
    } finally {
      setSaving(false);
    }
  };

  const validateOnly = async (): Promise<void> => {
    setSaving(true);
    try {
      setError(null);
      await validateConnection();
      setError(null);
    } catch (validationError) {
      setValidationStatus("验证失败");
      setValidationResult("-");
      setError(toInstanceConfigErrorMessage(validationError, "实例连通性校验失败"));
    } finally {
      setSaving(false);
    }
  };

  const restoreDefaultInstance = async (): Promise<void> => {
    if (!defaultInstanceConfig) {
      setError("当前安装包没有预置默认实例");
      return;
    }

    setSaving(true);
    setApiBaseUrl(defaultInstanceConfig.apiBaseUrl);
    setWsBaseUrl(defaultInstanceConfig.wsBaseUrl);
    try {
      setError(null);
      const validated = await validateConnectionForConfig(defaultInstanceConfig, {
        statusLabel: "预置实例已通过"
      });
      await saveInstanceConfig({
        apiBaseUrl: validated.apiBaseUrl,
        wsBaseUrl: validated.wsBaseUrl
      });
      setError(null);
      router.replace("/");
    } catch (restoreError) {
      setValidationStatus("预置实例验证失败");
      setValidationResult("-");
      setError(toInstanceConfigErrorMessage(restoreError, "恢复预置实例失败"));
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
  const previewRisks = preview ? getInstanceConfigRisks(preview) : [];
  const usingDefaultInstance = isSameInstanceConfig(instanceConfig, defaultInstanceConfig);
  const sourceLabel = defaultInstanceConfig
    ? usingDefaultInstance
      ? "当前正在使用安装包预置实例"
      : instanceConfig
        ? "当前正在使用本地覆盖实例"
        : "尚未保存实例，预置值可直接恢复"
    : "当前安装包未预置默认实例";

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

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>配置来源</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 20 }}>{sourceLabel}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>
          预置 API: {defaultInstanceConfig?.apiBaseUrl ?? "-"}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>
          预置 WS: {defaultInstanceConfig?.wsBaseUrl ?? "-"}
        </Text>
        {defaultInstanceConfig ? (
          <ButtonRow>
            <SecondaryButton
              label="恢复预置实例"
              onPress={() => void restoreDefaultInstance()}
              disabled={saving || usingDefaultInstance}
              testID="instance.restoreDefault"
            />
            <SecondaryButton
              label="填入预置实例"
              onPress={() => {
                setApiBaseUrl(defaultInstanceConfig.apiBaseUrl);
                setWsBaseUrl(defaultInstanceConfig.wsBaseUrl);
                resetValidationState();
                setError(null);
              }}
              disabled={saving}
              testID="instance.applyDefaultDraft"
            />
          </ButtonRow>
        ) : null}
      </InfoCard>

      <TextField
        label="API Base URL"
        testID="instance.apiBaseUrl"
        value={apiBaseUrl}
        onChangeText={setApiBaseUrl}
        placeholder="http://127.0.0.1:8787"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TextField
        label="WS Base URL"
        testID="instance.wsBaseUrl"
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
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 12 }}>
          预检状态: {validationStatus}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>
          最近结果: {validationResult}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4, lineHeight: 20 }}>
          保存前会调用 {preview ? `${preview.apiBaseUrl}/health` : "有效实例的 /health"} 做连通性预检。
        </Text>
      </InfoCard>

      {previewRisks.length > 0 ? (
        <InfoCard tone="accent">
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>风险提示</Text>
          {previewRisks.map((risk) => (
            <Text key={risk.code} style={{ color: colors.textPrimary, fontSize: 13, lineHeight: 20 }}>
              {risk.message}
            </Text>
          ))}
        </InfoCard>
      ) : null}

      {error ? (
        <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{error}</Text>
      ) : null}

      <ButtonRow>
        <PrimaryButton
          label={saving ? "处理中..." : "验证并保存实例"}
          onPress={submit}
          disabled={saving}
          testID="instance.save"
        />
        <SecondaryButton label="仅验证实例" onPress={() => void validateOnly()} disabled={saving} testID="instance.validate" />
      </ButtonRow>
      <ButtonRow>
        <SecondaryButton label="返回入口" onPress={() => router.replace("/")} testID="instance.back" />
      </ButtonRow>
    </AppScreen>
  );
}
