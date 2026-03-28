export type InstanceConfig = {
  apiBaseUrl: string;
  wsBaseUrl: string;
};

const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, "");

const normalizeBaseUrl = (value?: string): string => {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return "";
  }

  return trimTrailingSlashes(normalized);
};

const validateConfiguredBaseUrl = (
  label: "apiBaseUrl" | "wsBaseUrl",
  value: string,
  allowedProtocols: string[]
): void => {
  if (!value) {
    throw new Error(`${label} 不能为空`);
  }

  if (!URL_SCHEME_PATTERN.test(value)) {
    throw new Error(`${label} 必须是完整 URL，例如 http://127.0.0.1:8787`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} 不是有效 URL`);
  }

  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`${label} 协议必须是 ${allowedProtocols.join(" / ")}`);
  }
};

const toWebSocketBaseUrl = (value: string): string => {
  const parsed = new URL(value);
  if (parsed.protocol === "http:") {
    parsed.protocol = "ws:";
  } else if (parsed.protocol === "https:") {
    parsed.protocol = "wss:";
  }
  return trimTrailingSlashes(parsed.toString());
};

export const normalizeInstanceConfig = (input: {
  apiBaseUrl: string;
  wsBaseUrl?: string;
}): InstanceConfig => {
  const apiBaseUrl = normalizeBaseUrl(input.apiBaseUrl);
  const wsInput = normalizeBaseUrl(input.wsBaseUrl);

  validateConfiguredBaseUrl("apiBaseUrl", apiBaseUrl, ["http:", "https:"]);
  if (wsInput) {
    validateConfiguredBaseUrl("wsBaseUrl", wsInput, ["ws:", "wss:", "http:", "https:"]);
  }

  return {
    apiBaseUrl,
    wsBaseUrl: wsInput ? toWebSocketBaseUrl(wsInput) : toWebSocketBaseUrl(apiBaseUrl)
  };
};

export const resolveDefaultInstanceConfig = (): InstanceConfig | null => {
  const apiBaseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
  if (!apiBaseUrl) {
    return null;
  }

  try {
    return normalizeInstanceConfig({
      apiBaseUrl,
      wsBaseUrl: process.env.EXPO_PUBLIC_WS_BASE_URL
    });
  } catch {
    return null;
  }
};
