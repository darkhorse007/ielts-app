export type RuntimeEnv = {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WS_BASE_URL?: string;
};

export type RuntimeConfig = {
  apiBaseUrl: string;
  wsBaseUrl: string;
};

const DEFAULT_DEV_ORIGIN = "http://127.0.0.1:5173";
const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, "");

const isRootRelativePath = (value: string): boolean => value.startsWith("/");

const validateConfiguredBaseUrl = (
  envKey: "VITE_API_BASE_URL" | "VITE_WS_BASE_URL",
  value: string,
  allowedProtocols: string[]
): void => {
  if (value.length === 0 || isRootRelativePath(value)) {
    return;
  }

  if (!URL_SCHEME_PATTERN.test(value)) {
    throw new Error(`${envKey} must be an absolute URL or root-relative path (received: ${value})`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${envKey} must be a valid URL (received: ${value})`);
  }

  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(
      `${envKey} must use one of: ${allowedProtocols.join(", ")} (received: ${parsed.protocol})`
    );
  }
};

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

const toWebSocketBaseUrl = (value: string, locationOrigin?: string): string => {
  const normalizedValue = normalizeBaseUrl(value);

  try {
    const parsed = new URL(normalizedValue);
    if (parsed.protocol === "http:") {
      parsed.protocol = "ws:";
    } else if (parsed.protocol === "https:") {
      parsed.protocol = "wss:";
    }
    return trimTrailingSlashes(parsed.toString());
  } catch {
    if (locationOrigin) {
      try {
        return toWebSocketBaseUrl(new URL(normalizedValue, locationOrigin).toString());
      } catch {
        return normalizedValue;
      }
    }

    return normalizedValue;
  }
};

export const resolveRuntimeConfig = (
  env: RuntimeEnv = import.meta.env,
  locationOrigin = globalThis.location?.origin
): RuntimeConfig => {
  const apiBaseUrl = normalizeBaseUrl(env.VITE_API_BASE_URL);
  const configuredWsBaseUrl = normalizeBaseUrl(env.VITE_WS_BASE_URL);

  validateConfiguredBaseUrl("VITE_API_BASE_URL", apiBaseUrl, ["http:", "https:"]);
  validateConfiguredBaseUrl("VITE_WS_BASE_URL", configuredWsBaseUrl, ["ws:", "wss:", "http:", "https:"]);

  if (configuredWsBaseUrl.length > 0) {
    return {
      apiBaseUrl,
      wsBaseUrl: toWebSocketBaseUrl(configuredWsBaseUrl, locationOrigin)
    };
  }

  if (apiBaseUrl.length > 0) {
    return {
      apiBaseUrl,
      wsBaseUrl: toWebSocketBaseUrl(apiBaseUrl, locationOrigin)
    };
  }

  return {
    apiBaseUrl,
    wsBaseUrl: toWebSocketBaseUrl(locationOrigin ?? DEFAULT_DEV_ORIGIN)
  };
};
