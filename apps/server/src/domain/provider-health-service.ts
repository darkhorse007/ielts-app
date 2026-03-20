import { appendAudit } from "./audit.js";
import { defaultAiRuntimeConfig, type AiRuntimeConfig } from "./config.js";
import { nowIso } from "./time.js";
import { InMemoryStore } from "./store.js";
import type { ProviderHealthSnapshot } from "./types.js";

const p95 = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[idx];
};

const avgRate = (hits: number, total: number): number => {
  if (total <= 0) {
    return 1;
  }
  return Number((hits / total).toFixed(4));
};

type ProviderSample = {
  providerName: string;
  latencyMs?: number;
  fallbackTriggered?: boolean;
  success?: boolean;
  traceId: string;
  source: "speaking" | "writing" | "analytics";
  createdAt: string;
  sessionId?: string;
  evaluationId?: string;
};

export class ProviderHealthService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly aiRuntime: AiRuntimeConfig = defaultAiRuntimeConfig
  ) {}

  getProviderHealth(): {
    providers: ProviderHealthSnapshot[];
    alerts: Array<{
      provider_name: string;
      level: "yellow" | "red";
      reasons: string[];
    }>;
    healthy: boolean;
    runtime: {
      ready: boolean;
      fallbackEnabled: boolean;
      allowUserContentLogging: boolean;
      providers: Array<{
        role: "primary" | "fallback";
        providerName: string;
        enabled: boolean;
        endpointConfigured: boolean;
        apiKeyConfigured: boolean;
        dataRegion?: string;
        timeoutMs: number;
        sendsUserContent: boolean;
      }>;
    };
  } {
    const samples = this.collectSamples();
    const grouped = new Map<string, ProviderSample[]>();
    for (const sample of samples) {
      if (!grouped.has(sample.providerName)) {
        grouped.set(sample.providerName, []);
      }
      grouped.get(sample.providerName)?.push(sample);
    }

    const providers: ProviderHealthSnapshot[] = [];
    for (const [providerName, items] of grouped.entries()) {
      const total = items.length;
      const successCount = items.filter((item) => item.success !== false).length;
      const fallbackCount = items.filter((item) => item.fallbackTriggered === true).length;
      const latencies = items.map((item) => item.latencyMs).filter((item): item is number => typeof item === "number");
      const p95LatencyMs = p95(latencies);
      const successRate = avgRate(successCount, total);
      const fallbackRate = avgRate(fallbackCount, total);

      const reasons: string[] = [];
      let alertLevel: "green" | "yellow" | "red" = "green";
      if (successRate < 0.9) {
        alertLevel = "red";
        reasons.push("success_rate_below_90%");
      } else if (successRate < 0.96) {
        alertLevel = "yellow";
        reasons.push("success_rate_below_96%");
      }
      if (fallbackRate > 0.3) {
        alertLevel = "red";
        reasons.push("fallback_rate_above_30%");
      } else if (fallbackRate > 0.15 && alertLevel !== "red") {
        alertLevel = "yellow";
        reasons.push("fallback_rate_above_15%");
      }
      if (p95LatencyMs > 5000) {
        alertLevel = "red";
        reasons.push("latency_p95_above_5000ms");
      } else if (p95LatencyMs > 3000 && alertLevel !== "red") {
        alertLevel = "yellow";
        reasons.push("latency_p95_above_3000ms");
      }

      const snapshot: ProviderHealthSnapshot = {
        providerName,
        successRate,
        fallbackRate,
        p95LatencyMs,
        totalCalls: total,
        alertLevel,
        alertReasons: reasons,
        recentTraces: items
          .filter((item) => item.fallbackTriggered || item.success === false || (item.latencyMs ?? 0) > 3000)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 10)
          .map((item) => ({
            traceId: item.traceId,
            source: item.source,
            latencyMs: item.latencyMs,
            fallbackTriggered: item.fallbackTriggered,
            createdAt: item.createdAt,
            sessionId: item.sessionId,
            evaluationId: item.evaluationId
          })),
        updatedAt: nowIso()
      };
      this.store.providerHealthByName.set(providerName, snapshot);
      providers.push(snapshot);
    }

    providers.sort((a, b) => a.providerName.localeCompare(b.providerName));
    const alerts = providers
      .filter((item) => item.alertLevel !== "green")
      .map((item) => {
        const level: "yellow" | "red" = item.alertLevel === "red" ? "red" : "yellow";
        return {
          provider_name: item.providerName,
          level,
          reasons: item.alertReasons
        };
      });

    appendAudit(this.store, "provider_health_checked", {
      metadata: {
        providerCount: providers.length,
        alertCount: alerts.length
      }
    });

    return {
      providers,
      alerts,
      healthy: alerts.length === 0,
      runtime: {
        ready: this.aiRuntime.ready,
        fallbackEnabled: this.aiRuntime.fallbackEnabled,
        allowUserContentLogging: this.aiRuntime.allowUserContentLogging,
        providers: this.aiRuntime.providers.map((provider) => ({
          role: provider.role,
          providerName: provider.providerName,
          enabled: provider.enabled,
          endpointConfigured: Boolean(provider.endpoint),
          apiKeyConfigured: provider.apiKeyConfigured,
          dataRegion: provider.dataRegion,
          timeoutMs: provider.timeoutMs,
          sendsUserContent: provider.sendsUserContent
        }))
      }
    };
  }

  private collectSamples(): ProviderSample[] {
    const fromAnalytics: ProviderSample[] = this.store.analyticsEvents
      .filter((item) => Boolean(item.providerName))
      .map((item) => ({
        providerName: this.normalizeProviderName(item.providerName ?? "unknown"),
        latencyMs: item.latencyMs,
        fallbackTriggered: item.fallbackTriggered,
        success: item.success,
        traceId: item.traceId,
        source: "analytics",
        createdAt: item.createdAt
      }));

    const fromAudit: ProviderSample[] = this.store.auditEvents
      .filter((event) => event.type === "speaking_transcript_received" || event.type === "writing_evaluated")
      .map((event) => {
        const fallbackTriggered = Boolean(event.metadata.fallbackTriggered);
        const providerName = fallbackTriggered ? this.getFallbackProviderName() : this.getPrimaryProviderName();
        const latencyRaw = event.metadata.latencyMs;
        const latencyMs = typeof latencyRaw === "number" ? latencyRaw : undefined;
        const traceId =
          typeof event.metadata.sessionId === "string"
            ? event.metadata.sessionId
            : typeof event.metadata.evaluationId === "string"
              ? event.metadata.evaluationId
              : event.id;
        return {
          providerName,
          latencyMs,
          fallbackTriggered,
          success: !fallbackTriggered,
          traceId,
          source: event.type === "speaking_transcript_received" ? ("speaking" as const) : ("writing" as const),
          createdAt: event.createdAt,
          sessionId: typeof event.metadata.sessionId === "string" ? event.metadata.sessionId : undefined,
          evaluationId: typeof event.metadata.evaluationId === "string" ? event.metadata.evaluationId : undefined
        };
      });

    const combined = [...fromAudit, ...fromAnalytics];
    if (combined.length === 0) {
      return [
        {
          providerName: this.getPrimaryProviderName(),
          success: true,
          fallbackTriggered: false,
          latencyMs: 800,
          traceId: "bootstrap-sample",
          source: "analytics",
          createdAt: nowIso()
        }
      ];
    }
    return combined;
  }

  private getPrimaryProviderName(): string {
    return this.aiRuntime.providers.find((provider) => provider.role === "primary")?.providerName ?? "primary-llm";
  }

  private getFallbackProviderName(): string {
    return this.aiRuntime.providers.find((provider) => provider.role === "fallback")?.providerName ?? "fallback-llm";
  }

  private normalizeProviderName(providerName: string): string {
    if (providerName === "primary-llm") {
      return this.getPrimaryProviderName();
    }
    if (providerName === "fallback-llm") {
      return this.getFallbackProviderName();
    }
    return providerName;
  }
}
