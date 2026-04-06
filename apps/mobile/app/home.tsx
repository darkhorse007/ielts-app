import { Redirect, router } from "expo-router";
import { Text, View } from "react-native";
import { useHomeConsoleController } from "../src/hooks/use-home-console-controller";
import {
  homeAvailableModules,
  homeEntryRows,
  homePlannedModules,
  type HomeEntryActionConfig
} from "../src/lib/home-entry-config";
import { buildTodayActionList, type HomeActionItem } from "../src/lib/home-actions";
import { buildStudyLoopRecommendation, formatStudyLoopSkillLabel, useStudyLoop } from "../src/state/study-loop";
import { ActionListItem } from "../src/ui/action-list-item";
import { HomeAccountPanel } from "../src/ui/home-account-panel";
import { HomeConnectionSmokePanel } from "../src/ui/home-connection-smoke-panel";
import { HomeEntryPanel } from "../src/ui/home-entry-panel";
import { InstanceConnectionCard } from "../src/ui/instance-connection-card";
import { AppScreen, ButtonRow, InfoCard, SecondaryButton } from "../src/ui/primitives";
import { StudyLoopSummaryBlock } from "../src/ui/study-loop-summary-block";
import { colors } from "../src/ui/theme";

export default function HomeScreen() {
  const { activities, pendingPlanRefreshCount, pendingProgressRefreshCount, ready: studyLoopReady } = useStudyLoop();
  const latestStudyLoopUpdatedAt = activities[0]?.updatedAt ?? "";
  const {
    defaultInstanceConfig,
    instanceConfig,
    session,
    profile,
    profileStatus,
    healthStatus,
    socketStatus,
    planTaskAction,
    resumeCheckpoints,
    loadProfile,
    dismissResumeCheckpoint,
    dismissAllResumeCheckpoints,
    checkHealth,
    checkSpeakingSocket,
    signOut
  } = useHomeConsoleController({
    studyLoopReady,
    latestStudyLoopUpdatedAt
  });
  const recentStudyLoopActivities = activities.slice(0, 3);
  const latestResumeCheckpoint = resumeCheckpoints[0] ?? null;
  const resumeQueue = resumeCheckpoints.slice(1, 3);
  const defaultStudyLoopAction = buildStudyLoopRecommendation(activities);
  const nextStudyLoopAction =
    studyLoopReady &&
    pendingPlanRefreshCount === 0 &&
    pendingProgressRefreshCount === 0 &&
    activities.length === 0 &&
    planTaskAction
      ? planTaskAction
      : defaultStudyLoopAction;
  const todayActions = buildTodayActionList({
    primaryStudyAction: nextStudyLoopAction,
    resumeCheckpoints
  });

  const dismissLatestResumeCheckpoint = async (): Promise<void> => {
    if (!latestResumeCheckpoint) {
      return;
    }

    await dismissResumeCheckpoint(latestResumeCheckpoint.scope);
  };

  const dismissTodayAction = async (item: HomeActionItem): Promise<void> => {
    if (item.source !== "resume" || !item.resumeScope) {
      return;
    }

    await dismissResumeCheckpoint(item.resumeScope);
  };

  const handleSignOut = async (): Promise<void> => {
    await signOut();
    router.replace("/login");
  };

  const handleHomeEntryAction = (action: HomeEntryActionConfig): void => {
    if ("route" in action) {
      router.push(action.route);
      return;
    }

    switch (action.handlerId) {
      case "check_speaking_socket":
        void checkSpeakingSocket();
        break;
      default:
        break;
    }
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
      <InstanceConnectionCard
        title="已绑定实例"
        instanceConfig={instanceConfig}
        defaultInstanceConfig={defaultInstanceConfig}
      />

      <InfoCard tone={todayActions.length > 1 ? "accent" : "default"}>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>今日行动列表</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>today_action_count: {todayActions.length}</Text>
        <View style={{ gap: 10, marginTop: 10 }}>
          {todayActions.map((item, index) => (
            <ActionListItem
              key={item.id}
              title={`action_${index + 1}_title: ${item.title}`}
              detail={`action_${index + 1}_detail: ${item.detail}`}
              metadataLines={[
                `action_${index + 1}_source: ${item.sourceLabel}`,
                `action_${index + 1}_priority: ${item.priorityLabel}`
              ]}
              primaryAction={{
                label: item.actionLabel,
                onPress: () => router.push(item.route),
                testID: `home.todayAction.${index}`
              }}
              secondaryAction={
                item.source === "resume"
                  ? {
                      label: "忽略恢复项",
                      onPress: () => void dismissTodayAction(item),
                      testID: `home.dismissTodayAction.${index}`
                    }
                  : undefined
              }
            />
          ))}
        </View>
      </InfoCard>

      <InfoCard tone={pendingPlanRefreshCount || pendingProgressRefreshCount ? "accent" : "default"}>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>学习主线闭环</Text>
        <StudyLoopSummaryBlock
          pendingPlanRefreshCount={pendingPlanRefreshCount}
          pendingProgressRefreshCount={pendingProgressRefreshCount}
          statusText={studyLoopReady ? `recent_activity_count: ${activities.length}` : "正在恢复最近训练结果..."}
          nextActionTitle={studyLoopReady ? nextStudyLoopAction.title : "-"}
          nextActionDetail={studyLoopReady ? nextStudyLoopAction.detail : "正在生成下一步建议..."}
          activityLines={
            studyLoopReady
              ? recentStudyLoopActivities.map((item) => `${formatStudyLoopSkillLabel(item.skill)} · ${item.summary}`)
              : []
          }
          emptyStateText={studyLoopReady ? "当前还没有新的训练结果需要回看计划或进度。" : undefined}
          primaryAction={{
            label: studyLoopReady ? nextStudyLoopAction.actionLabel : "正在准备建议",
            onPress: () => router.push(nextStudyLoopAction.route),
            disabled: !studyLoopReady
          }}
          secondaryAction={{
            label: "回看进度",
            onPress: () => router.push("/progress")
          }}
        />
      </InfoCard>

      {latestResumeCheckpoint ? (
        <InfoCard>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>上次中断恢复</Text>
          <ActionListItem
            title={`resume_title: ${latestResumeCheckpoint.title}`}
            detail={`resume_detail: ${latestResumeCheckpoint.detail}`}
            metadataLines={[
              `resume_updated_at: ${latestResumeCheckpoint.updatedAt}`,
              `resume_count: ${resumeCheckpoints.length}`
            ]}
            metadataFontSize={13}
            primaryAction={{
              label: "继续上次中断",
              onPress: () => router.push(latestResumeCheckpoint.route),
              testID: "home.resumeCheckpoint"
            }}
            secondaryAction={{
              label: "忽略这次恢复",
              onPress: () => void dismissLatestResumeCheckpoint(),
              testID: "home.dismissResumeCheckpoint"
            }}
          />
          {resumeCheckpoints.length > 1 ? (
            <ButtonRow>
              <SecondaryButton
                label="清空全部恢复项"
                onPress={() => void dismissAllResumeCheckpoints()}
                testID="home.dismissAllResumeCheckpoints"
              />
            </ButtonRow>
          ) : null}
          {resumeQueue.length ? (
            <View style={{ gap: 8, marginTop: 10 }}>
              {resumeQueue.map((item) => (
                <ActionListItem
                  key={item.scope}
                  title={item.title}
                  detail={item.detail}
                  metadataLines={[`updated_at: ${item.updatedAt}`]}
                  metadataFontSize={12}
                  onPress={() => router.push(item.route)}
                  testID={`home.resumeCheckpointItem.${item.scope}`}
                />
              ))}
            </View>
          ) : null}
        </InfoCard>
      ) : null}

      <HomeAccountPanel
        profile={profile}
        profileStatus={profileStatus}
        onRefreshProfile={() => void loadProfile()}
        onSwitchInstance={() => router.push("/instance")}
        onSignOut={() => void handleSignOut()}
      />

      <HomeConnectionSmokePanel
        healthStatus={healthStatus}
        socketStatus={socketStatus}
        onCheckHealth={checkHealth}
        onCheckSpeakingSocket={checkSpeakingSocket}
      />

      <HomeEntryPanel
        availableModules={homeAvailableModules}
        plannedModules={homePlannedModules}
        rows={homeEntryRows}
        onAction={handleHomeEntryAction}
      />

    </AppScreen>
  );
}
