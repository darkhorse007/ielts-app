import * as SecureStore from "expo-secure-store";
import type { StoredSession } from "./api-types";
import type { InstanceConfig } from "./runtime-config";

const STORAGE_PREFIX = "ielts.mobile";
const INSTANCE_CONFIG_KEY = `${STORAGE_PREFIX}.instance_config`;
const SESSION_KEY = `${STORAGE_PREFIX}.session`;

const parseJson = <T>(value: string | null): T | null => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export const buildScopedStorageKey = (...parts: string[]): string => [STORAGE_PREFIX, ...parts].join(".");

export const loadStoredJson = async <T>(key: string): Promise<T | null> => {
  const value = await SecureStore.getItemAsync(key);
  return parseJson<T>(value);
};

export const saveStoredJson = async (key: string, value: unknown): Promise<void> => {
  await SecureStore.setItemAsync(key, JSON.stringify(value));
};

export const clearStoredJson = async (key: string): Promise<void> => {
  await SecureStore.deleteItemAsync(key);
};

export const loadStoredInstanceConfig = async (): Promise<InstanceConfig | null> => {
  return loadStoredJson<InstanceConfig>(INSTANCE_CONFIG_KEY);
};

export const saveStoredInstanceConfig = async (config: InstanceConfig): Promise<void> => {
  await saveStoredJson(INSTANCE_CONFIG_KEY, config);
};

export const loadStoredSession = async (): Promise<StoredSession | null> => {
  return loadStoredJson<StoredSession>(SESSION_KEY);
};

export const saveStoredSession = async (session: StoredSession): Promise<void> => {
  await saveStoredJson(SESSION_KEY, session);
};

export const clearStoredSession = async (): Promise<void> => {
  await clearStoredJson(SESSION_KEY);
};
