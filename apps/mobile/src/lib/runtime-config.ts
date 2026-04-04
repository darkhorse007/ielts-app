export type InstanceConfig = {
  apiBaseUrl: string;
  wsBaseUrl: string;
};

export type InstanceConfigRisk = {
  code: "loopback" | "public_insecure" | "host_mismatch";
  message: string;
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

const isLoopbackHostname = (hostname: string): boolean => {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
};

const isPrivateIpv4Hostname = (hostname: string): boolean => {
  const normalized = hostname.trim().toLowerCase();
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) {
    return false;
  }

  const [firstOctet, secondOctet] = normalized.split(".").map((part) => Number(part));
  if (Number.isNaN(firstOctet) || Number.isNaN(secondOctet)) {
    return false;
  }

  return (
    firstOctet === 10 ||
    (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) ||
    (firstOctet === 192 && secondOctet === 168)
  );
};

const isPrivateHostname = (hostname: string): boolean => {
  const normalized = hostname.trim().toLowerCase();
  return isLoopbackHostname(normalized) || isPrivateIpv4Hostname(normalized) || normalized.endsWith(".local");
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

export const isSameInstanceConfig = (left: InstanceConfig | null | undefined, right: InstanceConfig | null | undefined): boolean =>
  Boolean(left && right && left.apiBaseUrl === right.apiBaseUrl && left.wsBaseUrl === right.wsBaseUrl);

export const getInstanceConfigSourceLabel = (
  instanceConfig: InstanceConfig | null | undefined,
  defaultInstanceConfig: InstanceConfig | null | undefined
): string => {
  if (defaultInstanceConfig) {
    if (isSameInstanceConfig(instanceConfig, defaultInstanceConfig)) {
      return "当前正在使用安装包预置实例";
    }
    if (instanceConfig) {
      return "当前正在使用本地覆盖实例";
    }
    return "尚未保存实例，预置值可直接恢复";
  }

  return instanceConfig ? "当前实例来自本地手动配置" : "当前安装包未预置默认实例";
};

export const getInstanceConfigRisks = (config: InstanceConfig): InstanceConfigRisk[] => {
  const apiUrl = new URL(config.apiBaseUrl);
  const wsUrl = new URL(config.wsBaseUrl);
  const risks: InstanceConfigRisk[] = [];

  if (isLoopbackHostname(apiUrl.hostname) || isLoopbackHostname(wsUrl.hostname)) {
    risks.push({
      code: "loopback",
      message: "检测到 localhost/127.0.0.1 回环地址，仅适合同机调试；真机、模拟器或外部内测通常需要改成可达 IP 或域名。"
    });
  }

  const apiTarget = `${apiUrl.hostname}:${apiUrl.port || (apiUrl.protocol === "https:" ? "443" : "80")}`;
  const wsTarget = `${wsUrl.hostname}:${wsUrl.port || (wsUrl.protocol === "wss:" ? "443" : "80")}`;
  if (apiTarget !== wsTarget) {
    risks.push({
      code: "host_mismatch",
      message: "API 与 WS 指向不同 host/port，请确认两条链路都已发布并可同时访问，否则登录成功后实时能力仍可能失败。"
    });
  }

  const usesPublicInsecureApi = apiUrl.protocol === "http:" && !isPrivateHostname(apiUrl.hostname);
  const usesPublicInsecureWs = wsUrl.protocol === "ws:" && !isPrivateHostname(wsUrl.hostname);
  if (usesPublicInsecureApi || usesPublicInsecureWs) {
    risks.push({
      code: "public_insecure",
      message: "检测到外网地址仍使用 HTTP / WS；若用于 preview / production 包，建议切到 HTTPS / WSS 以避免明文流量与系统策略限制。"
    });
  }

  return risks;
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
