import * as SecureStore from "expo-secure-store";
import type { StoredSession } from "./api-types";
import type { InstanceConfig } from "./runtime-config";

const INSTANCE_CONFIG_KEY = "ielts.mobile.instance_config";
const SESSION_KEY = "ielts.mobile.session";

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

export const loadStoredInstanceConfig = async (): Promise<InstanceConfig | null> => {
  const value = await SecureStore.getItemAsync(INSTANCE_CONFIG_KEY);
  return parseJson<InstanceConfig>(value);
};

export const saveStoredInstanceConfig = async (config: InstanceConfig): Promise<void> => {
  await SecureStore.setItemAsync(INSTANCE_CONFIG_KEY, JSON.stringify(config));
};

export const loadStoredSession = async (): Promise<StoredSession | null> => {
  const value = await SecureStore.getItemAsync(SESSION_KEY);
  return parseJson<StoredSession>(value);
};

export const saveStoredSession = async (session: StoredSession): Promise<void> => {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
};

export const clearStoredSession = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(SESSION_KEY);
};
