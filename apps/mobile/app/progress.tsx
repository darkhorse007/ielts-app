import { Redirect, router } from "expo-router";
import { Platform, Text, View } from "react-native";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ApiNetworkError, ApiRequestError } from "../src/lib/api-client";
import { useAppForegroundEffect } from "../src/hooks/use-app-foreground-effect";
import type { ProgressConflictHistoryResponse, ProgressResponse } from "../src/lib/api-types";
import { useAppSession } from "../src/state/app-session";
import { buildStudyLoopRecommendation, formatStudyLoopSkillLabel, useStudyLoop } from "../src/state/study-loop";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, StatusPill, TextField } from "../src/ui/primitives";
import { StudyLoopSummaryBlock } from "../src/ui/study-loop-summary-block";
import { colors } from "../src/ui/theme";

const toEditableState = (snapshot: ProgressResponse) => ({
  listeningCompleted: String(snapshot.listening_completed),
  speakingCompleted: String(snapshot.speaking_completed),
  readingCompleted: String(snapshot.reading_completed),
  writingCompleted: String(snapshot.writing_completed),
  totalStudyMinutes: String(snapshot.total_study_minutes),
  streakDays: String(snapshot.streak_days)
});

const formatFollowUpActionLabel = (route: string, skill: ReturnType<typeof formatStudyLoopSkillLabel>): string => {
  switch (route) {
    case "/plan":
      return "回到学习计划";
    case "/progress":
      return "回到学习进度";
    default:
      return `回到${skill}训练`;
  }
};

type ProgressFollowUpSummary = {
  title: string;
  detail: string;
  route: string;
  actionLabel: string;
  hintText: string;
};

type ProgressConflictItem = ProgressConflictHistoryResponse["items"][number];
type ProgressConflictGuidance = {
  label: string;
  route: string;
  detail: string;
};

const buildPlanFollowUpSummary = (detail: string): ProgressFollowUpSummary => ({
  title: "先回看学习计划",
  detail,
  route: "/plan",
  actionLabel: "回到学习计划",
  hintText: detail
});

const buildDefaultFollowUpSummary = ({
  activities,
  pendingActivities,
  nextStudyLoopAction
}: {
  activities: ReturnType<typeof useStudyLoop>["activities"];
  pendingActivities: ReturnType<typeof useStudyLoop>["activities"];
  nextStudyLoopAction: ReturnType<typeof buildStudyLoopRecommendation>;
}): ProgressFollowUpSummary => {
  const latestRelevantActivity = pendingActivities[0] ?? activities[0] ?? null;

  if (latestRelevantActivity) {
    return {
      title: nextStudyLoopAction.title,
      detail: nextStudyLoopAction.detail,
      route: nextStudyLoopAction.route,
      actionLabel: formatFollowUpActionLabel(
        nextStudyLoopAction.route,
        formatStudyLoopSkillLabel(latestRelevantActivity.skill)
      ),
      hintText: pendingActivities.length
        ? `优先核对最近 ${formatStudyLoopSkillLabel(pendingActivities[0].skill)} 结果是否已写入统计。`
        : nextStudyLoopAction.route === "/plan"
          ? "进度侧已消化，下一步回计划页查看任务调整。"
          : nextStudyLoopAction.route === "/diagnostic"
            ? "当前没有待同步训练，可返回诊断或训练页继续推进。"
            : "进度侧已消化，可回到最近训练继续推进。"
    };
  }

  return {
    title: nextStudyLoopAction.title,
    detail: nextStudyLoopAction.detail,
    route: nextStudyLoopAction.route,
    actionLabel: nextStudyLoopAction.actionLabel,
    hintText:
      nextStudyLoopAction.route === "/plan"
        ? "进度侧已消化，下一步回计划页查看任务调整。"
        : nextStudyLoopAction.route === "/diagnostic"
          ? "当前没有待同步训练，可返回诊断或训练页继续推进。"
          : "进度侧已消化，可回到最近训练继续推进。"
  };
};

const formatIsoDateTime = (value?: string | null): string => {
  if (!value) {
    return "-";
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Date(timestamp).toLocaleString("zh-CN", {
    hour12: false
  });
};

const formatConflictFieldLabel = (field: ProgressConflictItem["field"]): string => {
  switch (field) {
    case "listening_completed":
      return "听力完成数";
    case "speaking_completed":
      return "口语完成数";
    case "reading_completed":
      return "阅读完成数";
    case "writing_completed":
      return "写作完成数";
    case "total_study_minutes":
      return "总学习分钟数";
    case "streak_days":
      return "连续学习天数";
    default:
      return field;
  }
};

const buildConflictGuidance = (item: ProgressConflictItem): ProgressConflictGuidance => {
  switch (item.field) {
    case "listening_completed":
      return {
        label: "核对听力训练",
        route: "/listening",
        detail: "优先检查最近一次听力提交是否重复写回。"
      };
    case "speaking_completed":
      return {
        label: "核对口语训练",
        route: "/speaking",
        detail: "优先检查最近一次口语会话是否被跨端重复同步。"
      };
    case "reading_completed":
      return {
        label: "核对阅读训练",
        route: "/reading",
        detail: "优先检查最近一次阅读提交是否重复写回。"
      };
    case "writing_completed":
      return {
        label: "核对写作训练",
        route: "/writing",
        detail: "优先检查最近一次写作批改或改写复评是否重复写回。"
      };
    case "total_study_minutes":
      return {
        label: "回看学习计划",
        route: "/plan",
        detail: "累计分钟冲突通常来自跨端重复同步，先回计划页确认最近训练是否已消化。"
      };
    case "streak_days":
      return {
        label: "回看学习计划",
        route: "/plan",
        detail: "连续天数冲突通常来自跨端打卡顺序差异，先回计划页确认当前主线。"
      };
    default:
      return {
        label: "回看学习计划",
        route: "/plan",
        detail: "先回计划页确认主线任务，再决定是否需要重新进入对应训练页核对。"
      };
  }
};

type ProgressRetryAction = "load_progress" | "sync_progress" | "load_conflicts";

const formatProgressRetryActionLabel = (value: ProgressRetryAction): string => {
  switch (value) {
    case "load_progress":
      return "刷新进度";
    case "sync_progress":
      return "同步进度";
    case "load_conflicts":
      return "加载冲突";
    default:
      return value;
  }
};

const toRequestErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiNetworkError) {
    return error.message;
  }

  if (error instanceof ApiRequestError) {
    const requestLine = error.method && error.url ? ` (${error.method} ${error.url})` : "";
    return `${error.message}${requestLine}`;
  }

  return error instanceof Error ? error.message : fallback;
};

export default function ProgressScreen() {
  const { session, runWithAuthorizedClient } = useAppSession();
  const {
    activities,
    ready: studyLoopReady,
    pendingPlanRefreshCount,
    pendingProgressRefreshCount,
    acknowledgeProgressRefresh
  } = useStudyLoop();
  const [snapshot, setSnapshot] = useState<ProgressResponse | null>(null);
  const [listeningCompleted, setListeningCompleted] = useState("0");
  const [speakingCompleted, setSpeakingCompleted] = useState("0");
  const [readingCompleted, setReadingCompleted] = useState("0");
  const [writingCompleted, setWritingCompleted] = useState("0");
  const [totalStudyMinutes, setTotalStudyMinutes] = useState("0");
  const [streakDays, setStreakDays] = useState("0");
  const [conflictCount, setConflictCount] = useState(0);
  const [conflictItems, setConflictItems] = useState<ProgressConflictItem[]>([]);
  const [statusMessage, setStatusMessage] = useState("未同步");
  const [serverSyncDetail, setServerSyncDetail] = useState("-");
  const [serverSyncAt, setServerSyncAt] = useState<string | null>(null);
  const [lastFailedAction, setLastFailedAction] = useState<ProgressRetryAction | null>(null);
  const [followUpOverride, setFollowUpOverride] = useState<ProgressFollowUpSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const initialLoadUserIdRef = useRef<string | null>(null);

  const markSyncSuccess = (statusText: string, detail: string): void => {
    setStatusMessage(statusText);
    setServerSyncDetail(detail);
    setServerSyncAt(new Date().toISOString());
    setLastFailedAction(null);
  };

  const markSyncFailure = (action: ProgressRetryAction, detail: string): void => {
    setStatusMessage(`${formatProgressRetryActionLabel(action)}失败`);
    setServerSyncDetail(detail);
    setServerSyncAt(new Date().toISOString());
    setLastFailedAction(action);
  };

  const load = useEffectEvent(async () => {
    if (!session) {
      setSnapshot(null);
      setConflictCount(0);
      setConflictItems([]);
      setStatusMessage("未登录");
      setServerSyncDetail("-");
      setServerSyncAt(null);
      setLastFailedAction(null);
      return;
    }

    setLoading(true);
    try {
      const pendingCount = pendingProgressRefreshCount;
      setStatusMessage("正在刷新进度");
      setServerSyncDetail("progress snapshot");
      const response = await runWithAuthorizedClient((apiClient, accessToken) => apiClient.getProgress(accessToken));
      setSnapshot(response);
      const editable = toEditableState(response);
      setListeningCompleted(editable.listeningCompleted);
      setSpeakingCompleted(editable.speakingCompleted);
      setReadingCompleted(editable.readingCompleted);
      setWritingCompleted(editable.writingCompleted);
      setTotalStudyMinutes(editable.totalStudyMinutes);
      setStreakDays(editable.streakDays);
      markSyncSuccess(
        pendingCount > 0 ? `已按最近 ${pendingCount} 条训练结果刷新进度` : "已加载服务端进度",
        `progress version ${response.server_version} / updated_at ${response.updated_at}`
      );
      setFollowUpOverride(null);
      if (pendingCount > 0) {
        acknowledgeProgressRefresh();
      }
      setError(null);
    } catch (loadError) {
      const message = toRequestErrorMessage(loadError, "加载失败");
      markSyncFailure("load_progress", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    const userId = session?.userId ?? null;
    if (!userId) {
      initialLoadUserIdRef.current = null;
      return;
    }

    if (!studyLoopReady) {
      return;
    }

    if (initialLoadUserIdRef.current !== userId) {
      initialLoadUserIdRef.current = userId;
      void load();
      return;
    }

    if (pendingProgressRefreshCount > 0) {
      void load();
    }
  }, [load, pendingProgressRefreshCount, session?.userId, studyLoopReady]);

  useAppForegroundEffect(
    async () => {
      if (loading) {
        return;
      }

      await load();
    },
    {
      enabled: Boolean(session?.userId && studyLoopReady)
    }
  );

  const sync = async (): Promise<void> => {
    setLoading(true);
    try {
      const pendingCount = pendingProgressRefreshCount;
      setStatusMessage("正在同步进度");
      setServerSyncDetail(`device mobile-${Platform.OS}`);
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.syncProgress(accessToken, {
          device_id: `mobile-${Platform.OS}`,
          client_updated_at: new Date().toISOString(),
          progress: {
            listening_completed: Number(listeningCompleted) || 0,
            speaking_completed: Number(speakingCompleted) || 0,
            reading_completed: Number(readingCompleted) || 0,
            writing_completed: Number(writingCompleted) || 0,
            total_study_minutes: Number(totalStudyMinutes) || 0,
            streak_days: Number(streakDays) || 0
          }
        })
      );
      setSnapshot(response);
      const editable = toEditableState(response);
      setListeningCompleted(editable.listeningCompleted);
      setSpeakingCompleted(editable.speakingCompleted);
      setReadingCompleted(editable.readingCompleted);
      setWritingCompleted(editable.writingCompleted);
      setTotalStudyMinutes(editable.totalStudyMinutes);
      setStreakDays(editable.streakDays);
      const conflicts = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getProgressConflicts(accessToken)
      );
      setConflictCount(conflicts.items.length);
      setConflictItems(conflicts.items);
      if (response.stale_request) {
        setFollowUpOverride(buildPlanFollowUpSummary("服务端进度已覆盖本地修改，下一步先回计划页核对当前任务。"));
      } else if (conflicts.items.length > 0) {
        setFollowUpOverride(
          buildPlanFollowUpSummary(`检测到 ${conflicts.items.length} 条进度冲突，下一步先回计划页确认主线任务。`)
        );
      } else {
        setFollowUpOverride(null);
      }
      markSyncSuccess(
        response.stale_request
          ? "同步请求为旧版本，已回退服务端数据"
          : pendingCount > 0
            ? `同步成功，并已消化最近 ${pendingCount} 条训练结果`
            : "同步成功",
        `progress version ${response.server_version} / conflicts ${conflicts.items.length} / stale ${response.stale_request ? "yes" : "no"}`
      );
      if (pendingCount > 0) {
        acknowledgeProgressRefresh();
      }
      setError(null);
    } catch (syncError) {
      const message = toRequestErrorMessage(syncError, "同步失败");
      markSyncFailure("sync_progress", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const reloadConflicts = async (): Promise<void> => {
    setLoading(true);
    try {
      setStatusMessage("正在加载冲突历史");
      setServerSyncDetail("progress conflicts");
      const conflicts = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getProgressConflicts(accessToken)
      );
      setConflictCount(conflicts.items.length);
      setConflictItems(conflicts.items);
      setFollowUpOverride(
        conflicts.items.length > 0
          ? buildPlanFollowUpSummary(`检测到 ${conflicts.items.length} 条进度冲突，下一步先回计划页确认主线任务。`)
          : null
      );
      markSyncSuccess("已加载冲突历史", `conflicts ${conflicts.items.length}`);
      setError(null);
    } catch (conflictError) {
      const message = toRequestErrorMessage(conflictError, "加载冲突失败");
      markSyncFailure("load_conflicts", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const retryLastFailedAction = async (): Promise<void> => {
    switch (lastFailedAction) {
      case "load_progress":
        await load();
        break;
      case "sync_progress":
        await sync();
        break;
      case "load_conflicts":
        await reloadConflicts();
        break;
      default:
        break;
    }
  };

  if (!session) {
    return <Redirect href="/login" />;
  }

  const pendingActivities = activities.filter((item) => item.progressPending).slice(0, 3);
  const nextStudyLoopAction = buildStudyLoopRecommendation(activities);
  const followUpSummary =
    followUpOverride ??
    buildDefaultFollowUpSummary({
      activities,
      pendingActivities,
      nextStudyLoopAction
    });
  const topConflictGuidance = conflictItems[0] ? buildConflictGuidance(conflictItems[0]) : null;

  return (
    <AppScreen
      eyebrow="Progress"
      title="跨端进度同步已进入移动端"
      subtitle="这里复用 Web 端已有的 progress / sync / conflicts 契约，用移动端 device_id 做进度写回与冲突检查。"
    >
      <InfoCard tone="accent">
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>当前快照</Text>
        <ButtonRow>
          <StatusPill label={statusMessage} tone={snapshot ? "success" : "neutral"} />
          <StatusPill label={`conflicts ${conflictCount}`} tone={conflictCount > 0 ? "accent" : "success"} />
        </ButtonRow>
        <View style={{ gap: 6, marginTop: 10 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>server_version: {snapshot?.server_version ?? "-"}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>updated_at: {snapshot?.updated_at ?? "-"}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            last_synced_device_id: {snapshot?.last_synced_device_id ?? "-"}
          </Text>
        </View>
        <StudyLoopSummaryBlock
          pendingPlanRefreshCount={pendingPlanRefreshCount}
          pendingProgressRefreshCount={pendingProgressRefreshCount}
          nextActionTitle={followUpSummary.title}
          nextActionDetail={followUpSummary.detail}
          activityLines={pendingActivities.map(
            (item) => `待同步训练: ${formatStudyLoopSkillLabel(item.skill)} · ${item.summary}`
          )}
          hintText={followUpSummary.hintText}
          primaryAction={{
            label: followUpSummary.actionLabel,
            onPress: () => router.push(followUpSummary.route),
            testID: "progress.followUpAction"
          }}
          secondaryAction={{
            label: "回看计划",
            onPress: () => router.push("/plan")
          }}
        />
      </InfoCard>

      <InfoCard tone={lastFailedAction ? "accent" : "default"}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>服务端同步</Text>
        <ButtonRow>
          <StatusPill
            label={statusMessage}
            tone={lastFailedAction ? "accent" : serverSyncAt ? "success" : "neutral"}
          />
          <StatusPill
            label={lastFailedAction ? `待重试 ${formatProgressRetryActionLabel(lastFailedAction)}` : "链路已就绪"}
            tone={lastFailedAction ? "accent" : serverSyncAt ? "success" : "neutral"}
          />
        </ButtonRow>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>server_sync_status: {statusMessage}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>server_sync_at: {formatIsoDateTime(serverSyncAt)}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>server_sync_result: {serverSyncDetail}</Text>
        {lastFailedAction ? (
          <ButtonRow>
            <PrimaryButton
              label="重试上次失败操作"
              onPress={() => void retryLastFailedAction()}
              disabled={loading}
              testID="progress.retryLastFailedAction"
            />
          </ButtonRow>
        ) : null}
      </InfoCard>

      {conflictItems.length > 0 ? (
        <InfoCard tone="accent">
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>冲突摘要</Text>
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>conflict_summary_count: {conflictItems.length}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
            以下展示最近冲突记录，先以服务端主数据为准，再回计划页确认当前主线任务。
          </Text>
          <View style={{ gap: 10, marginTop: 6 }}>
            {conflictItems.slice(0, 3).map((item, index) => (
              <View
                key={item.id}
                style={{
                  gap: 4,
                  paddingTop: index === 0 ? 0 : 10,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: colors.cardBorder
                }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 14 }}>
                  conflict_{index + 1}: {formatConflictFieldLabel(item.field)} 本地 {item.incoming_value} / 服务端{" "}
                  {item.server_value}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                  conflict_{index + 1}_suggestion: {buildConflictGuidance(item).detail}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                  conflict_{index + 1}_time: client {formatIsoDateTime(item.client_updated_at)} / server{" "}
                  {formatIsoDateTime(item.server_updated_at)}
                </Text>
              </View>
            ))}
            {conflictItems.length > 3 ? (
              <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                conflict_summary_remaining: 另有 {conflictItems.length - 3} 条冲突，请继续加载历史核对。
              </Text>
            ) : null}
          </View>
          {topConflictGuidance ? (
            <ButtonRow>
              <PrimaryButton
                label={topConflictGuidance.label}
                onPress={() => router.push(topConflictGuidance.route)}
                testID="progress.conflictFollowUpAction"
              />
              <SecondaryButton label="回到学习计划" onPress={() => router.push("/plan")} />
            </ButtonRow>
          ) : null}
        </InfoCard>
      ) : null}

      <TextField
        label="听力完成数"
        value={listeningCompleted}
        onChangeText={setListeningCompleted}
        keyboardType="number-pad"
      />
      <TextField
        label="口语完成数"
        value={speakingCompleted}
        onChangeText={setSpeakingCompleted}
        keyboardType="number-pad"
      />
      <TextField
        label="阅读完成数"
        value={readingCompleted}
        onChangeText={setReadingCompleted}
        keyboardType="number-pad"
      />
      <TextField
        label="写作完成数"
        value={writingCompleted}
        onChangeText={setWritingCompleted}
        keyboardType="number-pad"
      />
      <TextField
        label="总学习分钟数"
        value={totalStudyMinutes}
        onChangeText={setTotalStudyMinutes}
        keyboardType="number-pad"
      />
      <TextField
        label="连续学习天数"
        value={streakDays}
        onChangeText={setStreakDays}
        keyboardType="number-pad"
      />

      {error ? <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{error}</Text> : null}

      <ButtonRow>
        <PrimaryButton label={loading ? "处理中..." : "刷新进度"} onPress={() => void load()} disabled={loading} />
        <SecondaryButton label="同步进度" onPress={() => void sync()} disabled={loading} />
      </ButtonRow>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>同步校验</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>device_id: mobile-{Platform.OS}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          这一步用于验证移动端已经接上 server snapshot、sync 和 conflict history 三条接口。
        </Text>
        <ButtonRow>
          <PrimaryButton label="加载冲突历史" onPress={() => void reloadConflicts()} disabled={loading} />
          <SecondaryButton label="同步进度" onPress={() => void sync()} disabled={loading} />
        </ButtonRow>
      </InfoCard>

      <SecondaryButton label="返回首页" onPress={() => router.replace("/home")} />
    </AppScreen>
  );
}
