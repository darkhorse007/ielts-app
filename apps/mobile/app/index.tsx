import { Redirect } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { useAppSession } from "../src/state/app-session";
import { colors } from "../src/ui/theme";

export default function IndexScreen() {
  const { ready, instanceConfig, session } = useAppSession();

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.canvas,
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24
        }}
      >
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={{ color: colors.textMuted, fontSize: 16 }}>正在加载移动端工作台...</Text>
      </View>
    );
  }

  if (!instanceConfig) {
    return <Redirect href="/instance" />;
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  return <Redirect href="/home" />;
}
