import { useState } from "react";
import type { ApiClient } from "../lib/api-client";
import { TokenStorage } from "../lib/token-storage";

type StabilityOpsPageProps = {
  apiClient: Pick<
    ApiClient,
    | "startStabilitySoakTest"
    | "recordStabilityCheckpoint"
    | "getStabilityReport"
    | "listStabilityAlerts"
    | "handleStabilityAlert"
    | "getReleaseOperationalMetrics"
  >;
  tokenStorage: TokenStorage;
};

export const StabilityOpsPage = ({ apiClient, tokenStorage }: StabilityOpsPageProps) => {
  const [releaseId, setReleaseId] = useState("REL-S9-STABLE-001");
  const [runId, setRunId] = useState("");
  const [atHour, setAtHour] = useState("24");
  const [crashCount, setCrashCount] = useState("1");
  const [activeSessions, setActiveSessions] = useState("2200");
  const [apiSuccessRate, setApiSuccessRate] = useState("99.7");
  const [latencyP95Ms, setLatencyP95Ms] = useState("1200");
  const [alertId, setAlertId] = useState("");
  const [alertNote, setAlertNote] = useState("handled from stability page");

  const [metricsText, setMetricsText] = useState("-");
  const [storageAlertingText, setStorageAlertingText] = useState("-");
  const [storageAlertingRecentItems, setStorageAlertingRecentItems] = useState<
    Array<{
      event: "circuit_opened" | "circuit_prolonged" | "circuit_recovered";
      backend: "memory" | "sqlite" | "postgres";
      operation: string;
      write_failed: boolean;
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
  const [reportText, setReportText] = useState("-");
  const [alertsText, setAlertsText] = useState("-");
  const [status, setStatus] = useState("未开始");
  const [error, setError] = useState<string | null>(null);

  const withToken = (): string => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      throw new Error("会话已失效，请重新登录");
    }
    return accessToken;
  };

  const loadMetrics = async (): Promise<void> => {
    try {
      const metrics = await apiClient.getReleaseOperationalMetrics(withToken());
      setMetricsText(
        `idempotency=${metrics.idempotency.totals.replay_rate}%/${metrics.idempotency.totals.conflict_rate}%; latency=${metrics.write_latency.p95_latency_ms}ms; storage=${metrics.storage_resilience.backend}/${metrics.storage_resilience.circuit_open ? "open" : "closed"}`
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
          recorded_at: item.recorded_at
        }))
      );
      setStatus("已加载发布运行指标");
      setError(null);
    } catch (metricsError) {
      setError(metricsError instanceof Error ? metricsError.message : "加载发布运行指标失败");
    }
  };

  const startSoak = async (): Promise<void> => {
    try {
      const run = await apiClient.startStabilitySoakTest(withToken(), {
        release_id: releaseId.trim(),
        planned_duration_hours: 72
      });
      setRunId(run.run_id);
      setStatus(`长测已启动 run=${run.run_id}`);
      setError(null);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "启动稳定性长测失败");
    }
  };

  const recordCheckpoint = async (): Promise<void> => {
    if (!runId.trim()) {
      setError("请先启动稳定性长测");
      return;
    }
    try {
      const checkpoint = await apiClient.recordStabilityCheckpoint(withToken(), runId.trim(), {
        at_hour: Number(atHour),
        crash_count: Number(crashCount),
        active_sessions: Number(activeSessions),
        api_success_rate: Number(apiSuccessRate),
        latency_p95_ms: Number(latencyP95Ms)
      });
      setStatus(`检查点已记录 checkpoint=${checkpoint.checkpoint_id}`);
      setError(null);
    } catch (checkpointError) {
      setError(checkpointError instanceof Error ? checkpointError.message : "记录检查点失败");
    }
  };

  const loadReport = async (): Promise<void> => {
    if (!runId.trim()) {
      setError("请先填写 run_id");
      return;
    }
    try {
      const report = await apiClient.getStabilityReport(withToken(), runId.trim());
      setReportText(
        `checkpoints=${report.summary.checkpoint_count}; avg_success=${report.summary.avg_api_success_rate}; max_latency=${report.summary.max_latency_p95_ms}`
      );
      setStatus("已加载稳定性趋势报告");
      setError(null);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "加载趋势报告失败");
    }
  };

  const loadAlerts = async (): Promise<void> => {
    try {
      const result = await apiClient.listStabilityAlerts(withToken(), {
        run_id: runId.trim() || undefined,
        release_id: releaseId.trim() || undefined,
        status: "open",
        page: 1,
        page_size: 20
      });
      const first = result.items[0];
      if (first) {
        setAlertId(first.alert_id);
      }
      setAlertsText(`total=${result.total}; page=${result.page}; first=${first?.alert_id ?? "-"}`);
      setStatus("已加载稳定性告警");
      setError(null);
    } catch (alertError) {
      setError(alertError instanceof Error ? alertError.message : "加载告警失败");
    }
  };

  const resolveAlert = async (): Promise<void> => {
    if (!alertId.trim()) {
      setError("请先填写 alert_id");
      return;
    }
    try {
      const alert = await apiClient.handleStabilityAlert(withToken(), alertId.trim(), {
        action: "resolve",
        note: alertNote.trim() || undefined
      });
      setStatus(`告警已处理 status=${alert.status}`);
      setError(null);
    } catch (handleError) {
      setError(handleError instanceof Error ? handleError.message : "处理告警失败");
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
      <h1>稳定性控制台</h1>
      <p>用于执行长测、检查点采集、告警处理与发布指标查看。</p>

      <label htmlFor="stability-release-id">release_id</label>
      <input id="stability-release-id" value={releaseId} onChange={(event) => setReleaseId(event.target.value)} />

      <label htmlFor="stability-run-id">run_id</label>
      <input id="stability-run-id" value={runId} onChange={(event) => setRunId(event.target.value)} />

      <label htmlFor="stability-at-hour">at_hour</label>
      <input id="stability-at-hour" value={atHour} onChange={(event) => setAtHour(event.target.value)} />

      <label htmlFor="stability-crash-count">crash_count</label>
      <input id="stability-crash-count" value={crashCount} onChange={(event) => setCrashCount(event.target.value)} />

      <label htmlFor="stability-active-sessions">active_sessions</label>
      <input
        id="stability-active-sessions"
        value={activeSessions}
        onChange={(event) => setActiveSessions(event.target.value)}
      />

      <label htmlFor="stability-api-success-rate">api_success_rate</label>
      <input
        id="stability-api-success-rate"
        value={apiSuccessRate}
        onChange={(event) => setApiSuccessRate(event.target.value)}
      />

      <label htmlFor="stability-latency-p95">latency_p95_ms</label>
      <input
        id="stability-latency-p95"
        value={latencyP95Ms}
        onChange={(event) => setLatencyP95Ms(event.target.value)}
      />

      <label htmlFor="stability-alert-id">alert_id</label>
      <input id="stability-alert-id" value={alertId} onChange={(event) => setAlertId(event.target.value)} />

      <label htmlFor="stability-alert-note">alert_note</label>
      <input id="stability-alert-note" value={alertNote} onChange={(event) => setAlertNote(event.target.value)} />

      <div>
        <button type="button" onClick={() => void loadMetrics()}>
          加载发布运行指标
        </button>
        <button type="button" onClick={() => void startSoak()}>
          启动稳定性长测
        </button>
        <button type="button" onClick={() => void recordCheckpoint()}>
          记录检查点
        </button>
        <button type="button" onClick={() => void loadReport()}>
          加载趋势报告
        </button>
        <button type="button" onClick={() => void loadAlerts()}>
          加载告警
        </button>
        <button type="button" onClick={() => void resolveAlert()}>
          处理告警
        </button>
      </div>

      {error ? <p role="alert">{error}</p> : null}
      <p>status: {status}</p>
      <p>metrics: {metricsText}</p>
      <p>storage_alerting: {storageAlertingText}</p>
      <label htmlFor="stability-storage-alert-event-filter">storage_alert_event_filter</label>
      <select
        id="stability-storage-alert-event-filter"
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
      <label htmlFor="stability-storage-alert-backend-filter">storage_alert_backend_filter</label>
      <select
        id="stability-storage-alert-backend-filter"
        value={storageAlertBackendFilter}
        onChange={(event) => setStorageAlertBackendFilter(event.target.value as "all" | "memory" | "sqlite" | "postgres")}
      >
        <option value="all">all</option>
        <option value="memory">memory</option>
        <option value="sqlite">sqlite</option>
        <option value="postgres">postgres</option>
      </select>
      <label htmlFor="stability-storage-alert-write-failed-filter">storage_alert_write_failed_filter</label>
      <select
        id="stability-storage-alert-write-failed-filter"
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
              {item.event}; backend={item.backend}; operation={item.operation}; failed={String(item.write_failed)}
            </li>
          ))
        )}
      </ul>
      <p>report: {reportText}</p>
      <p>alerts: {alertsText}</p>
    </section>
  );
};
