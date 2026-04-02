import fs from "node:fs";

export type ServiceConfig = {
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  authSecret: string;
  loginFailureLimit: number;
  loginFailureWindowSeconds: number;
};

export type ReminderPushRuntimeConfig = {
  apns: {
    enabled: boolean;
    bundleId?: string;
    teamId?: string;
    keyId?: string;
    privateKey?: string;
  };
  fcm: {
    enabled: boolean;
    projectId?: string;
    clientEmail?: string;
    privateKey?: string;
    tokenUri?: string;
  };
};

export const DEVELOPMENT_AUTH_SECRET = "development-auth-secret-for-tests-only-0001";
export const MIN_AUTH_SECRET_LENGTH = 32;
export const DEFAULT_REMINDER_PUSH_FCM_TOKEN_URI = "https://oauth2.googleapis.com/token";

const normalizeSecret = (value: string): string => value.trim();
const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

const normalizeOptional = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const normalizeMultilineSecret = (value: string): string => value.replace(/\\n/g, "\n").trim();

export const resolveBooleanFlagFromEnv = (
  variableName: string,
  env: Record<string, string | undefined> = process.env,
  defaultValue = false
): boolean => {
  const raw = normalizeOptional(env[variableName]);
  if (!raw) {
    return defaultValue;
  }

  const normalized = raw.toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  throw new Error(`${variableName}_INVALID`);
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

const resolveOptionalInlineOrFileSecret = (
  env: Record<string, string | undefined>,
  variableName: string,
  readTextFile: (filePath: string) => string,
  validator: (secret: string, source: string) => string
): string | undefined => resolveInlineOrFileSecret(env, variableName, readTextFile, validator);

const parseJsonRecord = (value: string, source: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${source}_INVALID_JSON`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message === `${source}_INVALID_JSON`) {
      throw error;
    }
    throw new Error(`${source}_INVALID_JSON`);
  }
};

const resolveOptionalJsonRecord = (
  env: Record<string, string | undefined>,
  variableName: string,
  readTextFile: (filePath: string) => string
): Record<string, unknown> | undefined => {
  const raw = resolveOptionalInlineOrFileSecret(env, variableName, readTextFile, validateNonEmptySecret);
  if (!raw) {
    return undefined;
  }
  return parseJsonRecord(raw, variableName);
};

const normalizeOptionalPem = (value: string | undefined): string | undefined => {
  const normalized = normalizeOptional(value ? normalizeMultilineSecret(value) : undefined);
  return normalized ? normalized : undefined;
};

const normalizeOptionalUrl = (value: string | undefined, source: string): string | undefined => {
  const normalized = normalizeOptional(value);
  if (!normalized) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${source}_INVALID`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${source}_INVALID`);
  }

  return parsed.toString();
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

const normalizeOrigin = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed || !URL_SCHEME_PATTERN.test(trimmed)) {
    throw new Error("BROWSER_ALLOWED_ORIGINS_INVALID");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("BROWSER_ALLOWED_ORIGINS_INVALID");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("BROWSER_ALLOWED_ORIGINS_INVALID");
  }

  return parsed.origin;
};

export const resolveAllowedBrowserOriginsFromEnv = (
  env: Record<string, string | undefined> = process.env
): string[] => {
  const raw = normalizeOptional(env.BROWSER_ALLOWED_ORIGINS);
  if (!raw) {
    return [];
  }

  return Array.from(
    new Set(
      raw
        .split(",")
        .map((item) => normalizeOrigin(item))
        .filter(Boolean)
    )
  );
};

export const resolveInternalDebugRoutesEnabledFromEnv = (
  env: Record<string, string | undefined> = process.env
): boolean => {
  return resolveBooleanFlagFromEnv("INTERNAL_DEBUG_ROUTES_ENABLED", env, false);
};

export const resolveReminderPushRuntimeConfigFromEnv = (
  env: Record<string, string | undefined> = process.env,
  readTextFile: (filePath: string) => string = (filePath) => fs.readFileSync(filePath, "utf8")
): ReminderPushRuntimeConfig => {
  const fcmServiceAccount = resolveOptionalJsonRecord(env, "REMINDER_PUSH_FCM_SERVICE_ACCOUNT_JSON", readTextFile);

  const apnsEnabled = resolveBooleanFlagFromEnv("REMINDER_PUSH_APNS_ENABLED", env, false);
  const apnsBundleId = normalizeOptional(env.REMINDER_PUSH_APNS_BUNDLE_ID);
  const apnsTeamId = normalizeOptional(env.REMINDER_PUSH_APNS_TEAM_ID);
  const apnsKeyId = normalizeOptional(env.REMINDER_PUSH_APNS_KEY_ID);
  const apnsPrivateKey = resolveOptionalInlineOrFileSecret(
    env,
    "REMINDER_PUSH_APNS_PRIVATE_KEY",
    readTextFile,
    (value, source) => validateNonEmptySecret(normalizeMultilineSecret(value), source)
  );

  const fcmEnabled = resolveBooleanFlagFromEnv("REMINDER_PUSH_FCM_ENABLED", env, false);
  const fcmProjectId =
    normalizeOptional(env.REMINDER_PUSH_FCM_PROJECT_ID) ??
    (typeof fcmServiceAccount?.project_id === "string" ? normalizeOptional(fcmServiceAccount.project_id) : undefined);
  const fcmClientEmail =
    normalizeOptional(env.REMINDER_PUSH_FCM_CLIENT_EMAIL) ??
    (typeof fcmServiceAccount?.client_email === "string"
      ? normalizeOptional(fcmServiceAccount.client_email)
      : undefined);
  const fcmPrivateKey =
    resolveOptionalInlineOrFileSecret(env, "REMINDER_PUSH_FCM_PRIVATE_KEY", readTextFile, (value, source) =>
      validateNonEmptySecret(normalizeMultilineSecret(value), source)
    ) ??
    normalizeOptionalPem(typeof fcmServiceAccount?.private_key === "string" ? fcmServiceAccount.private_key : undefined);
  const fcmTokenUri =
    normalizeOptionalUrl(env.REMINDER_PUSH_FCM_TOKEN_URI, "REMINDER_PUSH_FCM_TOKEN_URI") ??
    normalizeOptionalUrl(
      typeof fcmServiceAccount?.token_uri === "string" ? fcmServiceAccount.token_uri : undefined,
      "REMINDER_PUSH_FCM_SERVICE_ACCOUNT_JSON_TOKEN_URI"
    ) ??
    DEFAULT_REMINDER_PUSH_FCM_TOKEN_URI;

  return {
    apns: {
      enabled: apnsEnabled,
      bundleId: apnsBundleId,
      teamId: apnsTeamId,
      keyId: apnsKeyId,
      privateKey: apnsPrivateKey
    },
    fcm: {
      enabled: fcmEnabled,
      projectId: fcmProjectId,
      clientEmail: fcmClientEmail,
      privateKey: fcmPrivateKey,
      tokenUri: fcmTokenUri
    }
  };
};

export const defaultConfig: ServiceConfig = {
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 60 * 60 * 24 * 7,
  authSecret: DEVELOPMENT_AUTH_SECRET,
  loginFailureLimit: 5,
  loginFailureWindowSeconds: 60 * 10
};
