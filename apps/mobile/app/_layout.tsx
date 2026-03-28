import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppSessionProvider } from "../src/state/app-session";
import { colors } from "../src/ui/theme";

export default function RootLayout() {
  return (
    <AppSessionProvider>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: colors.canvas
            },
            headerTintColor: colors.textPrimary,
            headerShadowVisible: false,
            headerTitleStyle: {
              fontWeight: "700"
            },
            contentStyle: {
              backgroundColor: colors.canvas
            }
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="instance" options={{ title: "实例配置" }} />
          <Stack.Screen name="login" options={{ title: "登录" }} />
          <Stack.Screen name="register" options={{ title: "注册" }} />
          <Stack.Screen name="home" options={{ title: "Mobile Console" }} />
          <Stack.Screen name="onboarding" options={{ title: "入门目标" }} />
          <Stack.Screen name="diagnostic" options={{ title: "首次诊断" }} />
          <Stack.Screen name="plan" options={{ title: "学习计划" }} />
          <Stack.Screen name="progress" options={{ title: "学习进度" }} />
          <Stack.Screen name="listening" options={{ title: "听力训练" }} />
          <Stack.Screen name="reading" options={{ title: "阅读训练" }} />
          <Stack.Screen name="speaking" options={{ title: "实时口语" }} />
          <Stack.Screen name="writing" options={{ title: "写作批改" }} />
          <Stack.Screen name="mock-exam" options={{ title: "模考与报告" }} />
          <Stack.Screen name="account" options={{ title: "账户中心" }} />
        </Stack>
      </SafeAreaProvider>
    </AppSessionProvider>
  );
}
