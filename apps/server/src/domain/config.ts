import fs from "node:fs";

export type ServiceConfig = {
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  authSecret: string;
  loginFailureLimit: number;
  loginFailureWindowSeconds: number;
};

export const DEVELOPMENT_AUTH_SECRET = "development-auth-secret-for-tests-only-0001";
export const MIN_AUTH_SECRET_LENGTH = 32;

const normalizeSecret = (value: string): string => value.trim();

const normalizeOptional = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
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

export const defaultConfig: ServiceConfig = {
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 60 * 60 * 24 * 7,
  authSecret: DEVELOPMENT_AUTH_SECRET,
  loginFailureLimit: 5,
  loginFailureWindowSeconds: 60 * 10
};
