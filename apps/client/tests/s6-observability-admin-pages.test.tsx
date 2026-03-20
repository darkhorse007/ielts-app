import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TokenStorage } from "../src/lib/token-storage";
import { ObservabilityPage } from "../src/pages/ObservabilityPage";
import { AdminConsolePage } from "../src/pages/AdminConsolePage";

describe("S6 observability/admin pages", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("supports observability analytics gate and canary operations", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 900,
      userId: "u-1"
    });

    const analyticsBatch = vi.fn().mockResolvedValue({
      accepted_count: 2,
      rejected_count: 0,
      core_coverage_percent: 100,
      field_completeness_percent: 100
    });
    const getAnalyticsSummary = vi.fn().mockResolvedValue({
      total_events: 2,
      core_coverage_percent: 100,
      field_completeness_percent: 100,
      by_platform: {
        ios: 1,
        windows: 1
      },
      by_skill: {
        speaking: 1,
        reading: 1
      },
      recent_events: []
    });
    const upsertAnalyticsExperiment = vi.fn().mockResolvedValue({
      key: "paywall_copy_v1",
      name: "Paywall Copy Test",
      status: "running",
      traffic_percent: 100,
      variants: [
        { key: "control", label: "Control", weight: 50 },
        { key: "treatment", label: "Treatment", weight: 50 }
      ],
      metric_event_type: "subscription_upgraded",
      stop_condition: {
        min_sample_size: 20,
        target_lift_percent: 8,
        max_duration_days: 14
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const getAnalyticsExperimentAssignment = vi.fn().mockResolvedValue({
      experiment_key: "paywall_copy_v1",
      status: "running",
      holdout: false,
      variant_key: "treatment",
      assignment_source: "new"
    });
    const getAnalyticsExperiments = vi.fn().mockResolvedValue({
      total: 1,
      items: [
        {
          experiment: {
            key: "paywall_copy_v1",
            name: "Paywall Copy Test",
            status: "running",
            traffic_percent: 100,
            variants: [
              { key: "control", label: "Control", weight: 50 },
              { key: "treatment", label: "Treatment", weight: 50 }
            ],
            metric_event_type: "subscription_upgraded",
            stop_condition: {
              min_sample_size: 20,
              target_lift_percent: 8,
              max_duration_days: 14
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          metrics: {
            sample_size: 24,
            running_days: 3,
            variants: []
          },
          stop_recommendation: {
            should_stop: true,
            reasons: ["sample_size_reached(24)", "target_lift_reached(12%)"],
            evaluated_at: new Date().toISOString()
          }
        }
      ]
    });
    const stopAnalyticsExperiment = vi.fn().mockResolvedValue({
      key: "paywall_copy_v1",
      name: "Paywall Copy Test",
      status: "stopped",
      traffic_percent: 100,
      variants: [
        { key: "control", label: "Control", weight: 50 },
        { key: "treatment", label: "Treatment", weight: 50 }
      ],
      metric_event_type: "subscription_upgraded",
      stop_condition: {
        min_sample_size: 20,
        target_lift_percent: 8,
        max_duration_days: 14
      },
      stop_reason: "manual stop after review",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const getChurnRisks = vi.fn().mockResolvedValue({
      total: 1,
      items: [
        {
          risk_id: "risk-1",
          user_id: "u-risk-1",
          score: 82,
          level: "high",
          factors: ["low_weekly_activity"],
          weekly_learning_events: 0,
          reminder_clicks_30d: 0,
          computed_at: new Date().toISOString()
        }
      ]
    });
    const triggerChurnStrategy = vi.fn().mockResolvedValue({
      trigger_id: "tg-1",
      user_id: "u-risk-1",
      risk: {
        risk_id: "risk-1",
        score: 82,
        level: "high",
        factors: ["low_weekly_activity"],
        computed_at: new Date().toISOString()
      },
      strategy_type: "smart_reminder",
      status: "triggered",
      conversion_window_days: 7,
      payload: {},
      triggered_at: new Date().toISOString()
    });
    const getChurnEffect = vi.fn().mockResolvedValue({
      total_triggers: 1,
      converted_triggers: 1,
      recall_rate_percent: 100,
      by_strategy: [],
      items: []
    });
    const getProviderHealth = vi.fn().mockResolvedValue({
      healthy: true,
      providers: [],
      alerts: []
    });
    const evaluateReleaseGate = vi.fn().mockResolvedValue({
      gate_id: "gate-1",
      release_id: "REL-S6-001",
      passed: true,
      checks: [{ name: "p0_defects", threshold: "0", actual: "0", passed: true }],
      created_at: new Date().toISOString()
    });
    const getReleaseOperationalMetrics = vi.fn().mockResolvedValue({
      idempotency: {
        totals: {
          attempts: 10,
          replay_hits: 2,
          conflict_count: 1,
          replay_rate: 20,
          conflict_rate: 10
        },
        actions: []
      },
      write_latency: {
        total_writes: 10,
        failed_writes: 0,
        avg_latency_ms: 42,
        p95_latency_ms: 120,
        max_latency_ms: 260,
        thresholds_ms: {
          yellow: 400,
          red: 1000
        },
        alerts: {
          yellow_count: 0,
          red_count: 0,
          recent: []
        },
        recent_samples: []
      },
      storage_resilience: {
        backend: "postgres",
        mode: "async_buffered",
        circuit_open: false,
        circuit_open_until: null,
        consecutive_write_failures: 0,
        max_attempts: 3,
        retry_base_delay_ms: 60,
        retry_max_delay_ms: 800,
        circuit_failure_threshold: 5,
        circuit_cooldown_ms: 5000,
        last_error: null,
        alerting: {
          circuit_open_threshold_ms: 30000,
          recent_limit: 30,
          recent_count: 1,
          capped_count: 0,
          opened_count: 1,
          prolonged_count: 1,
          recovered_count: 0,
          recent: [
            {
              event: "circuit_opened",
              backend: "postgres",
              operation: "flush",
              write_failed: true,
              consecutive_write_failures: 5,
              duration_ms: 42000,
              last_error: "connection terminated",
              recorded_at: new Date().toISOString()
            }
          ]
        }
      }
    });
    const startCanary = vi.fn().mockResolvedValue({
      canary_id: "c-1",
      release_id: "REL-S6-001",
      version: 1,
      target_percent: 10,
      status: "running",
      metrics: {
        error_rate: 0.5,
        latency_p95_ms: 1200,
        provider_healthy: true
      },
      started_at: new Date().toISOString()
    });
    const promoteCanary = vi.fn().mockResolvedValue({
      canary_id: "c-1",
      release_id: "REL-S6-001",
      version: 2,
      status: "promoted"
    });
    const rollbackCanary = vi.fn().mockResolvedValue({
      canary_id: "c-1",
      release_id: "REL-S6-001",
      version: 3,
      status: "rolled_back"
    });
    const getCanary = vi.fn().mockResolvedValue({
      canary_id: "c-1",
      release_id: "REL-S6-001",
      version: 3,
      status: "rolled_back"
    });
    const upsertBetaWhitelist = vi.fn().mockResolvedValue({
      whitelist_id: "wl-1",
      user_id: "u-beta-1",
      release_id: "REL-S8-BETA-001",
      version: 1,
      status: "active",
      created_by_user_id: "u-1",
      updated_by_user_id: "u-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const listBetaWhitelist = vi.fn().mockResolvedValue({
      total: 1,
      page: 1,
      page_size: 20,
      items: [
        {
          whitelist_id: "wl-1",
          user_id: "u-beta-1",
          release_id: "REL-S8-BETA-001",
          version: 1,
          status: "active",
          created_by_user_id: "u-1",
          updated_by_user_id: "u-1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]
    });
    const submitBetaFeedback = vi.fn().mockResolvedValue({
      feedback_id: "fb-1",
      user_id: "u-beta-1",
      release_id: "REL-S8-BETA-001",
      version: 1,
      category: "bug",
      severity: "high",
      priority: "high",
      status: "open",
      title: "Beta crash",
      description: "app crashes on dashboard",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const listBetaFeedback = vi.fn().mockResolvedValue({
      total: 1,
      page: 1,
      page_size: 20,
      items: [
        {
          feedback_id: "fb-1",
          user_id: "u-beta-1",
          release_id: "REL-S8-BETA-001",
          version: 1,
          category: "bug",
          severity: "high",
          priority: "high",
          status: "open",
          title: "Beta crash",
          description: "app crashes on dashboard",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]
    });
    const escalateBetaFeedbackPriority = vi.fn().mockResolvedValue({
      feedback_id: "fb-1",
      user_id: "u-beta-1",
      release_id: "REL-S8-BETA-001",
      version: 2,
      category: "bug",
      severity: "high",
      priority: "critical",
      status: "triaged",
      title: "Beta crash",
      description: "app crashes on dashboard",
      escalated_at: new Date().toISOString(),
      escalated_by_user_id: "u-1",
      escalation_reason: "one-click escalation",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const startStabilitySoakTest = vi.fn().mockResolvedValue({
      run_id: "run-1",
      release_id: "REL-S8-STABLE-001",
      planned_duration_hours: 72,
      status: "running",
      started_at: new Date().toISOString(),
      created_by_user_id: "u-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const recordStabilityCheckpoint = vi.fn().mockResolvedValue({
      checkpoint_id: "cp-1",
      run_id: "run-1",
      release_id: "REL-S8-STABLE-001",
      version: 1,
      at_hour: 24,
      crash_count: 1,
      active_sessions: 2000,
      api_success_rate: 99.7,
      latency_p95_ms: 1100,
      created_by_user_id: "u-1",
      created_at: new Date().toISOString(),
      run_status: "running"
    });
    const getStabilityReport = vi.fn().mockResolvedValue({
      run: {
        run_id: "run-1",
        release_id: "REL-S8-STABLE-001",
        planned_duration_hours: 72,
        status: "running",
        started_at: new Date().toISOString(),
        created_by_user_id: "u-1",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      summary: {
        checkpoint_count: 1,
        collected_duration_hours: 24,
        last_checkpoint_at: new Date().toISOString(),
        total_crashes: 1,
        max_crash_count: 1,
        avg_crash_rate_per_1k: 0.5,
        min_api_success_rate: 99.7,
        avg_api_success_rate: 99.7,
        max_latency_p95_ms: 1100,
        avg_latency_p95_ms: 1100
      },
      trend: [],
      generated_at: new Date().toISOString()
    });
    const compareStabilityReports = vi.fn().mockResolvedValue({
      baseline_release_id: "REL-S7-STABLE-001",
      target_release_id: "REL-S8-STABLE-001",
      baseline_report: {
        run_id: "run-baseline",
        release_id: "REL-S7-STABLE-001",
        status: "completed",
        summary: {
          checkpoint_count: 3,
          total_crashes: 5,
          avg_crash_rate_per_1k: 1.2,
          avg_api_success_rate: 99.2,
          avg_latency_p95_ms: 1350
        }
      },
      target_report: {
        run_id: "run-1",
        release_id: "REL-S8-STABLE-001",
        status: "running",
        summary: {
          checkpoint_count: 1,
          total_crashes: 1,
          avg_crash_rate_per_1k: 0.5,
          avg_api_success_rate: 99.7,
          avg_latency_p95_ms: 1100
        }
      },
      delta: {
        total_crashes: -4,
        avg_crash_rate_per_1k: -0.7,
        avg_api_success_rate: 0.5,
        avg_latency_p95_ms: -250
      },
      conclusion: "improved",
      compared_at: new Date().toISOString()
    });
    const exportStabilityReport = vi.fn().mockResolvedValue({
      filename: "stability-report-REL-S7-STABLE-001-to-REL-S8-STABLE-001.csv",
      content: "metric,baseline,target,delta\navg_latency_p95_ms,1350,1100,-250",
      compared_at: new Date().toISOString()
    });
    const listStabilityAlerts = vi.fn().mockResolvedValue({
      total: 1,
      page: 1,
      page_size: 20,
      thresholds: {
        crash_rate_per_1k: { yellow: 1.5, red: 3 },
        api_success_rate: { yellow: 99.5, red: 99 },
        latency_p95_ms: { yellow: 1500, red: 2500 }
      },
      items: [
        {
          alert_id: "alert-1",
          run_id: "run-1",
          release_id: "REL-S8-STABLE-001",
          checkpoint_id: "cp-1",
          version: 1,
          at_hour: 24,
          type: "latency_p95_ms",
          level: "yellow",
          status: "open",
          threshold: 1500,
          actual: 1600,
          reason: "latency_p95_ms=1600 exceeds yellow threshold",
          triggered_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]
    });
    const handleStabilityAlert = vi.fn().mockResolvedValue({
      alert_id: "alert-1",
      run_id: "run-1",
      release_id: "REL-S8-STABLE-001",
      checkpoint_id: "cp-1",
      version: 2,
      at_hour: 24,
      type: "latency_p95_ms",
      level: "yellow",
      status: "acknowledged",
      threshold: 1500,
      actual: 1600,
      reason: "latency_p95_ms=1600 exceeds yellow threshold",
      triggered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      handled_at: new Date().toISOString(),
      handled_by_user_id: "u-1",
      handling_action: "acknowledge",
      handling_note: "handled from observability board"
    });
    render(
      <ObservabilityPage
        apiClient={{
          analyticsBatch,
          getAnalyticsSummary,
          upsertAnalyticsExperiment,
          stopAnalyticsExperiment,
          getAnalyticsExperiments,
          getAnalyticsExperimentAssignment,
          getChurnRisks,
          triggerChurnStrategy,
          getChurnEffect,
          getProviderHealth,
          evaluateReleaseGate,
          getReleaseOperationalMetrics,
          startCanary,
          promoteCanary,
          rollbackCanary,
          getCanary,
          upsertBetaWhitelist,
          listBetaWhitelist,
          submitBetaFeedback,
          listBetaFeedback,
          escalateBetaFeedbackPriority,
          startStabilitySoakTest,
          recordStabilityCheckpoint,
          getStabilityReport,
          compareStabilityReports,
          exportStabilityReport,
          listStabilityAlerts,
          handleStabilityAlert
        }}
        tokenStorage={tokenStorage}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "保存实验配置" }));
    fireEvent.click(screen.getByRole("button", { name: "获取实验分流" }));
    fireEvent.click(screen.getByRole("button", { name: "上报实验曝光" }));
    fireEvent.click(screen.getByRole("button", { name: "上报实验转化" }));
    fireEvent.click(screen.getByRole("button", { name: "加载实验看板" }));
    fireEvent.click(screen.getByRole("button", { name: "停止实验" }));
    await waitFor(() => {
      expect(upsertAnalyticsExperiment).toHaveBeenCalledTimes(1);
      expect(getAnalyticsExperimentAssignment).toHaveBeenCalledTimes(1);
      expect(getAnalyticsExperiments).toHaveBeenCalledTimes(1);
      expect(stopAnalyticsExperiment).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: 实验已停止/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "加载流失风险" }));
    await waitFor(() => {
      expect(getChurnRisks).toHaveBeenCalledTimes(1);
      expect(screen.getByDisplayValue("u-risk-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "触发挽回策略" }));
    await waitFor(() => {
      expect(triggerChurnStrategy).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "加载召回效果" }));
    await waitFor(() => {
      expect(getChurnEffect).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/churn_effect: total=1; converted=1; recall=100%/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "上报样例事件" }));
    await waitFor(() => {
      expect(analyticsBatch).toHaveBeenCalledTimes(3);
      expect(screen.getByText(/status: 事件已上报 accepted=2/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "加载行为摘要" }));
    fireEvent.click(screen.getByRole("button", { name: "加载模型健康" }));
    fireEvent.click(screen.getByRole("button", { name: "评估发布门禁" }));
    fireEvent.click(screen.getByRole("button", { name: "加载发布链路指标" }));

    await waitFor(() => {
      expect(getAnalyticsSummary).toHaveBeenCalledTimes(1);
      expect(getProviderHealth).toHaveBeenCalledTimes(1);
      expect(evaluateReleaseGate).toHaveBeenCalledTimes(1);
      expect(getReleaseOperationalMetrics).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText(/release_metrics: idempotency\(replay=20%,conflict=10%\)/)).toBeInTheDocument();
    expect(screen.getByText(/storage_alerting: opened=1; prolonged=1; recovered=0; threshold_ms=30000/)).toBeInTheDocument();
    expect(screen.getByText(/storage_alerting: .*recent=1\/30; capped=0/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /circuit_opened; backend=postgres; operation=flush; failed=true;\s*failures=5;\s*duration_ms=42000;\s*error=connection terminated/
      )
    ).toBeInTheDocument();
    const storageRecentList = screen.getByLabelText("storage-alerting-recent");
    fireEvent.change(screen.getByLabelText("storage_alert_event_filter"), {
      target: {
        value: "circuit_recovered"
      }
    });
    expect(within(storageRecentList).getByText("none")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("storage_alert_event_filter"), {
      target: {
        value: "all"
      }
    });
    expect(
      within(storageRecentList).getByText(
        /circuit_opened; backend=postgres; operation=flush; failed=true;\s*failures=5;\s*duration_ms=42000;\s*error=connection terminated/
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "启动灰度" }));
    await waitFor(() => {
      expect(startCanary).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/canary_id: c-1/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "灰度晋级" }));
    fireEvent.click(screen.getByRole("button", { name: "一键回滚" }));
    fireEvent.click(screen.getByRole("button", { name: "查看灰度详情" }));

    await waitFor(() => {
      expect(promoteCanary).toHaveBeenCalledTimes(1);
      expect(rollbackCanary).toHaveBeenCalledTimes(1);
      expect(getCanary).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: 灰度详情 status=rolled_back/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("beta_user_id"), {
      target: {
        value: "u-beta-1"
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "更新Beta白名单" }));
    fireEvent.click(screen.getByRole("button", { name: "查询Beta白名单" }));
    fireEvent.click(screen.getByRole("button", { name: "提交Beta反馈" }));
    fireEvent.click(screen.getByRole("button", { name: "查询Beta反馈" }));

    await waitFor(() => {
      expect(upsertBetaWhitelist).toHaveBeenCalledTimes(1);
      expect(listBetaWhitelist).toHaveBeenCalledTimes(1);
      expect(submitBetaFeedback).toHaveBeenCalledTimes(1);
      expect(listBetaFeedback).toHaveBeenCalledTimes(1);
      expect(screen.getByDisplayValue("fb-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "一键升级反馈优先级" }));

    await waitFor(() => {
      expect(escalateBetaFeedbackPriority).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: Beta 反馈优先级已升级/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "启动72h长测" }));
    await waitFor(() => {
      expect(startStabilitySoakTest).toHaveBeenCalledTimes(1);
      expect(screen.getByDisplayValue("run-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "记录检查点" }));
    fireEvent.click(screen.getByRole("button", { name: "查看趋势报告" }));
    fireEvent.click(screen.getByRole("button", { name: "对比历史版本" }));
    fireEvent.click(screen.getByRole("button", { name: "导出趋势报告" }));

    fireEvent.change(screen.getByLabelText("stability_alert_level"), {
      target: {
        value: "red"
      }
    });
    fireEvent.change(screen.getByLabelText("stability_alert_status"), {
      target: {
        value: "open"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "加载稳定性告警" }));

    await waitFor(() => {
      expect(recordStabilityCheckpoint).toHaveBeenCalledTimes(1);
      expect(getStabilityReport).toHaveBeenCalledTimes(1);
      expect(compareStabilityReports).toHaveBeenCalledTimes(1);
      expect(exportStabilityReport).toHaveBeenCalledTimes(1);
      expect(listStabilityAlerts).toHaveBeenCalledTimes(1);
      expect(screen.getByDisplayValue("alert-1")).toBeInTheDocument();
    });
    expect(listStabilityAlerts).toHaveBeenNthCalledWith(1, "access", {
      run_id: "run-1",
      release_id: "REL-S8-STABLE-001",
      level: "red",
      status: "open",
      page: 1,
      page_size: 20
    });

    fireEvent.change(screen.getByLabelText("stability_alert_level"), {
      target: {
        value: "all"
      }
    });
    fireEvent.change(screen.getByLabelText("stability_alert_status"), {
      target: {
        value: "resolved"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "加载稳定性告警" }));
    await waitFor(() => {
      expect(listStabilityAlerts).toHaveBeenCalledTimes(2);
    });
    expect(listStabilityAlerts).toHaveBeenNthCalledWith(2, "access", {
      run_id: "run-1",
      release_id: "REL-S8-STABLE-001",
      level: undefined,
      status: "resolved",
      page: 1,
      page_size: 20
    });

    fireEvent.change(screen.getByLabelText("stability_alert_action"), {
      target: {
        value: "resolve"
      }
    });
    fireEvent.change(screen.getByLabelText("stability_alert_note"), {
      target: {
        value: "resolve from regression"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "处理稳定性告警" }));
    await waitFor(() => {
      expect(handleStabilityAlert).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: 稳定性告警已处理/)).toBeInTheDocument();
    });
    expect(handleStabilityAlert).toHaveBeenCalledWith("access", "alert-1", {
      action: "resolve",
      note: "resolve from regression"
    });

    expect(screen.getByRole("link", { name: "/system-roles" })).toBeInTheDocument();
  });

  test("supports admin users content and audit operations", async () => {
    const adminLogin = vi.fn().mockResolvedValue({
      access_token: "admin-token",
      expires_in: 3600,
      admin_user_id: "a-1",
      email: "admin@example.com",
      display_name: "Admin",
      roles: ["super_admin"],
      menus: ["orders", "entitlements", "users", "content", "audit"]
    });
    const getAdminOrders = vi.fn().mockResolvedValue({
      total: 3,
      page: 1,
      page_size: 20,
      items: []
    });
    const adjustAdminEntitlement = vi.fn().mockResolvedValue({
      entitlement: {
        entitlement_id: "e-1",
        user_id: "u-1",
        tier: "pro",
        status: "active",
        daily_quota: 999,
        used_today: 0,
        remaining_today: 999,
        version: 2,
        updated_at: new Date().toISOString()
      },
      adjustment: {
        adjustment_id: "ad-1",
        user_id: "u-1",
        admin_user_id: "a-1",
        reason: "manual",
        previous_tier: "free",
        new_tier: "pro",
        rolled_back: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });
    const listAdminUsers = vi.fn().mockResolvedValue({
      total: 1,
      page: 1,
      page_size: 20,
      items: [
        {
          user_id: "u-1",
          email: "u-1@example.com",
          status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]
    });
    const freezeAdminUser = vi.fn().mockResolvedValue({
      user_id: "u-1",
      status: "frozen",
      frozen_at: new Date().toISOString(),
      revoked_sessions: 1,
      updated_at: new Date().toISOString()
    });
    const unfreezeAdminUser = vi.fn().mockResolvedValue({
      user_id: "u-1",
      status: "active",
      unfrozen_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const listAdminContentItems = vi.fn().mockResolvedValue({
      total: 1,
      page: 1,
      page_size: 20,
      items: [
        {
          item_id: "c-1",
          title: "Reading Set A",
          skill: "reading",
          status: "draft",
          version: 1,
          updated_at: new Date().toISOString()
        }
      ]
    });
    const publishAdminContentItem = vi.fn().mockResolvedValue({
      item_id: "c-1",
      status: "published",
      version: 2,
      last_published_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const unpublishAdminContentItem = vi.fn().mockResolvedValue({
      item_id: "c-1",
      status: "unpublished",
      version: 3,
      updated_at: new Date().toISOString()
    });
    const getAdminAuditLogs = vi.fn().mockResolvedValue({
      total: 5,
      page: 1,
      page_size: 20,
      items: []
    });

    render(
      <AdminConsolePage
        apiClient={{
          adminLogin,
          getAdminOrders,
          adjustAdminEntitlement,
          listAdminUsers,
          freezeAdminUser,
          unfreezeAdminUser,
          listAdminContentItems,
          publishAdminContentItem,
          unpublishAdminContentItem,
          getAdminAuditLogs
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "后台登录" }));
    await waitFor(() => {
      expect(adminLogin).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: 后台登录成功/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "查询用户" }));
    await waitFor(() => {
      expect(listAdminUsers).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/user_count: 1/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "冻结用户" }));
    await waitFor(() => {
      expect(freezeAdminUser).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/managed_user_status: frozen/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "解冻用户" }));
    await waitFor(() => {
      expect(unfreezeAdminUser).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/managed_user_status: active/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "查询内容" }));
    await waitFor(() => {
      expect(listAdminContentItems).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/content_count: 1/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "发布内容" }));
    await waitFor(() => {
      expect(publishAdminContentItem).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/managed_content_version: 2/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "下架内容" }));
    await waitFor(() => {
      expect(unpublishAdminContentItem).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/managed_content_version: 3/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("审计类型筛选"), {
      target: {
        value: "admin_content_published"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "查询审计日志" }));

    await waitFor(() => {
      expect(getAdminAuditLogs).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/audit_count: 5/)).toBeInTheDocument();
    });
  });
});
