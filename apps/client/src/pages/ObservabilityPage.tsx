import { useEffect, useState } from "react";
import type { ApiClient } from "../lib/api-client";
import { TokenStorage } from "../lib/token-storage";

type ObservabilityPageProps = {
  apiClient: Pick<
    ApiClient,
    | "analyticsBatch"
    | "getAnalyticsSummary"
    | "upsertAnalyticsExperiment"
    | "stopAnalyticsExperiment"
    | "getAnalyticsExperiments"
    | "getAnalyticsExperimentAssignment"
    | "getChurnRisks"
    | "triggerChurnStrategy"
    | "getChurnEffect"
    | "getProviderHealth"
    | "evaluateReleaseGate"
    | "getReleaseOperationalMetrics"
    | "startCanary"
    | "promoteCanary"
    | "rollbackCanary"
    | "getCanary"
    | "upsertBetaWhitelist"
    | "listBetaWhitelist"
    | "submitBetaFeedback"
    | "listBetaFeedback"
    | "escalateBetaFeedbackPriority"
    | "startStabilitySoakTest"
    | "recordStabilityCheckpoint"
    | "getStabilityReport"
    | "compareStabilityReports"
    | "exportStabilityReport"
    | "listStabilityAlerts"
    | "handleStabilityAlert"
  >;
  tokenStorage: TokenStorage;
};

export const ObservabilityPage = ({ apiClient, tokenStorage }: ObservabilityPageProps) => {
  const alertPreferenceKey = "observability.stabilityAlert.preferences";
  const loadAlertPreferences = (): {
    level: "all" | "yellow" | "red";
    status: "all" | "open" | "acknowledged" | "resolved";
    page: number;
    pageSize: number;
    sortBy: "updated_at" | "level" | "status";
    sortOrder: "asc" | "desc";
  } => {
    try {
      const text = localStorage.getItem(alertPreferenceKey);
      if (!text) {
        throw new Error("missing");
      }
      const parsed = JSON.parse(text) as {
        level?: "all" | "yellow" | "red";
        status?: "all" | "open" | "acknowledged" | "resolved";
        page?: number;
        pageSize?: number;
        sortBy?: "updated_at" | "level" | "status";
        sortOrder?: "asc" | "desc";
      };
      return {
        level: parsed.level ?? "all",
        status: parsed.status ?? "all",
        page: parsed.page && parsed.page > 0 ? parsed.page : 1,
        pageSize: parsed.pageSize && parsed.pageSize > 0 ? parsed.pageSize : 20,
        sortBy: parsed.sortBy ?? "updated_at",
        sortOrder: parsed.sortOrder ?? "desc"
      };
    } catch {
      return {
        level: "all",
        status: "all",
        page: 1,
        pageSize: 20,
        sortBy: "updated_at",
        sortOrder: "desc"
      };
    }
  };
  const alertPreferences = loadAlertPreferences();

  const [releaseId, setReleaseId] = useState("REL-S6-001");
  const [experimentKey, setExperimentKey] = useState("paywall_copy_v1");
  const [experimentName, setExperimentName] = useState("Paywall Copy Test");
  const [canaryId, setCanaryId] = useState("");
  const [stabilityRunId, setStabilityRunId] = useState("");
  const [stabilityAtHour, setStabilityAtHour] = useState("24");
  const [stabilityCrashCount, setStabilityCrashCount] = useState("2");
  const [stabilityActiveSessions, setStabilityActiveSessions] = useState("2200");
  const [stabilityApiSuccessRate, setStabilityApiSuccessRate] = useState("99.6");
  const [stabilityLatencyP95Ms, setStabilityLatencyP95Ms] = useState("1180");
  const [stabilityBaselineReleaseId, setStabilityBaselineReleaseId] = useState("REL-S7-STABLE-001");
  const [stabilityTargetReleaseId, setStabilityTargetReleaseId] = useState("REL-S8-STABLE-001");
  const [stabilityAlertId, setStabilityAlertId] = useState("");
  const [stabilityAlertLevel, setStabilityAlertLevel] = useState<"all" | "yellow" | "red">(alertPreferences.level);
  const [stabilityAlertStatus, setStabilityAlertStatus] = useState<"all" | "open" | "acknowledged" | "resolved">(
    alertPreferences.status
  );
  const [stabilityAlertAction, setStabilityAlertAction] = useState<"acknowledge" | "resolve">("acknowledge");
  const [stabilityAlertNote, setStabilityAlertNote] = useState("handled from observability board");
  const [stabilityAlertPage, setStabilityAlertPage] = useState(String(alertPreferences.page));
  const [stabilityAlertPageSize, setStabilityAlertPageSize] = useState(String(alertPreferences.pageSize));
  const [stabilityAlertSortBy, setStabilityAlertSortBy] = useState<"updated_at" | "level" | "status">(
    alertPreferences.sortBy
  );
  const [stabilityAlertSortOrder, setStabilityAlertSortOrder] = useState<"asc" | "desc">(alertPreferences.sortOrder);
  const [stabilityAlerts, setStabilityAlerts] = useState<
    Array<{
      alert_id: string;
      level: "yellow" | "red";
      status: "open" | "acknowledged" | "resolved";
      type: "crash_rate_per_1k" | "api_success_rate" | "latency_p95_ms";
      threshold: number;
      actual: number;
      updated_at: string;
      handled_at?: string;
      handled_by_user_id?: string;
      handling_action?: "acknowledge" | "resolve";
      handling_note?: string;
    }>
  >([]);
  const [betaReleaseId, setBetaReleaseId] = useState("REL-S8-BETA-001");
  const [betaUserId, setBetaUserId] = useState("");
  const [betaWhitelistStatus, setBetaWhitelistStatus] = useState<"active" | "disabled">("active");
  const [betaFeedbackId, setBetaFeedbackId] = useState("");
  const [betaFeedbackTitle, setBetaFeedbackTitle] = useState("Beta build crash when opening dashboard");
  const [betaFeedbackDescription, setBetaFeedbackDescription] = useState(
    "Steps: open beta build and switch to dashboard, app crashes immediately."
  );
  const [betaFeedbackCategory, setBetaFeedbackCategory] = useState<"bug" | "ux" | "performance" | "other">("bug");
  const [betaFeedbackSeverity, setBetaFeedbackSeverity] = useState<"low" | "medium" | "high" | "critical">("high");
  const [betaFeedbackPriority, setBetaFeedbackPriority] = useState<"high" | "critical">("critical");
  const [churnTargetUserId, setChurnTargetUserId] = useState("");
  const [churnStrategyType, setChurnStrategyType] = useState<"smart_reminder" | "mock_exam_boost" | "coupon_nudge">(
    "smart_reminder"
  );
  const [assignmentText, setAssignmentText] = useState("-");
  const [assignmentVariantKey, setAssignmentVariantKey] = useState<string | undefined>(undefined);
  const [experimentText, setExperimentText] = useState("-");
  const [churnRiskText, setChurnRiskText] = useState("-");
  const [churnEffectText, setChurnEffectText] = useState("-");
  const [summaryText, setSummaryText] = useState("-");
  const [healthText, setHealthText] = useState("-");
  const [gateText, setGateText] = useState("-");
  const [releaseMetricsText, setReleaseMetricsText] = useState("-");
  const [storageAlertingText, setStorageAlertingText] = useState("-");
  const [storageAlertingRecentItems, setStorageAlertingRecentItems] = useState<
    Array<{
      event: "circuit_opened" | "circuit_prolonged" | "circuit_recovered";
      backend: "memory" | "sqlite" | "postgres";
      operation: string;
      write_failed: boolean;
      consecutive_write_failures: number;
      duration_ms?: number;
      last_error?: string;
      recorded_at: string;
    }>
  >([]);
  const [storageAlertEventFilter, setStorageAlertEventFilter] = useState<
    "all" | "circuit_opened" | "circuit_prolonged" | "circuit_recovered"
  >("all");
  const [storageAlertBackendFilter, setStorageAlertBackendFilter] = useState<"all" | "memory" | "sqlite" | "postgres">(
    "all"
  );
  const [storageAlertWriteFailedFilter, setStorageAlertWriteFailedFilter] = useState<"all" | "failed" | "succeeded">(
    "all"
  );
  const [betaText, setBetaText] = useState("-");
  const [stabilityText, setStabilityText] = useState("-");
  const [stabilityAlertText, setStabilityAlertText] = useState("-");
  const [status, setStatus] = useState("未开始");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(
      alertPreferenceKey,
      JSON.stringify({
        level: stabilityAlertLevel,
        status: stabilityAlertStatus,
        page: Number(stabilityAlertPage) || 1,
        pageSize: Number(stabilityAlertPageSize) || 20,
        sortBy: stabilityAlertSortBy,
        sortOrder: stabilityAlertSortOrder
      })
    );
  }, [
    alertPreferenceKey,
    stabilityAlertLevel,
    stabilityAlertStatus,
    stabilityAlertPage,
    stabilityAlertPageSize,
    stabilityAlertSortBy,
    stabilityAlertSortOrder
  ]);

  const withToken = (): string => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      throw new Error("会话已失效，请重新登录");
    }
    return accessToken;
  };

  const sendSampleEvents = async (): Promise<void> => {
    try {
      const result = await apiClient.analyticsBatch(withToken(), {
        events: [
          {
            platform: "windows",
            skill: "reading",
            event_type: "practice_submitted",
            trace_id: `trace-${Date.now()}-1`,
            provider_name: "primary-llm",
            success: true,
            latency_ms: 900
          },
          {
            platform: "ios",
            skill: "speaking",
            event_type: "speaking_turn_scored",
            trace_id: `trace-${Date.now()}-2`,
            provider_name: "fallback-llm",
            success: false,
            fallback_triggered: true,
            latency_ms: 3400
          }
        ]
      });
      setStatus(`事件已上报 accepted=${result.accepted_count}`);
      setError(null);
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : "事件上报失败");
    }
  };

  const upsertExperiment = async (): Promise<void> => {
    try {
      const experiment = await apiClient.upsertAnalyticsExperiment(withToken(), experimentKey.trim(), {
        name: experimentName.trim() || "Paywall Copy Test",
        status: "running",
        traffic_percent: 100,
        variants: [
          {
            key: "control",
            label: "Control",
            weight: 50
          },
          {
            key: "treatment",
            label: "Treatment",
            weight: 50
          }
        ],
        metric_event_type: "subscription_upgraded",
        stop_condition: {
          min_sample_size: 20,
          target_lift_percent: 8,
          max_duration_days: 14
        }
      });
      setExperimentText(
        `key=${experiment.key}; status=${experiment.status}; traffic=${experiment.traffic_percent}% ; metric=${experiment.metric_event_type}`
      );
      setStatus("A/B 实验配置已保存");
      setError(null);
    } catch (experimentError) {
      setError(experimentError instanceof Error ? experimentError.message : "保存实验失败");
    }
  };

  const assignExperiment = async (): Promise<void> => {
    try {
      const assignment = await apiClient.getAnalyticsExperimentAssignment(withToken(), experimentKey.trim());
      setAssignmentVariantKey(assignment.variant_key);
      setAssignmentText(
        `key=${assignment.experiment_key}; holdout=${String(assignment.holdout)}; variant=${assignment.variant_key ?? "-"}`
      );
      setStatus("实验分流已返回");
      setError(null);
    } catch (assignmentError) {
      setError(assignmentError instanceof Error ? assignmentError.message : "实验分流失败");
    }
  };

  const reportExperimentExposure = async (): Promise<void> => {
    try {
      const result = await apiClient.analyticsBatch(withToken(), {
        events: [
          {
            platform: "ios",
            event_type: "experiment_exposure",
            trace_id: `ab-exposure-${Date.now()}`,
            metadata: {
              experiment_key: experimentKey.trim(),
              experiment_variant: assignmentVariantKey
            }
          }
        ]
      });
      setStatus(`实验曝光已上报 accepted=${result.accepted_count}`);
      setError(null);
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : "实验曝光上报失败");
    }
  };

  const reportExperimentConversion = async (): Promise<void> => {
    try {
      const result = await apiClient.analyticsBatch(withToken(), {
        events: [
          {
            platform: "ios",
            event_type: "subscription_upgraded",
            trace_id: `ab-conversion-${Date.now()}`,
            metadata: {
              experiment_key: experimentKey.trim(),
              experiment_variant: assignmentVariantKey
            }
          }
        ]
      });
      setStatus(`实验转化已上报 accepted=${result.accepted_count}`);
      setError(null);
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : "实验转化上报失败");
    }
  };

  const loadExperimentBoard = async (): Promise<void> => {
    try {
      const board = await apiClient.getAnalyticsExperiments(withToken(), {
        status: "running"
      });
      const experiment = board.items.find((item) => item.experiment.key === experimentKey.trim()) ?? board.items[0];
      if (!experiment) {
        setExperimentText("no running experiments");
        setStatus("实验看板为空");
        setError(null);
        return;
      }
      setExperimentText(
        `sample=${experiment.metrics.sample_size}; should_stop=${String(experiment.stop_recommendation.should_stop)}; reasons=${experiment.stop_recommendation.reasons.join("|") || "-"}`
      );
      setStatus("已加载实验看板");
      setError(null);
    } catch (boardError) {
      setError(boardError instanceof Error ? boardError.message : "加载实验看板失败");
    }
  };

  const stopExperiment = async (): Promise<void> => {
    try {
      const result = await apiClient.stopAnalyticsExperiment(withToken(), experimentKey.trim(), "manual stop after review");
      setExperimentText(`key=${result.key}; status=${result.status}; reason=${result.stop_reason ?? "-"}`);
      setStatus("实验已停止");
      setError(null);
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : "停止实验失败");
    }
  };

  const loadSummary = async (): Promise<void> => {
    try {
      const summary = await apiClient.getAnalyticsSummary(withToken());
      setSummaryText(
        `total=${summary.total_events}; coverage=${summary.core_coverage_percent}%; completeness=${summary.field_completeness_percent}%`
      );
      setStatus("已加载行为数据摘要");
      setError(null);
    } catch (summaryError) {
      setError(summaryError instanceof Error ? summaryError.message : "加载摘要失败");
    }
  };

  const loadChurnRisks = async (): Promise<void> => {
    try {
      const result = await apiClient.getChurnRisks(withToken(), {
        min_score: 40,
        limit: 20
      });
      const top = result.items[0];
      if (!top) {
        setChurnRiskText("no risk user found");
        setStatus("流失风险看板为空");
        setError(null);
        return;
      }
      setChurnTargetUserId(top.user_id);
      setChurnRiskText(
        `top_user=${top.user_id}; score=${top.score}; level=${top.level}; weekly=${top.weekly_learning_events}`
      );
      setStatus(`已识别流失风险用户 count=${result.total}`);
      setError(null);
    } catch (riskError) {
      setError(riskError instanceof Error ? riskError.message : "加载流失风险失败");
    }
  };

  const triggerChurnStrategy = async (): Promise<void> => {
    if (!churnTargetUserId.trim()) {
      setError("请先填写目标用户");
      return;
    }
    try {
      const result = await apiClient.triggerChurnStrategy(withToken(), {
        user_id: churnTargetUserId.trim(),
        strategy_type: churnStrategyType,
        reason: "auto trigger from observability board",
        conversion_window_days: 7
      });
      setChurnRiskText(
        `trigger=${result.trigger_id}; user=${result.user_id}; score=${result.risk.score}; level=${result.risk.level}; strategy=${result.strategy_type}`
      );
      setStatus("已触发挽回策略");
      setError(null);
    } catch (triggerError) {
      setError(triggerError instanceof Error ? triggerError.message : "触发挽回策略失败");
    }
  };

  const loadChurnEffect = async (): Promise<void> => {
    try {
      const result = await apiClient.getChurnEffect(withToken(), {
        strategy_type: churnStrategyType
      });
      setChurnEffectText(
        `total=${result.total_triggers}; converted=${result.converted_triggers}; recall=${result.recall_rate_percent}%`
      );
      setStatus("已加载召回效果");
      setError(null);
    } catch (effectError) {
      setError(effectError instanceof Error ? effectError.message : "加载召回效果失败");
    }
  };

  const loadHealth = async (): Promise<void> => {
    try {
      const health = await apiClient.getProviderHealth(withToken());
      setHealthText(`healthy=${String(health.healthy)}; alerts=${health.alerts.length}`);
      setStatus("已加载模型健康状态");
      setError(null);
    } catch (healthError) {
      setError(healthError instanceof Error ? healthError.message : "加载健康状态失败");
    }
  };

  const evaluateGate = async (): Promise<void> => {
    try {
      const gate = await apiClient.evaluateReleaseGate(withToken(), {
        release_id: releaseId,
        p0_defects: 0,
        regression_pass_rate: 100,
        api_success_rate: 99.9,
        provider_healthy: true
      });
      setGateText(`passed=${String(gate.passed)} checks=${gate.checks.length}`);
      setStatus("发布门禁评估完成");
      setError(null);
    } catch (gateError) {
      setError(gateError instanceof Error ? gateError.message : "门禁评估失败");
    }
  };

  const loadReleaseOperationalMetrics = async (): Promise<void> => {
    try {
      const metrics = await apiClient.getReleaseOperationalMetrics(withToken());
      setReleaseMetricsText(
        `idempotency(replay=${metrics.idempotency.totals.replay_rate}%,conflict=${metrics.idempotency.totals.conflict_rate}%); latency(p95=${metrics.write_latency.p95_latency_ms}ms,max=${metrics.write_latency.max_latency_ms}ms,alerts=${metrics.write_latency.alerts.yellow_count}/${metrics.write_latency.alerts.red_count}); storage(${metrics.storage_resilience.backend},circuit=${metrics.storage_resilience.circuit_open ? "open" : "closed"})`
      );
      setStorageAlertingText(
        `opened=${metrics.storage_resilience.alerting.opened_count}; prolonged=${metrics.storage_resilience.alerting.prolonged_count}; recovered=${metrics.storage_resilience.alerting.recovered_count}; threshold_ms=${metrics.storage_resilience.alerting.circuit_open_threshold_ms}; recent=${metrics.storage_resilience.alerting.recent_count}/${metrics.storage_resilience.alerting.recent_limit}; capped=${metrics.storage_resilience.alerting.capped_count}`
      );
      setStorageAlertingRecentItems(
        metrics.storage_resilience.alerting.recent.slice(0, 5).map((item) => ({
          event: item.event,
          backend: item.backend,
          operation: item.operation,
          write_failed: item.write_failed,
          consecutive_write_failures: item.consecutive_write_failures,
          duration_ms: item.duration_ms,
          last_error: item.last_error,
          recorded_at: item.recorded_at
        }))
      );
      setStatus("发布链路运行指标已加载");
      setError(null);
    } catch (metricsError) {
      setError(metricsError instanceof Error ? metricsError.message : "加载发布链路运行指标失败");
    }
  };

  const startCanary = async (): Promise<void> => {
    try {
      const canary = await apiClient.startCanary(withToken(), {
        release_id: releaseId,
        target_percent: 10,
        metrics: {
          error_rate: 0.5,
          latency_p95_ms: 1200,
          provider_healthy: true
        }
      });
      setCanaryId(canary.canary_id);
      setStatus(`灰度启动成功 canary=${canary.canary_id}`);
      setError(null);
    } catch (canaryError) {
      setError(canaryError instanceof Error ? canaryError.message : "灰度启动失败");
    }
  };

  const promoteCanary = async (): Promise<void> => {
    if (!canaryId) {
      setError("请先启动灰度");
      return;
    }
    try {
      const canary = await apiClient.promoteCanary(withToken(), canaryId, {
        metrics: {
          error_rate: 0.2,
          latency_p95_ms: 900,
          provider_healthy: true
        }
      });
      setStatus(`灰度晋级状态=${canary.status}`);
      setError(null);
    } catch (promoteError) {
      setError(promoteError instanceof Error ? promoteError.message : "灰度晋级失败");
    }
  };

  const rollbackCanary = async (): Promise<void> => {
    if (!canaryId) {
      setError("请先启动灰度");
      return;
    }
    try {
      const canary = await apiClient.rollbackCanary(withToken(), canaryId, "manual rollback drill");
      setStatus(`灰度回滚状态=${canary.status}`);
      setError(null);
    } catch (rollbackError) {
      setError(rollbackError instanceof Error ? rollbackError.message : "灰度回滚失败");
    }
  };

  const loadCanary = async (): Promise<void> => {
    if (!canaryId) {
      setError("请先启动灰度");
      return;
    }
    try {
      const canary = await apiClient.getCanary(withToken(), canaryId);
      setStatus(`灰度详情 status=${canary.status}`);
      setError(null);
    } catch (canaryError) {
      setError(canaryError instanceof Error ? canaryError.message : "加载灰度失败");
    }
  };

  const startStabilitySoak = async (): Promise<void> => {
    if (!stabilityTargetReleaseId.trim()) {
      setError("请先填写 stability_target_release_id");
      return;
    }
    try {
      const run = await apiClient.startStabilitySoakTest(withToken(), {
        release_id: stabilityTargetReleaseId.trim(),
        planned_duration_hours: 72
      });
      setStabilityRunId(run.run_id);
      setStabilityText(`run=${run.run_id}; release=${run.release_id}; status=${run.status}`);
      setStatus("稳定性长测任务已启动");
      setError(null);
    } catch (stabilityError) {
      setError(stabilityError instanceof Error ? stabilityError.message : "启动稳定性长测失败");
    }
  };

  const recordStabilityCheckpoint = async (): Promise<void> => {
    if (!stabilityRunId.trim()) {
      setError("请先启动稳定性长测");
      return;
    }
    try {
      const checkpoint = await apiClient.recordStabilityCheckpoint(withToken(), stabilityRunId.trim(), {
        at_hour: Number(stabilityAtHour),
        crash_count: Number(stabilityCrashCount),
        active_sessions: Number(stabilityActiveSessions),
        api_success_rate: Number(stabilityApiSuccessRate),
        latency_p95_ms: Number(stabilityLatencyP95Ms)
      });
      setStabilityText(
        `checkpoint=${checkpoint.checkpoint_id}; hour=${checkpoint.at_hour}; run_status=${checkpoint.run_status}`
      );
      setStatus("稳定性检查点已记录");
      setError(null);
    } catch (stabilityError) {
      setError(stabilityError instanceof Error ? stabilityError.message : "记录稳定性检查点失败");
    }
  };

  const loadStabilityReport = async (): Promise<void> => {
    if (!stabilityRunId.trim()) {
      setError("请先填写 stability_run_id");
      return;
    }
    try {
      const report = await apiClient.getStabilityReport(withToken(), stabilityRunId.trim());
      setStabilityText(
        `run=${report.run.run_id}; checkpoints=${report.summary.checkpoint_count}; avg_crash_rate=${report.summary.avg_crash_rate_per_1k}; avg_latency=${report.summary.avg_latency_p95_ms}`
      );
      setStatus("稳定性趋势报告已加载");
      setError(null);
    } catch (stabilityError) {
      setError(stabilityError instanceof Error ? stabilityError.message : "加载稳定性趋势报告失败");
    }
  };

  const compareStabilityReports = async (): Promise<void> => {
    if (!stabilityBaselineReleaseId.trim() || !stabilityTargetReleaseId.trim()) {
      setError("请先填写 baseline/target release");
      return;
    }
    try {
      const compared = await apiClient.compareStabilityReports(withToken(), {
        baseline_release_id: stabilityBaselineReleaseId.trim(),
        target_release_id: stabilityTargetReleaseId.trim()
      });
      setStabilityText(
        `compare=${compared.baseline_release_id}->${compared.target_release_id}; conclusion=${compared.conclusion}; delta_latency=${compared.delta.avg_latency_p95_ms}`
      );
      setStatus("稳定性报告对比完成");
      setError(null);
    } catch (stabilityError) {
      setError(stabilityError instanceof Error ? stabilityError.message : "对比稳定性报告失败");
    }
  };

  const exportStabilityReport = async (): Promise<void> => {
    if (!stabilityBaselineReleaseId.trim() || !stabilityTargetReleaseId.trim()) {
      setError("请先填写 baseline/target release");
      return;
    }
    try {
      const exported = await apiClient.exportStabilityReport(withToken(), {
        baseline_release_id: stabilityBaselineReleaseId.trim(),
        target_release_id: stabilityTargetReleaseId.trim()
      });
      setStabilityText(`export=${exported.filename}; bytes=${exported.content.length}`);
      setStatus("稳定性趋势报告已导出");
      setError(null);
    } catch (stabilityError) {
      setError(stabilityError instanceof Error ? stabilityError.message : "导出稳定性趋势报告失败");
    }
  };

  const loadStabilityAlerts = async (overridePage?: number): Promise<void> => {
    try {
      const page = overridePage ?? Math.max(1, Number(stabilityAlertPage) || 1);
      const pageSize = Math.max(1, Number(stabilityAlertPageSize) || 20);
      const result = await apiClient.listStabilityAlerts(withToken(), {
        run_id: stabilityRunId.trim() || undefined,
        release_id: stabilityTargetReleaseId.trim() || undefined,
        level: stabilityAlertLevel === "all" ? undefined : stabilityAlertLevel,
        status: stabilityAlertStatus === "all" ? undefined : stabilityAlertStatus,
        page,
        page_size: pageSize
      });
      const sortedItems = [...result.items].sort((a, b) => {
        let compared = 0;
        if (stabilityAlertSortBy === "updated_at") {
          compared = a.updated_at.localeCompare(b.updated_at);
        } else if (stabilityAlertSortBy === "level") {
          compared = a.level.localeCompare(b.level);
        } else {
          compared = a.status.localeCompare(b.status);
        }
        return stabilityAlertSortOrder === "asc" ? compared : -compared;
      });
      setStabilityAlerts(sortedItems);
      setStabilityAlertPage(String(page));
      const first = result.items[0];
      if (first && !stabilityAlertId) {
        setStabilityAlertId(first.alert_id);
      }
      setStabilityAlertText(
        `total=${result.total}; page=${page}; size=${pageSize}; sort=${stabilityAlertSortBy}:${stabilityAlertSortOrder}; thresholds=crash(${result.thresholds.crash_rate_per_1k.yellow}/${result.thresholds.crash_rate_per_1k.red}),success(${result.thresholds.api_success_rate.yellow}/${result.thresholds.api_success_rate.red}),latency(${result.thresholds.latency_p95_ms.yellow}/${result.thresholds.latency_p95_ms.red})`
      );
      setStatus("已加载稳定性告警");
      setError(null);
    } catch (stabilityError) {
      setError(stabilityError instanceof Error ? stabilityError.message : "加载稳定性告警失败");
    }
  };

  const handleStabilityAlert = async (): Promise<void> => {
    if (!stabilityAlertId.trim()) {
      setError("请先填写 stability_alert_id");
      return;
    }
    try {
      const alert = await apiClient.handleStabilityAlert(withToken(), stabilityAlertId.trim(), {
        action: stabilityAlertAction,
        note: stabilityAlertNote.trim() || undefined
      });
      setStabilityAlerts((items) =>
        items.map((item) =>
          item.alert_id === alert.alert_id
            ? {
                ...item,
                status: alert.status,
                handled_at: alert.handled_at,
                handled_by_user_id: alert.handled_by_user_id,
                handling_action: alert.handling_action,
                handling_note: alert.handling_note,
                updated_at: alert.updated_at
              }
            : item
        )
      );
      setStabilityAlertText(
        `alert=${alert.alert_id}; action=${alert.handling_action}; status=${alert.status}; level=${alert.level}`
      );
      setStatus("稳定性告警已处理");
      setError(null);
    } catch (stabilityError) {
      setError(stabilityError instanceof Error ? stabilityError.message : "处理稳定性告警失败");
    }
  };

  const upsertBetaWhitelist = async (): Promise<void> => {
    if (!betaUserId.trim()) {
      setError("请先填写 beta_user_id");
      return;
    }
    if (!betaReleaseId.trim()) {
      setError("请先填写 beta_release_id");
      return;
    }
    try {
      const entry = await apiClient.upsertBetaWhitelist(withToken(), betaUserId.trim(), {
        release_id: betaReleaseId.trim(),
        status: betaWhitelistStatus,
        note: "managed by observability board"
      });
      setBetaText(`whitelist=${entry.whitelist_id}; release=${entry.release_id}; status=${entry.status}`);
      setStatus("Beta 白名单已更新");
      setError(null);
    } catch (betaError) {
      setError(betaError instanceof Error ? betaError.message : "更新 Beta 白名单失败");
    }
  };

  const loadBetaWhitelist = async (): Promise<void> => {
    try {
      const result = await apiClient.listBetaWhitelist(withToken(), {
        user_id: betaUserId.trim() || undefined,
        release_id: betaReleaseId.trim() || undefined,
        page: 1,
        page_size: 20
      });
      const first = result.items[0];
      if (first) {
        setBetaUserId(first.user_id);
        setBetaReleaseId(first.release_id);
      }
      setBetaText(`beta_whitelist_total=${result.total}`);
      setStatus("已加载 Beta 白名单");
      setError(null);
    } catch (betaError) {
      setError(betaError instanceof Error ? betaError.message : "加载 Beta 白名单失败");
    }
  };

  const submitBetaFeedback = async (): Promise<void> => {
    try {
      const feedback = await apiClient.submitBetaFeedback(withToken(), {
        title: betaFeedbackTitle.trim(),
        description: betaFeedbackDescription.trim(),
        category: betaFeedbackCategory,
        severity: betaFeedbackSeverity,
        app_version: "ios-beta-1.0.0"
      });
      setBetaFeedbackId(feedback.feedback_id);
      setBetaText(
        `feedback=${feedback.feedback_id}; release=${feedback.release_id}; severity=${feedback.severity}; priority=${feedback.priority}`
      );
      setStatus("Beta 反馈已提交");
      setError(null);
    } catch (betaError) {
      setError(betaError instanceof Error ? betaError.message : "提交 Beta 反馈失败");
    }
  };

  const loadBetaFeedback = async (): Promise<void> => {
    try {
      const result = await apiClient.listBetaFeedback(withToken(), {
        release_id: betaReleaseId.trim() || undefined,
        page: 1,
        page_size: 20
      });
      const first = result.items[0];
      if (first && !betaFeedbackId) {
        setBetaFeedbackId(first.feedback_id);
      }
      setBetaText(`beta_feedback_total=${result.total}`);
      setStatus("已加载 Beta 反馈列表");
      setError(null);
    } catch (betaError) {
      setError(betaError instanceof Error ? betaError.message : "加载 Beta 反馈失败");
    }
  };

  const escalateBetaFeedback = async (): Promise<void> => {
    if (!betaFeedbackId.trim()) {
      setError("请先填写 beta_feedback_id");
      return;
    }
    try {
      const feedback = await apiClient.escalateBetaFeedbackPriority(withToken(), betaFeedbackId.trim(), {
        priority: betaFeedbackPriority,
        reason: "one-click escalation from release board"
      });
      setBetaText(`feedback=${feedback.feedback_id}; escalated_priority=${feedback.priority}`);
      setStatus("Beta 反馈优先级已升级");
      setError(null);
    } catch (betaError) {
      setError(betaError instanceof Error ? betaError.message : "升级 Beta 反馈优先级失败");
    }
  };

  const filteredStorageAlertingRecentItems = storageAlertingRecentItems.filter((item) => {
    if (storageAlertEventFilter !== "all" && item.event !== storageAlertEventFilter) {
      return false;
    }
    if (storageAlertBackendFilter !== "all" && item.backend !== storageAlertBackendFilter) {
      return false;
    }
    if (storageAlertWriteFailedFilter === "failed" && !item.write_failed) {
      return false;
    }
    if (storageAlertWriteFailedFilter === "succeeded" && item.write_failed) {
      return false;
    }
    return true;
  });

  return (
    <section>
      <h1>可观测与发布门禁</h1>
      {error ? <p role="alert">{error}</p> : null}

      <label htmlFor="release-id">release_id</label>
      <input
        id="release-id"
        value={releaseId}
        onChange={(event) => setReleaseId(event.target.value)}
      />

      <h2>A/B 实验</h2>
      <label htmlFor="experiment-key">experiment_key</label>
      <input
        id="experiment-key"
        value={experimentKey}
        onChange={(event) => setExperimentKey(event.target.value)}
      />
      <label htmlFor="experiment-name">experiment_name</label>
      <input
        id="experiment-name"
        value={experimentName}
        onChange={(event) => setExperimentName(event.target.value)}
      />
      <button type="button" onClick={() => void upsertExperiment()}>
        保存实验配置
      </button>
      <button type="button" onClick={() => void assignExperiment()}>
        获取实验分流
      </button>
      <button type="button" onClick={() => void reportExperimentExposure()}>
        上报实验曝光
      </button>
      <button type="button" onClick={() => void reportExperimentConversion()}>
        上报实验转化
      </button>
      <button type="button" onClick={() => void loadExperimentBoard()}>
        加载实验看板
      </button>
      <button type="button" onClick={() => void stopExperiment()}>
        停止实验
      </button>

      <h2>流失风险与召回</h2>
      <label htmlFor="churn-user-id">churn_user_id</label>
      <input
        id="churn-user-id"
        value={churnTargetUserId}
        onChange={(event) => setChurnTargetUserId(event.target.value)}
      />
      <label htmlFor="churn-strategy-type">strategy_type</label>
      <select
        id="churn-strategy-type"
        value={churnStrategyType}
        onChange={(event) =>
          setChurnStrategyType(event.target.value as "smart_reminder" | "mock_exam_boost" | "coupon_nudge")
        }
      >
        <option value="smart_reminder">smart_reminder</option>
        <option value="mock_exam_boost">mock_exam_boost</option>
        <option value="coupon_nudge">coupon_nudge</option>
      </select>
      <button type="button" onClick={() => void loadChurnRisks()}>
        加载流失风险
      </button>
      <button type="button" onClick={() => void triggerChurnStrategy()}>
        触发挽回策略
      </button>
      <button type="button" onClick={() => void loadChurnEffect()}>
        加载召回效果
      </button>

      <button type="button" onClick={() => void sendSampleEvents()}>
        上报样例事件
      </button>
      <button type="button" onClick={() => void loadSummary()}>
        加载行为摘要
      </button>
      <button type="button" onClick={() => void loadHealth()}>
        加载模型健康
      </button>
      <button type="button" onClick={() => void evaluateGate()}>
        评估发布门禁
      </button>
      <button type="button" onClick={() => void loadReleaseOperationalMetrics()}>
        加载发布链路指标
      </button>
      <button type="button" onClick={() => void startCanary()}>
        启动灰度
      </button>
      <button type="button" onClick={() => void promoteCanary()}>
        灰度晋级
      </button>
      <button type="button" onClick={() => void rollbackCanary()}>
        一键回滚
      </button>
      <button type="button" onClick={() => void loadCanary()}>
        查看灰度详情
      </button>

      <h2>稳定性长测与趋势报告</h2>
      <label htmlFor="stability-run-id">stability_run_id</label>
      <input
        id="stability-run-id"
        value={stabilityRunId}
        onChange={(event) => setStabilityRunId(event.target.value)}
      />
      <label htmlFor="stability-baseline-release-id">stability_baseline_release_id</label>
      <input
        id="stability-baseline-release-id"
        value={stabilityBaselineReleaseId}
        onChange={(event) => setStabilityBaselineReleaseId(event.target.value)}
      />
      <label htmlFor="stability-target-release-id">stability_target_release_id</label>
      <input
        id="stability-target-release-id"
        value={stabilityTargetReleaseId}
        onChange={(event) => setStabilityTargetReleaseId(event.target.value)}
      />
      <label htmlFor="stability-at-hour">stability_at_hour</label>
      <input
        id="stability-at-hour"
        value={stabilityAtHour}
        onChange={(event) => setStabilityAtHour(event.target.value)}
      />
      <label htmlFor="stability-crash-count">stability_crash_count</label>
      <input
        id="stability-crash-count"
        value={stabilityCrashCount}
        onChange={(event) => setStabilityCrashCount(event.target.value)}
      />
      <label htmlFor="stability-active-sessions">stability_active_sessions</label>
      <input
        id="stability-active-sessions"
        value={stabilityActiveSessions}
        onChange={(event) => setStabilityActiveSessions(event.target.value)}
      />
      <label htmlFor="stability-api-success-rate">stability_api_success_rate</label>
      <input
        id="stability-api-success-rate"
        value={stabilityApiSuccessRate}
        onChange={(event) => setStabilityApiSuccessRate(event.target.value)}
      />
      <label htmlFor="stability-latency-p95">stability_latency_p95_ms</label>
      <input
        id="stability-latency-p95"
        value={stabilityLatencyP95Ms}
        onChange={(event) => setStabilityLatencyP95Ms(event.target.value)}
      />
      <button type="button" onClick={() => void startStabilitySoak()}>
        启动72h长测
      </button>
      <button type="button" onClick={() => void recordStabilityCheckpoint()}>
        记录检查点
      </button>
      <button type="button" onClick={() => void loadStabilityReport()}>
        查看趋势报告
      </button>
      <button type="button" onClick={() => void compareStabilityReports()}>
        对比历史版本
      </button>
      <button type="button" onClick={() => void exportStabilityReport()}>
        导出趋势报告
      </button>

      <label htmlFor="stability-alert-id">stability_alert_id</label>
      <input
        id="stability-alert-id"
        value={stabilityAlertId}
        onChange={(event) => setStabilityAlertId(event.target.value)}
      />
      <label htmlFor="stability-alert-level">stability_alert_level</label>
      <select
        id="stability-alert-level"
        value={stabilityAlertLevel}
        onChange={(event) => setStabilityAlertLevel(event.target.value as "all" | "yellow" | "red")}
      >
        <option value="all">all</option>
        <option value="yellow">yellow</option>
        <option value="red">red</option>
      </select>
      <label htmlFor="stability-alert-status">stability_alert_status</label>
      <select
        id="stability-alert-status"
        value={stabilityAlertStatus}
        onChange={(event) =>
          setStabilityAlertStatus(event.target.value as "all" | "open" | "acknowledged" | "resolved")
        }
      >
        <option value="all">all</option>
        <option value="open">open</option>
        <option value="acknowledged">acknowledged</option>
        <option value="resolved">resolved</option>
      </select>
      <label htmlFor="stability-alert-page">stability_alert_page</label>
      <input
        id="stability-alert-page"
        value={stabilityAlertPage}
        onChange={(event) => setStabilityAlertPage(event.target.value)}
      />
      <label htmlFor="stability-alert-page-size">stability_alert_page_size</label>
      <input
        id="stability-alert-page-size"
        value={stabilityAlertPageSize}
        onChange={(event) => setStabilityAlertPageSize(event.target.value)}
      />
      <label htmlFor="stability-alert-sort-by">stability_alert_sort_by</label>
      <select
        id="stability-alert-sort-by"
        value={stabilityAlertSortBy}
        onChange={(event) => setStabilityAlertSortBy(event.target.value as "updated_at" | "level" | "status")}
      >
        <option value="updated_at">updated_at</option>
        <option value="level">level</option>
        <option value="status">status</option>
      </select>
      <label htmlFor="stability-alert-sort-order">stability_alert_sort_order</label>
      <select
        id="stability-alert-sort-order"
        value={stabilityAlertSortOrder}
        onChange={(event) => setStabilityAlertSortOrder(event.target.value as "asc" | "desc")}
      >
        <option value="desc">desc</option>
        <option value="asc">asc</option>
      </select>
      <label htmlFor="stability-alert-action">stability_alert_action</label>
      <select
        id="stability-alert-action"
        value={stabilityAlertAction}
        onChange={(event) => setStabilityAlertAction(event.target.value as "acknowledge" | "resolve")}
      >
        <option value="acknowledge">acknowledge</option>
        <option value="resolve">resolve</option>
      </select>
      <label htmlFor="stability-alert-note">stability_alert_note</label>
      <input
        id="stability-alert-note"
        value={stabilityAlertNote}
        onChange={(event) => setStabilityAlertNote(event.target.value)}
      />
      <button type="button" onClick={() => void loadStabilityAlerts()}>
        加载稳定性告警
      </button>
      <button
        type="button"
        onClick={() => {
          const current = Math.max(1, Number(stabilityAlertPage) || 1);
          void loadStabilityAlerts(Math.max(1, current - 1));
        }}
      >
        上一页告警
      </button>
      <button
        type="button"
        onClick={() => {
          const current = Math.max(1, Number(stabilityAlertPage) || 1);
          void loadStabilityAlerts(current + 1);
        }}
      >
        下一页告警
      </button>
      <button type="button" onClick={() => void handleStabilityAlert()}>
        处理稳定性告警
      </button>
      <table aria-label="stability_alert_table">
        <thead>
          <tr>
            <th>alert_id</th>
            <th>type</th>
            <th>level</th>
            <th>status</th>
            <th>threshold</th>
            <th>actual</th>
            <th>updated_at</th>
            <th>history</th>
          </tr>
        </thead>
        <tbody>
          {stabilityAlerts.map((item) => (
            <tr key={item.alert_id}>
              <td>{item.alert_id}</td>
              <td>{item.type}</td>
              <td>{item.level}</td>
              <td>{item.status}</td>
              <td>{item.threshold}</td>
              <td>{item.actual}</td>
              <td>{item.updated_at}</td>
              <td>
                {item.handled_at
                  ? `${item.handling_action ?? "-"} by ${item.handled_by_user_id ?? "-"} @ ${item.handled_at}`
                  : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>系统角色管理</h2>
      <p>
        系统角色操作已迁移到独立页面：
        <a href="/system-roles">/system-roles</a>
      </p>

      <h2>Beta 渠道与反馈</h2>
      <label htmlFor="beta-release-id">beta_release_id</label>
      <input
        id="beta-release-id"
        value={betaReleaseId}
        onChange={(event) => setBetaReleaseId(event.target.value)}
      />
      <label htmlFor="beta-user-id">beta_user_id</label>
      <input
        id="beta-user-id"
        value={betaUserId}
        onChange={(event) => setBetaUserId(event.target.value)}
      />
      <label htmlFor="beta-whitelist-status">beta_whitelist_status</label>
      <select
        id="beta-whitelist-status"
        value={betaWhitelistStatus}
        onChange={(event) => setBetaWhitelistStatus(event.target.value as "active" | "disabled")}
      >
        <option value="active">active</option>
        <option value="disabled">disabled</option>
      </select>
      <button type="button" onClick={() => void upsertBetaWhitelist()}>
        更新Beta白名单
      </button>
      <button type="button" onClick={() => void loadBetaWhitelist()}>
        查询Beta白名单
      </button>

      <label htmlFor="beta-feedback-title">beta_feedback_title</label>
      <input
        id="beta-feedback-title"
        value={betaFeedbackTitle}
        onChange={(event) => setBetaFeedbackTitle(event.target.value)}
      />
      <label htmlFor="beta-feedback-description">beta_feedback_description</label>
      <input
        id="beta-feedback-description"
        value={betaFeedbackDescription}
        onChange={(event) => setBetaFeedbackDescription(event.target.value)}
      />
      <label htmlFor="beta-feedback-category">beta_feedback_category</label>
      <select
        id="beta-feedback-category"
        value={betaFeedbackCategory}
        onChange={(event) => setBetaFeedbackCategory(event.target.value as "bug" | "ux" | "performance" | "other")}
      >
        <option value="bug">bug</option>
        <option value="ux">ux</option>
        <option value="performance">performance</option>
        <option value="other">other</option>
      </select>
      <label htmlFor="beta-feedback-severity">beta_feedback_severity</label>
      <select
        id="beta-feedback-severity"
        value={betaFeedbackSeverity}
        onChange={(event) => setBetaFeedbackSeverity(event.target.value as "low" | "medium" | "high" | "critical")}
      >
        <option value="low">low</option>
        <option value="medium">medium</option>
        <option value="high">high</option>
        <option value="critical">critical</option>
      </select>
      <button type="button" onClick={() => void submitBetaFeedback()}>
        提交Beta反馈
      </button>
      <button type="button" onClick={() => void loadBetaFeedback()}>
        查询Beta反馈
      </button>
      <label htmlFor="beta-feedback-id">beta_feedback_id</label>
      <input
        id="beta-feedback-id"
        value={betaFeedbackId}
        onChange={(event) => setBetaFeedbackId(event.target.value)}
      />
      <label htmlFor="beta-feedback-priority">beta_feedback_priority</label>
      <select
        id="beta-feedback-priority"
        value={betaFeedbackPriority}
        onChange={(event) => setBetaFeedbackPriority(event.target.value as "high" | "critical")}
      >
        <option value="high">high</option>
        <option value="critical">critical</option>
      </select>
      <button type="button" onClick={() => void escalateBetaFeedback()}>
        一键升级反馈优先级
      </button>

      <p>canary_id: {canaryId || "-"}</p>
      <p>assignment: {assignmentText}</p>
      <p>experiment: {experimentText}</p>
      <p>beta: {betaText}</p>
      <p>stability: {stabilityText}</p>
      <p>stability_alert: {stabilityAlertText}</p>
      <p>churn_risk: {churnRiskText}</p>
      <p>churn_effect: {churnEffectText}</p>
      <p>summary: {summaryText}</p>
      <p>health: {healthText}</p>
      <p>gate: {gateText}</p>
      <p>release_metrics: {releaseMetricsText}</p>
      <p>storage_alerting: {storageAlertingText}</p>
      <label htmlFor="observability-storage-alert-event-filter">storage_alert_event_filter</label>
      <select
        id="observability-storage-alert-event-filter"
        value={storageAlertEventFilter}
        onChange={(event) =>
          setStorageAlertEventFilter(
            event.target.value as "all" | "circuit_opened" | "circuit_prolonged" | "circuit_recovered"
          )
        }
      >
        <option value="all">all</option>
        <option value="circuit_opened">circuit_opened</option>
        <option value="circuit_prolonged">circuit_prolonged</option>
        <option value="circuit_recovered">circuit_recovered</option>
      </select>
      <label htmlFor="observability-storage-alert-backend-filter">storage_alert_backend_filter</label>
      <select
        id="observability-storage-alert-backend-filter"
        value={storageAlertBackendFilter}
        onChange={(event) => setStorageAlertBackendFilter(event.target.value as "all" | "memory" | "sqlite" | "postgres")}
      >
        <option value="all">all</option>
        <option value="memory">memory</option>
        <option value="sqlite">sqlite</option>
        <option value="postgres">postgres</option>
      </select>
      <label htmlFor="observability-storage-alert-write-failed-filter">storage_alert_write_failed_filter</label>
      <select
        id="observability-storage-alert-write-failed-filter"
        value={storageAlertWriteFailedFilter}
        onChange={(event) => setStorageAlertWriteFailedFilter(event.target.value as "all" | "failed" | "succeeded")}
      >
        <option value="all">all</option>
        <option value="failed">failed</option>
        <option value="succeeded">succeeded</option>
      </select>
      <ul aria-label="storage-alerting-recent">
        {filteredStorageAlertingRecentItems.length === 0 ? (
          <li>none</li>
        ) : (
          filteredStorageAlertingRecentItems.map((item) => (
            <li key={`${item.recorded_at}-${item.operation}-${item.event}`}>
              {item.event}; backend={item.backend}; operation={item.operation}; failed={String(item.write_failed)};
              failures={item.consecutive_write_failures}
              {item.duration_ms === undefined ? "" : `; duration_ms=${item.duration_ms}`}
              {item.last_error ? `; error=${item.last_error}` : ""}
            </li>
          ))
        )}
      </ul>
      <p>status: {status}</p>
    </section>
  );
};
