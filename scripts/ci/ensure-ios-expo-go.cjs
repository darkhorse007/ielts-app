#!/usr/bin/env node
"use strict";

const path = require("path");
const { getConfig } = require("@expo/config");
const { AppleDeviceManager } = require("@expo/cli/build/src/start/platforms/ios/AppleDeviceManager");
const { ExpoGoInstaller } = require("@expo/cli/build/src/start/platforms/ExpoGoInstaller");
const { downloadExpoGoAsync } = require("@expo/cli/build/src/utils/downloadExpoGoAsync");

function getEnv(name, fallback = "") {
  const value = process.env[name];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

async function main() {
  const simulatorUdid = getEnv("SIMULATOR_UDID");
  const simulatorName = getEnv("SIMULATOR_NAME", simulatorUdid);
  const expoGoBundleId = getEnv("EXPO_GO_BUNDLE_ID", "host.exp.Exponent");
  const projectRoot = getEnv("EXPO_PROJECT_ROOT", path.resolve(process.cwd(), "apps/mobile"));

  if (!simulatorUdid) {
    throw new Error("SIMULATOR_UDID is required");
  }

  const { exp } = getConfig(projectRoot, {
    skipSDKVersionRequirement: true,
  });
  const sdkVersion = exp.sdkVersion;

  if (!sdkVersion) {
    throw new Error(`sdkVersion is required in Expo config: ${projectRoot}`);
  }

  const deviceManager = new AppleDeviceManager({
    udid: simulatorUdid,
    name: simulatorName || simulatorUdid,
    osType: "iOS",
  });
  const installer = new ExpoGoInstaller("ios", expoGoBundleId, sdkVersion);

  const installedContainerPath =
    await deviceManager.isAppInstalledAndIfSoReturnContainerPathForIOSAsync(expoGoBundleId);
  let shouldInstall = !installedContainerPath;

  if (installedContainerPath) {
    const [installedVersion, expectedVersion] = await Promise.all([
      deviceManager.getAppVersionAsync(expoGoBundleId, {
        containerPath: typeof installedContainerPath === "string" ? installedContainerPath : undefined,
      }),
      installer.getExpectedExpoGoClientVersionAsync(),
    ]);

    if (expectedVersion && installer.isInstalledClientVersionMismatched(installedVersion, expectedVersion)) {
      console.log(
        `Expo Go version mismatch on ${simulatorName}; reinstalling ${installedVersion ?? "unknown"} -> ${expectedVersion}`
      );
      await deviceManager.uninstallAppAsync(expoGoBundleId);
      shouldInstall = true;
    } else {
      console.log(
        `Expo Go is ready on ${simulatorName}${installedVersion ? ` (${installedVersion})` : ""}`
      );
    }
  }

  if (shouldInstall) {
    console.log(`Installing Expo Go on ${simulatorName} for SDK ${sdkVersion}`);
    const bundlePath = await downloadExpoGoAsync("ios", { sdkVersion });
    await deviceManager.installAppAsync(bundlePath);
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
