import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TokenStorage } from "../src/lib/token-storage";
import { StabilityOpsPage } from "../src/pages/StabilityOpsPage";

describe("S9 stability ops page", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("supports metrics, soak, checkpoint and alert handling flow", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 900,
      userId: "u-1"
    });

    const getReleaseOperationalMetrics = vi.fn().mockResolvedValue({
      idempotency: {
        totals: {
          attempts: 2,
          replay_hits: 1,
          conflict_count: 0,
          replay_rate: 50,
          conflict_rate: 0
        },
        actions: []
      },
      write_latency: {
        total_writes: 2,
        failed_writes: 0,
        avg_latency_ms: 20,
        p95_latency_ms: 48,
        max_latency_ms: 60,
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
          prolonged_count: 0,
          recovered_count: 1,
          recent: [
            {
              event: "circuit_opened",
              backend: "postgres",
              operation: "flush",
              write_failed: true,
              consecutive_write_failures: 5,
              duration_ms: 48000,
              last_error: "connection terminated",
              recorded_at: new Date().toISOString()
            }
          ]
        }
      }
    });

    const startStabilitySoakTest = vi.fn().mockResolvedValue({
      run_id: "run-1"
    });
    const recordStabilityCheckpoint = vi.fn().mockResolvedValue({
      checkpoint_id: "cp-1"
    });
    const getStabilityReport = vi.fn().mockResolvedValue({
      summary: {
        checkpoint_count: 1,
        avg_api_success_rate: 99.8,
        max_latency_p95_ms: 1200
      }
    });
    const listStabilityAlerts = vi.fn().mockResolvedValue({
      total: 1,
      page: 1,
      items: [
        {
          alert_id: "alert-1"
        }
      ]
    });
    const handleStabilityAlert = vi.fn().mockResolvedValue({
      alert_id: "alert-1",
      status: "resolved"
    });

    render(
      <StabilityOpsPage
        apiClient={{
          startStabilitySoakTest,
          recordStabilityCheckpoint,
          getStabilityReport,
          listStabilityAlerts,
          handleStabilityAlert,
          getReleaseOperationalMetrics
        }}
        tokenStorage={tokenStorage}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "加载发布运行指标" }));
    await waitFor(() => expect(getReleaseOperationalMetrics).toHaveBeenCalledWith("access"));
    expect(screen.getByText(/metrics: idempotency=50%\/0%/)).toBeInTheDocument();
    expect(screen.getByText(/storage_alerting: opened=1; prolonged=0; recovered=1; threshold_ms=30000/)).toBeInTheDocument();
    expect(screen.getByText(/storage_alerting: .*recent=1\/30; capped=0/)).toBeInTheDocument();
    expect(screen.getByText(/circuit_opened; backend=postgres; operation=flush; failed=true/)).toBeInTheDocument();
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
    expect(within(storageRecentList).getByText(/circuit_opened; backend=postgres; operation=flush; failed=true/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "启动稳定性长测" }));
    await waitFor(() =>
      expect(startStabilitySoakTest).toHaveBeenCalledWith(
        "access",
        expect.objectContaining({
          release_id: "REL-S9-STABLE-001",
          planned_duration_hours: 72
        })
      )
    );
    expect(screen.getByLabelText("run_id")).toHaveValue("run-1");

    fireEvent.click(screen.getByRole("button", { name: "记录检查点" }));
    await waitFor(() =>
      expect(recordStabilityCheckpoint).toHaveBeenCalledWith(
        "access",
        "run-1",
        expect.objectContaining({
          at_hour: 24,
          crash_count: 1,
          active_sessions: 2200,
          api_success_rate: 99.7,
          latency_p95_ms: 1200
        })
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "加载趋势报告" }));
    await waitFor(() => expect(getStabilityReport).toHaveBeenCalledWith("access", "run-1"));
    await waitFor(() =>
      expect(screen.getByText(/report: checkpoints=1; avg_success=99.8; max_latency=1200/)).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: "加载告警" }));
    await waitFor(() =>
      expect(listStabilityAlerts).toHaveBeenCalledWith(
        "access",
        expect.objectContaining({
          run_id: "run-1",
          release_id: "REL-S9-STABLE-001",
          status: "open"
        })
      )
    );
    await waitFor(() => expect(screen.getByLabelText("alert_id")).toHaveValue("alert-1"));

    fireEvent.click(screen.getByRole("button", { name: "处理告警" }));
    await waitFor(() =>
      expect(handleStabilityAlert).toHaveBeenCalledWith(
        "access",
        "alert-1",
        expect.objectContaining({
          action: "resolve"
        })
      )
    );
    expect(screen.getByText(/status: 告警已处理 status=resolved/)).toBeInTheDocument();
  });
});
