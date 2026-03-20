import { useState } from "react";
import type { ApiClient } from "../lib/api-client";
import { TokenStorage } from "../lib/token-storage";

type StudyPlanPageProps = {
  apiClient: Pick<ApiClient, "fetchActivePlan" | "adjustPlanTask" | "getPlanAdjustmentHistory">;
  tokenStorage: TokenStorage;
};

export const StudyPlanPage = ({ apiClient, tokenStorage }: StudyPlanPageProps) => {
  const [planId, setPlanId] = useState("-");
  const [taskId, setTaskId] = useState("-");
  const [weekCount, setWeekCount] = useState(0);
  const [adjustmentCount, setAdjustmentCount] = useState(0);
  const [latestReason, setLatestReason] = useState("-");
  const [latestAdjustedAt, setLatestAdjustedAt] = useState("-");
  const [targetMinutes, setTargetMinutes] = useState("45");
  const [statusMessage, setStatusMessage] = useState("未加载");
  const [error, setError] = useState<string | null>(null);

  const loadPlan = async (): Promise<void> => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      setError("会话已失效，请重新登录");
      return;
    }

    try {
      const plan = await apiClient.fetchActivePlan(accessToken);
      const firstTask = plan.weeks[0]?.tasks[0];
      setPlanId(plan.plan_id);
      setTaskId(firstTask?.task_id ?? "-");
      setWeekCount(plan.weeks.length);
      setAdjustmentCount(plan.adjustment_history.length);
      setLatestReason(plan.adjustment_history[0]?.reason ?? "-");
      setLatestAdjustedAt(plan.adjustment_history[0]?.created_at ?? "-");
      setStatusMessage("计划已加载");
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载计划失败");
    }
  };

  const adjust = async (): Promise<void> => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      setError("会话已失效，请重新登录");
      return;
    }

    if (planId === "-" || taskId === "-") {
      setError("请先加载计划");
      return;
    }

    try {
      const nextPlan = await apiClient.adjustPlanTask(accessToken, planId, taskId, {
        target_minutes: Number(targetMinutes) || 45
      });
      setStatusMessage(`计划已更新，version=${nextPlan.version}`);
      setError(null);
    } catch (adjustError) {
      setError(adjustError instanceof Error ? adjustError.message : "调整计划失败");
    }
  };

  const loadAdjustmentHistory = async (): Promise<void> => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      setError("会话已失效，请重新登录");
      return;
    }
    if (planId === "-") {
      setError("请先加载计划");
      return;
    }
    try {
      const result = await apiClient.getPlanAdjustmentHistory(accessToken, planId, {
        page: 1,
        page_size: 20
      });
      setAdjustmentCount(result.total);
      setLatestReason(result.items[0]?.reason ?? "-");
      setLatestAdjustedAt(result.items[0]?.created_at ?? "-");
      setStatusMessage("已加载计划变更历史");
      setError(null);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "加载变更历史失败");
    }
  };

  return (
    <section>
      <h1>8周学习计划</h1>
      {error ? <p role="alert">{error}</p> : null}

      <button type="button" onClick={loadPlan}>
        加载计划
      </button>

      <p>plan_id: {planId}</p>
      <p>task_id: {taskId}</p>
      <p>week_count: {weekCount}</p>
      <p>adjustment_count: {adjustmentCount}</p>
      <p>latest_adjustment_reason: {latestReason}</p>
      <p>latest_adjusted_at: {latestAdjustedAt}</p>

      <label htmlFor="plan-target-minutes">调整分钟数</label>
      <input
        id="plan-target-minutes"
        value={targetMinutes}
        onChange={(event) => setTargetMinutes(event.target.value)}
      />

      <button type="button" onClick={adjust}>
        更新任务时长
      </button>
      <button type="button" onClick={loadAdjustmentHistory}>
        加载变更历史
      </button>

      <p>status: {statusMessage}</p>
    </section>
  );
};
