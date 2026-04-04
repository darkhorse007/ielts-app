import { Redirect, router } from "expo-router";
import { useEffect, useEffectEvent, useState } from "react";
import { Text, View } from "react-native";
import { ApiNetworkError, ApiRequestError } from "../src/lib/api-client";
import type { StudyPlanResponse } from "../src/lib/api-types";
import { useAppSession } from "../src/state/app-session";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, StatusPill, TextField } from "../src/ui/primitives";
import { colors } from "../src/ui/theme";

const describeTask = (plan: StudyPlanResponse | null) => {
  const firstTask = plan?.weeks[0]?.tasks[0];
  if (!firstTask) {
    return null;
  }

  return {
    taskId: firstTask.task_id,
    title: firstTask.title,
    skill: firstTask.skill,
    taskType: firstTask.task_type,
    targetMinutes: firstTask.target_minutes,
    completionCriteria: firstTask.completion_criteria
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

type PlanRetryAction = "load_plan" | "adjust_task" | "load_history";

const formatPlanRetryActionLabel = (value: PlanRetryAction): string => {
  switch (value) {
    case "load_plan":
      return "拉取计划";
    case "adjust_task":
      return "更新任务";
    case "load_history":
      return "加载历史";
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

export default function PlanScreen() {
  const { session, runWithAuthorizedClient } = useAppSession();
  const [plan, setPlan] = useState<StudyPlanResponse | null>(null);
  const [statusMessage, setStatusMessage] = useState("未加载");
  const [serverSyncDetail, setServerSyncDetail] = useState("-");
  const [serverSyncAt, setServerSyncAt] = useState<string | null>(null);
  const [lastFailedAction, setLastFailedAction] = useState<PlanRetryAction | null>(null);
  const [targetMinutes, setTargetMinutes] = useState("45");
  const [adjustmentCount, setAdjustmentCount] = useState(0);
  const [latestReason, setLatestReason] = useState("-");
  const [latestAdjustedAt, setLatestAdjustedAt] = useState("-");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const markSyncSuccess = (statusText: string, detail: string): void => {
    setStatusMessage(statusText);
    setServerSyncDetail(detail);
    setServerSyncAt(new Date().toISOString());
    setLastFailedAction(null);
  };

  const markSyncFailure = (action: PlanRetryAction, detail: string): void => {
    setStatusMessage(`${formatPlanRetryActionLabel(action)}失败`);
    setServerSyncDetail(detail);
    setServerSyncAt(new Date().toISOString());
    setLastFailedAction(action);
  };

  const loadPlan = useEffectEvent(async () => {
    if (!session) {
      setPlan(null);
      setStatusMessage("未登录");
      setServerSyncDetail("-");
      setServerSyncAt(null);
      setLastFailedAction(null);
      return;
    }

    setLoading(true);
    try {
      setStatusMessage("正在拉取计划");
      setServerSyncDetail("active plan");
      const response = await runWithAuthorizedClient((apiClient, accessToken) => apiClient.fetchActivePlan(accessToken));
      setPlan(response);
      setAdjustmentCount(response.adjustment_history.length);
      setLatestReason(response.adjustment_history[0]?.reason ?? "-");
      setLatestAdjustedAt(response.adjustment_history[0]?.created_at ?? "-");
      setTargetMinutes(String(response.weeks[0]?.tasks[0]?.target_minutes ?? 45));
      markSyncSuccess("计划已加载", `plan ${response.plan_id} / version ${response.version} / weeks ${response.weeks.length}`);
      setError(null);
    } catch (loadError) {
      const message = toRequestErrorMessage(loadError, "加载计划失败");
      markSyncFailure("load_plan", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    void loadPlan();
  }, [session]);

  const adjust = async (): Promise<void> => {
    const firstTask = describeTask(plan);
    if (!plan || !firstTask) {
      setError("请先加载计划");
      return;
    }

    setLoading(true);
    try {
      setStatusMessage("正在更新任务");
      setServerSyncDetail(`plan ${plan.plan_id} / task ${firstTask.taskId}`);
      const nextPlan = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.adjustPlanTask(accessToken, plan.plan_id, firstTask.taskId, {
          target_minutes: Number(targetMinutes) || 45
        })
      );
      setPlan(nextPlan);
      markSyncSuccess(
        `计划已更新，version=${nextPlan.version}`,
        `plan ${nextPlan.plan_id} / task ${firstTask.taskId} / target_minutes ${nextPlan.weeks[0]?.tasks[0]?.target_minutes ?? "-"}`
      );
      setError(null);
      setAdjustmentCount(nextPlan.adjustment_history.length);
      setLatestReason(nextPlan.adjustment_history[0]?.reason ?? latestReason);
      setLatestAdjustedAt(nextPlan.adjustment_history[0]?.created_at ?? latestAdjustedAt);
    } catch (adjustError) {
      const message = toRequestErrorMessage(adjustError, "调整计划失败");
      markSyncFailure("adjust_task", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const loadAdjustmentHistory = async (): Promise<void> => {
    if (!plan) {
      setError("请先加载计划");
      return;
    }

    setLoading(true);
    try {
      setStatusMessage("正在加载调整历史");
      setServerSyncDetail(`plan ${plan.plan_id}`);
      const result = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getPlanAdjustmentHistory(accessToken, plan.plan_id, {
          page: 1,
          page_size: 20
        })
      );
      setAdjustmentCount(result.total);
      setLatestReason(result.items[0]?.reason ?? "-");
      setLatestAdjustedAt(result.items[0]?.created_at ?? "-");
      markSyncSuccess("已加载计划变更历史", `plan ${plan.plan_id} / history_total ${result.total}`);
      setError(null);
    } catch (historyError) {
      const message = toRequestErrorMessage(historyError, "加载变更历史失败");
      markSyncFailure("load_history", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const retryLastFailedAction = async (): Promise<void> => {
    switch (lastFailedAction) {
      case "load_plan":
        await loadPlan();
        break;
      case "adjust_task":
        await adjust();
        break;
      case "load_history":
        await loadAdjustmentHistory();
        break;
      default:
        break;
    }
  };

  const firstTask = describeTask(plan);

  if (!session) {
    return <Redirect href="/login" />;
  }

  return (
    <AppScreen
      eyebrow="Plan"
      title="8 周计划已进入移动端"
      subtitle="这里直接拉取当前激活计划，并允许对首个任务做最小调整，验证移动端已经接上 plan 与 adjustment 历史链路。"
    >
      <InfoCard tone="accent">
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>计划状态</Text>
        <ButtonRow>
          <StatusPill label={plan?.status ?? "未加载"} tone={plan ? "success" : "neutral"} />
          <StatusPill label={statusMessage} tone={plan ? "accent" : "neutral"} />
        </ButtonRow>
        <View style={{ gap: 6, marginTop: 10 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>plan_id: {plan?.plan_id ?? "-"}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>version: {plan?.version ?? "-"}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>week_count: {plan?.weeks.length ?? 0}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>adjustment_count: {adjustmentCount}</Text>
        </View>
      </InfoCard>

      <InfoCard tone={lastFailedAction ? "accent" : "default"}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>服务端同步</Text>
        <ButtonRow>
          <StatusPill
            label={statusMessage}
            tone={lastFailedAction ? "accent" : serverSyncAt ? "success" : "neutral"}
          />
          <StatusPill
            label={lastFailedAction ? `待重试 ${formatPlanRetryActionLabel(lastFailedAction)}` : "链路已就绪"}
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
              testID="plan.retryLastFailedAction"
            />
          </ButtonRow>
        ) : null}
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>首个任务</Text>
        {firstTask ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}>{firstTask.title}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>task_id: {firstTask.taskId}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>
              {firstTask.skill} / {firstTask.taskType}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>
              {firstTask.targetMinutes} 分钟 · {firstTask.completionCriteria}
            </Text>
          </View>
        ) : (
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>当前没有任务可展示</Text>
        )}
      </InfoCard>

      <TextField
        label="调整首个任务分钟数"
        value={targetMinutes}
        onChangeText={setTargetMinutes}
        keyboardType="number-pad"
        placeholder="例如 45"
      />

      {error ? <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{error}</Text> : null}

      <ButtonRow>
        <PrimaryButton label={loading ? "处理中..." : "刷新计划"} onPress={() => void loadPlan()} disabled={loading} />
        <SecondaryButton label="更新任务时长" onPress={() => void adjust()} disabled={loading} />
      </ButtonRow>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>最近一次调整</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>reason: {latestReason}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>adjusted_at: {latestAdjustedAt}</Text>
        <ButtonRow>
          <PrimaryButton label="加载历史" onPress={() => void loadAdjustmentHistory()} disabled={loading} />
          <SecondaryButton label="去看进度" onPress={() => router.push("/progress")} />
        </ButtonRow>
      </InfoCard>

      <SecondaryButton label="返回首页" onPress={() => router.replace("/home")} />
    </AppScreen>
  );
}
