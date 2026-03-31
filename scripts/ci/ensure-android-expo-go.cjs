#!/usr/bin/env node
"use strict";

const path = require("path");
const { getConfig } = require("@expo/config");
const { AndroidDeviceManager } = require("@expo/cli/build/src/start/platforms/android/AndroidDeviceManager");
const { ExpoGoInstaller } = require("@expo/cli/build/src/start/platforms/ExpoGoInstaller");
const { downloadExpoGoAsync } = require("@expo/cli/build/src/utils/downloadExpoGoAsync");

function getEnv(name, fallback = "") {
  const value = process.env[name];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

async function main() {
  const deviceSerial = getEnv("DEVICE_SERIAL");
  const appUrl = getEnv("APP_URL");
  const expoGoPackage = getEnv("EXPO_GO_PACKAGE", "host.exp.exponent");
  const projectRoot = getEnv("EXPO_PROJECT_ROOT", path.resolve(process.cwd(), "apps/mobile"));

  if (!deviceSerial) {
    throw new Error("DEVICE_SERIAL is required");
  }

  if (!appUrl) {
    throw new Error("APP_URL is required");
  }

  const { exp } = getConfig(projectRoot, {
    skipSDKVersionRequirement: true,
  });
  const sdkVersion = exp.sdkVersion;

  if (!sdkVersion) {
    throw new Error(`sdkVersion is required in Expo config: ${projectRoot}`);
  }

  const deviceManager = new AndroidDeviceManager({
    pid: deviceSerial,
    name: deviceSerial,
    type: deviceSerial.startsWith("emulator-") ? "emulator" : "device",
    isBooted: true,
    isAuthorized: true,
  });
  const installer = new ExpoGoInstaller("android", expoGoPackage, sdkVersion);

  const isInstalled = await deviceManager.isAppInstalledAndIfSoReturnContainerPathForIOSAsync(
    expoGoPackage
  );
  let shouldInstall = !isInstalled;

  if (isInstalled) {
    const [installedVersion, expectedVersion] = await Promise.all([
      deviceManager.getAppVersionAsync(expoGoPackage),
      installer.getExpectedExpoGoClientVersionAsync(),
    ]);

    if (expectedVersion && installer.isInstalledClientVersionMismatched(installedVersion, expectedVersion)) {
      console.log(
        `Expo Go version mismatch on ${deviceSerial}; reinstalling ${installedVersion ?? "unknown"} -> ${expectedVersion}`
      );
      await deviceManager.uninstallAppAsync(expoGoPackage);
      shouldInstall = true;
    } else {
      console.log(
        `Expo Go is ready on ${deviceSerial}${installedVersion ? ` (${installedVersion})` : ""}`
      );
    }
  }

  if (shouldInstall) {
    console.log(`Installing Expo Go on ${deviceSerial} for SDK ${sdkVersion}`);
    const binaryPath = await downloadExpoGoAsync("android", { sdkVersion });
    await deviceManager.installAppAsync(binaryPath);
  }

  await deviceManager.openUrlAsync(appUrl);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
