import Constants from "expo-constants";
import { Platform } from "react-native";
import type { InstanceConfig } from "./runtime-config";

type ExpoConfigSnapshot = {
  version?: string;
  ios?: {
    buildNumber?: string;
    bundleIdentifier?: string;
  };
  android?: {
    versionCode?: number;
    package?: string;
  };
};

export type MobileRuntimeDiagnostics = {
  platform: "ios" | "android";
  appVersion: string;
  nativeBuild: string;
  appIdentifier: string;
  runtimeMode: string;
  executionEnvironment: string;
  appOwnership: string;
  apiBaseUrl: string;
  wsBaseUrl: string;
};

const toDisplayValue = (value: string | number | null | undefined): string => {
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return "-";
};

const getExpoConfigSnapshot = (): ExpoConfigSnapshot => (Constants.expoConfig as ExpoConfigSnapshot | null | undefined) ?? {};

const resolveRuntimeMode = (): string => {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    return "development";
  }
  if (Constants.appOwnership === "expo") {
    return "expo-go";
  }
  if (Constants.executionEnvironment === "standalone") {
    return "native-build";
  }
  return "preview";
};

export const buildMobileRuntimeDiagnostics = (instanceConfig?: InstanceConfig | null): MobileRuntimeDiagnostics => {
  const expoConfig = getExpoConfigSnapshot();
  const isAndroid = Platform.OS === "android";

  return {
    platform: isAndroid ? "android" : "ios",
    appVersion: toDisplayValue(expoConfig.version),
    nativeBuild: isAndroid ? toDisplayValue(expoConfig.android?.versionCode) : toDisplayValue(expoConfig.ios?.buildNumber),
    appIdentifier: isAndroid ? toDisplayValue(expoConfig.android?.package) : toDisplayValue(expoConfig.ios?.bundleIdentifier),
    runtimeMode: resolveRuntimeMode(),
    executionEnvironment: toDisplayValue(Constants.executionEnvironment),
    appOwnership: toDisplayValue(Constants.appOwnership),
    apiBaseUrl: toDisplayValue(instanceConfig?.apiBaseUrl),
    wsBaseUrl: toDisplayValue(instanceConfig?.wsBaseUrl)
  };
};

export const formatMobileRuntimeDiagnostics = (diagnostics: MobileRuntimeDiagnostics): string =>
  [
    "IELTS Mobile runtime diagnostics",
    `platform: ${diagnostics.platform}`,
    `app_version: ${diagnostics.appVersion}`,
    `native_build: ${diagnostics.nativeBuild}`,
    `app_identifier: ${diagnostics.appIdentifier}`,
    `runtime_mode: ${diagnostics.runtimeMode}`,
    `execution_environment: ${diagnostics.executionEnvironment}`,
    `app_ownership: ${diagnostics.appOwnership}`,
    `api_base_url: ${diagnostics.apiBaseUrl}`,
    `ws_base_url: ${diagnostics.wsBaseUrl}`
  ].join("\n");
