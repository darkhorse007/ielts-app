import { Linking } from "react-native";

export const openAppSettingsAsync = async (): Promise<boolean> => {
  if (typeof Linking.openSettings !== "function") {
    return false;
  }

  try {
    await Linking.openSettings();
    return true;
  } catch {
    return false;
  }
};
