import { Redirect, router } from "expo-router";
import { useEffect, useEffectEvent, useState } from "react";
import { Text, View } from "react-native";
import { ApiClient, runSpeakingWebSocketSmoke } from "../src/lib/api-client";
import type { UserProfileResponse } from "../src/lib/api-types";
import { useAppSession } from "../src/state/app-session";
import {
  AppScreen,
  ButtonRow,
  InfoCard,
  PrimaryButton,
  SecondaryButton,
  StatusPill
} from "../src/ui/primitives";
import { colors } from "../src/ui/theme";

const plannedModules: string[] = [];

const availableModules = [
  "实例配置",
  "注册登录",
  "入门目标",
  "首次诊断",
  "学习计划",
  "学习进度",
  "听力训练",
  "阅读训练",
  "实时口语",
  "写作批改",
  "模考与报告",
  "账户与导出",
  "API/WS smoke"
];

export default function HomeScreen() {
  const { instanceConfig, session, logout, runWithAuthorizedClient } = useAppSession();
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [profileStatus, setProfileStatus] = useState("等待拉取");
  const [healthStatus, setHealthStatus] = useState("未检查");
  const [socketStatus, setSocketStatus] = useState("未检查");

  const loadProfile = useEffectEvent(async () => {
    if (!session) {
      setProfile(null);
      setProfileStatus("未登录");
      return;
    }

    setProfileStatus("正在拉取 /v1/users/me/profile");
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) => apiClient.getProfile(accessToken));
      setProfile(response);
      setProfileStatus("已同步");
    } catch (error) {
      setProfileStatus(error instanceof Error ? error.message : "资料获取失败");
    }
  });

  useEffect(() => {
    void loadProfile();
  }, [session]);

  const checkHealth = async (): Promise<void> => {
    if (!instanceConfig) {
      setHealthStatus("请先配置实例");
      return;
    }

    setHealthStatus("正在检查 /health");
    try {
      const apiClient = new ApiClient(instanceConfig.apiBaseUrl);
      const health = await apiClient.health();
      setHealthStatus(`API 连通: ${health.status}`);
    } catch (error) {
      setHealthStatus(error instanceof Error ? error.message : "API 检查失败");
    }
  };

  const checkSpeakingSocket = async (): Promise<void> => {
    if (!instanceConfig) {
      setSocketStatus("请先配置实例");
      return;
    }

    if (!session) {
      setSocketStatus("请先登录");
      return;
    }

    setSocketStatus("正在创建 session 并连接 WebSocket");
    try {
      const result = await runWithAuthorizedClient(async (apiClient, accessToken) => {
        const sessionResponse = await apiClient.createSpeakingSession(accessToken, {
          topic: "Mobile smoke connection",
          task_type: "core_training"
        });
        if (!sessionResponse.resume_token) {
          throw new Error("服务端未返回 resume_token，无法建立口语 WebSocket smoke");
        }

        try {
          return await runSpeakingWebSocketSmoke({
            wsBaseUrl: instanceConfig.wsBaseUrl,
            sessionId: sessionResponse.session_id,
            resumeToken: sessionResponse.resume_token
          });
        } finally {
          try {
            await apiClient.endSpeakingSession(accessToken, sessionResponse.session_id);
          } catch {
            // Best-effort cleanup for smoke sessions.
          }
        }
      });

      setSocketStatus(`WS 连通: ${result.type} / part ${result.currentPart}`);
    } catch (error) {
      setSocketStatus(error instanceof Error ? error.message : "WS smoke 失败");
    }
  };

  const signOut = async (): Promise<void> => {
    await logout();
    router.replace("/login");
  };

  if (!instanceConfig) {
    return <Redirect href="/instance" />;
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  return (
    <AppScreen
      eyebrow="Mobile Console"
      title="自托管移动端骨架已落地"
      subtitle="当前已打通实例配置、安全会话存储、注册/登录、首页骨架、入门目标、首次诊断、学习计划、学习进度、听力训练、阅读训练、实时口语、写作批改、模考与报告、账户与导出，以及 API / WebSocket 连接 smoke。"
    >
      <InfoCard tone="accent">
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>已绑定实例</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}>{instanceConfig.apiBaseUrl}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>{instanceConfig.wsBaseUrl}</Text>
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>当前登录状态</Text>
        <ButtonRow>
          <StatusPill label={profile?.status ?? "未拉取"} tone={profile ? "success" : "neutral"} />
          <StatusPill label={profileStatus} tone={profile ? "accent" : "neutral"} />
        </ButtonRow>
        {profile ? (
          <View style={{ gap: 6, marginTop: 14 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 14 }}>user_id: {profile.id}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>email: {profile.email ?? "-"}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>phone: {profile.phone ?? "-"}</Text>
          </View>
        ) : null}
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>连接 smoke</Text>
        <View style={{ gap: 10 }}>
          <StatusPill label={healthStatus} tone={healthStatus.includes("ok") ? "success" : "neutral"} />
          <StatusPill label={socketStatus} tone={socketStatus.includes("WS 连通") ? "success" : "neutral"} />
        </View>
        <ButtonRow>
          <PrimaryButton label="检查 API" onPress={checkHealth} />
          <SecondaryButton label="检查 WS" onPress={checkSpeakingSocket} />
        </ButtonRow>
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>已接入学习域</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {availableModules.map((item) => (
            <StatusPill key={item} label={item} tone="success" />
          ))}
        </View>
        <ButtonRow>
          <PrimaryButton label="进入入门目标" onPress={() => router.push("/onboarding")} />
          <SecondaryButton label="进入首次诊断" onPress={() => router.push("/diagnostic")} />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton label="查看计划" onPress={() => router.push("/plan")} />
          <SecondaryButton label="同步进度" onPress={() => router.push("/progress")} />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton label="开始听力训练" onPress={() => router.push("/listening")} />
          <SecondaryButton label="开始阅读训练" onPress={() => router.push("/reading")} />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton label="进入实时口语" onPress={() => router.push("/speaking")} />
          <SecondaryButton label="检查 WS" onPress={checkSpeakingSocket} />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton label="进入写作批改" onPress={() => router.push("/writing")} />
          <SecondaryButton label="查看计划" onPress={() => router.push("/plan")} />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton label="进入模考" onPress={() => router.push("/mock-exam")} testID="home.mockExam" />
          <SecondaryButton label="查看进度" onPress={() => router.push("/progress")} />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton label="进入账户中心" onPress={() => router.push("/account")} testID="home.account" />
          <SecondaryButton label="导出/删除" onPress={() => router.push("/account")} testID="home.accountQuick" />
        </ButtonRow>
      </InfoCard>

      {plannedModules.length ? (
        <InfoCard>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>已规划模块</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {plannedModules.map((item) => (
              <StatusPill key={item} label={item} tone="accent" />
            ))}
          </View>
        </InfoCard>
      ) : null}

      <ButtonRow>
        <PrimaryButton label="刷新资料" onPress={() => void loadProfile()} />
        <SecondaryButton label="切换实例" onPress={() => router.push("/instance")} />
      </ButtonRow>

      <SecondaryButton label="退出登录" onPress={signOut} />
    </AppScreen>
  );
}
