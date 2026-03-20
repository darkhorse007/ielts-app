import fs from "node:fs";

export type PaymentProviderName = "mockpay" | "stripe" | "alipay";
export type PaymentProviderMode = "mock" | "live";
export type PaymentRefundHandling = "manual_review";

export type PaymentProviderRuntimeConfig = {
  providerName: PaymentProviderName;
  enabled: boolean;
  upgradeEnabled: boolean;
  mode: PaymentProviderMode;
  webhookPath: string;
  signatureRequired: boolean;
  webhookSecret?: string;
  webhookSecretConfigured: boolean;
  replayWindowSeconds: number;
  refundHandling: PaymentRefundHandling;
};

export type PaymentRuntimeConfig = {
  defaultProvider: PaymentProviderName;
  timestampToleranceSeconds: number;
  providers: PaymentProviderRuntimeConfig[];
};

export type AiProviderRole = "primary" | "fallback";

export type AiProviderRuntimeConfig = {
  role: AiProviderRole;
  providerName: string;
  enabled: boolean;
  endpoint?: string;
  apiKey?: string;
  apiKeyConfigured: boolean;
  dataRegion?: string;
  timeoutMs: number;
  sendsUserContent: boolean;
};

export type AiRuntimeConfig = {
  ready: boolean;
  fallbackEnabled: boolean;
  allowUserContentLogging: boolean;
  providers: AiProviderRuntimeConfig[];
};

export type ServiceConfig = {
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  authSecret: string;
  loginFailureLimit: number;
  loginFailureWindowSeconds: number;
  paymentRuntime: PaymentRuntimeConfig;
  aiRuntime: AiRuntimeConfig;
};

export const DEVELOPMENT_AUTH_SECRET = "development-auth-secret-for-tests-only-0001";
export const MIN_AUTH_SECRET_LENGTH = 32;
export const MIN_WEBHOOK_SECRET_LENGTH = 16;

const normalizeSecret = (value: string): string => value.trim();
const normalizeOptional = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const isTruthy = (value: string | undefined): boolean => {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "y" || normalized === "on";
};

const parsePositiveInteger = (value: string | undefined, fallback: number, source: string): number => {
  if (!value?.trim()) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${source}_INVALID`);
  }
  return parsed;
};

const validateNonEmptySecret = (secret: string, source: string): string => {
  const normalized = normalizeSecret(secret);
  if (!normalized) {
    throw new Error(`${source}_EMPTY`);
  }
  return normalized;
};

export const validateAuthSecret = (secret: string, source = "AUTH_SECRET"): string => {
  const normalized = validateNonEmptySecret(secret, source);
  if (normalized.length < MIN_AUTH_SECRET_LENGTH) {
    throw new Error(`${source}_TOO_SHORT`);
  }
  return normalized;
};

export const validateWebhookSecret = (secret: string, source = "PAYMENT_WEBHOOK_SECRET"): string => {
  const normalized = validateNonEmptySecret(secret, source);
  if (normalized.length < MIN_WEBHOOK_SECRET_LENGTH) {
    throw new Error(`${source}_TOO_SHORT`);
  }
  return normalized;
};

const resolveInlineOrFileSecret = (
  env: Record<string, string | undefined>,
  variableName: string,
  readTextFile: (filePath: string) => string,
  validator: (secret: string, source: string) => string
): string | undefined => {
  const inlineValue = normalizeOptional(env[variableName]);
  if (inlineValue) {
    return validator(inlineValue, variableName);
  }

  const fileVariableName = `${variableName}_FILE`;
  const secretFile = normalizeOptional(env[fileVariableName]);
  if (!secretFile) {
    return undefined;
  }

  let fileSecret: string;
  try {
    fileSecret = readTextFile(secretFile);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`${fileVariableName}_READ_FAILED:${message}`);
  }

  return validator(fileSecret, fileVariableName);
};

export const resolveAuthSecretFromEnv = (
  env: Record<string, string | undefined> = process.env,
  readTextFile: (filePath: string) => string = (filePath) => fs.readFileSync(filePath, "utf8")
): string => {
  const resolved = resolveInlineOrFileSecret(env, "AUTH_SECRET", readTextFile, validateAuthSecret);
  if (!resolved) {
    throw new Error("AUTH_SECRET_REQUIRED");
  }
  return resolved;
};

const resolvePaymentProviderName = (value: string, source: string): PaymentProviderName => {
  if (value === "mockpay" || value === "stripe" || value === "alipay") {
    return value;
  }
  throw new Error(`${source}_INVALID`);
};

const resolvePaymentProviderRuntime = (
  providerName: PaymentProviderName,
  env: Record<string, string | undefined>,
  readTextFile: (filePath: string) => string,
  timestampToleranceSeconds: number
): PaymentProviderRuntimeConfig => {
  const providerToken = providerName.toUpperCase();
  const prefix = `PAYMENT_${providerToken}`;
  const enabledRaw = normalizeOptional(env[`${prefix}_ENABLED`]);
  const enabled = enabledRaw ? isTruthy(enabledRaw) : providerName === "mockpay";
  const modeRaw = normalizeOptional(env[`${prefix}_MODE`]);
  const mode: PaymentProviderMode =
    modeRaw === "mock" || modeRaw === "live" ? modeRaw : providerName === "mockpay" ? "mock" : "live";
  const signatureRequiredRaw = normalizeOptional(env[`${prefix}_SIGNATURE_REQUIRED`]);
  const signatureRequired = signatureRequiredRaw ? isTruthy(signatureRequiredRaw) : enabled && mode === "live";
  const webhookSecret = resolveInlineOrFileSecret(env, `${prefix}_WEBHOOK_SECRET`, readTextFile, validateWebhookSecret);
  if (signatureRequired && !webhookSecret) {
    throw new Error(`${prefix}_WEBHOOK_SECRET_REQUIRED`);
  }

  return {
    providerName,
    enabled,
    upgradeEnabled: enabled,
    mode,
    webhookPath: "/v1/payments/webhooks/provider",
    signatureRequired,
    webhookSecret,
    webhookSecretConfigured: Boolean(webhookSecret),
    replayWindowSeconds: timestampToleranceSeconds,
    refundHandling: "manual_review"
  };
};

export const resolvePaymentRuntimeFromEnv = (
  env: Record<string, string | undefined> = process.env,
  readTextFile: (filePath: string) => string = (filePath) => fs.readFileSync(filePath, "utf8")
): PaymentRuntimeConfig => {
  const timestampToleranceSeconds = parsePositiveInteger(
    env.PAYMENT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
    300,
    "PAYMENT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS"
  );
  const providers = (["mockpay", "stripe", "alipay"] as const).map((providerName) =>
    resolvePaymentProviderRuntime(providerName, env, readTextFile, timestampToleranceSeconds)
  );
  const defaultProvider = resolvePaymentProviderName(env.PAYMENT_PROVIDER_DEFAULT?.trim().toLowerCase() ?? "mockpay", "PAYMENT_PROVIDER_DEFAULT");
  const defaultProviderConfig = providers.find((provider) => provider.providerName === defaultProvider);
  if (!defaultProviderConfig?.enabled) {
    throw new Error("PAYMENT_PROVIDER_DEFAULT_DISABLED");
  }

  return {
    defaultProvider,
    timestampToleranceSeconds,
    providers
  };
};

const resolveAiProviderRuntime = (
  role: AiProviderRole,
  env: Record<string, string | undefined>,
  readTextFile: (filePath: string) => string,
  enabledDefault: boolean
): AiProviderRuntimeConfig => {
  const roleToken = role.toUpperCase();
  const enabledRaw = normalizeOptional(env[`LLM_${roleToken}_ENABLED`]);
  const enabled = enabledRaw ? isTruthy(enabledRaw) : enabledDefault;
  const providerName =
    normalizeOptional(env[`LLM_${roleToken}_PROVIDER_NAME`]) ??
    (role === "primary" ? "openai" : "fallback-llm");
  const endpoint = normalizeOptional(env[`LLM_${roleToken}_ENDPOINT`]);
  const apiKey = resolveInlineOrFileSecret(env, `LLM_${roleToken}_API_KEY`, readTextFile, validateNonEmptySecret);
  const dataRegion = normalizeOptional(env[`LLM_${roleToken}_DATA_REGION`]);
  const timeoutMs = parsePositiveInteger(env[`LLM_${roleToken}_TIMEOUT_MS`], role === "primary" ? 20000 : 25000, `LLM_${roleToken}_TIMEOUT_MS`);

  return {
    role,
    providerName,
    enabled,
    endpoint,
    apiKey,
    apiKeyConfigured: Boolean(apiKey),
    dataRegion,
    timeoutMs,
    sendsUserContent: true
  };
};

export const resolveAiRuntimeFromEnv = (
  env: Record<string, string | undefined> = process.env,
  readTextFile: (filePath: string) => string = (filePath) => fs.readFileSync(filePath, "utf8")
): AiRuntimeConfig => {
  const fallbackEnabled = isTruthy(env.LLM_FALLBACK_ENABLED);
  const primary = resolveAiProviderRuntime("primary", env, readTextFile, true);
  const fallback = resolveAiProviderRuntime("fallback", env, readTextFile, fallbackEnabled);
  const allowUserContentLogging = isTruthy(env.LLM_ALLOW_USER_CONTENT_LOGGING);
  const providers = [primary, fallback];
  const ready =
    primary.enabled &&
    Boolean(primary.endpoint && primary.apiKeyConfigured) &&
    (!fallback.enabled || Boolean(fallback.endpoint && fallback.apiKeyConfigured));

  return {
    ready,
    fallbackEnabled: fallback.enabled,
    allowUserContentLogging,
    providers
  };
};

export const defaultPaymentRuntimeConfig: PaymentRuntimeConfig = {
  defaultProvider: "mockpay",
  timestampToleranceSeconds: 300,
  providers: [
    {
      providerName: "mockpay",
      enabled: true,
      upgradeEnabled: true,
      mode: "mock",
      webhookPath: "/v1/payments/webhooks/provider",
      signatureRequired: false,
      webhookSecretConfigured: false,
      replayWindowSeconds: 300,
      refundHandling: "manual_review"
    },
    {
      providerName: "stripe",
      enabled: false,
      upgradeEnabled: false,
      mode: "live",
      webhookPath: "/v1/payments/webhooks/provider",
      signatureRequired: true,
      webhookSecretConfigured: false,
      replayWindowSeconds: 300,
      refundHandling: "manual_review"
    },
    {
      providerName: "alipay",
      enabled: false,
      upgradeEnabled: false,
      mode: "live",
      webhookPath: "/v1/payments/webhooks/provider",
      signatureRequired: true,
      webhookSecretConfigured: false,
      replayWindowSeconds: 300,
      refundHandling: "manual_review"
    }
  ]
};

export const defaultAiRuntimeConfig: AiRuntimeConfig = {
  ready: false,
  fallbackEnabled: false,
  allowUserContentLogging: false,
  providers: [
    {
      role: "primary",
      providerName: "openai",
      enabled: true,
      apiKeyConfigured: false,
      timeoutMs: 20000,
      sendsUserContent: true
    },
    {
      role: "fallback",
      providerName: "fallback-llm",
      enabled: false,
      apiKeyConfigured: false,
      timeoutMs: 25000,
      sendsUserContent: true
    }
  ]
};

export const defaultConfig: ServiceConfig = {
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 60 * 60 * 24 * 7,
  authSecret: DEVELOPMENT_AUTH_SECRET,
  loginFailureLimit: 5,
  loginFailureWindowSeconds: 60 * 10,
  paymentRuntime: defaultPaymentRuntimeConfig,
  aiRuntime: defaultAiRuntimeConfig
};
