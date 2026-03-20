import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { appendAudit } from "./audit.js";
import { nowIso } from "./time.js";
import { InMemoryStore } from "./store.js";
import { InMemoryReleaseRepository } from "./release-repository.js";
import type { ReleaseRepository, ReleaseRepositoryWriteResilienceState } from "./release-repository.js";
import type {
  AnalyticsEvent,
  BetaFeedback,
  BetaFeedbackCategory,
  BetaFeedbackPriority,
  BetaFeedbackSeverity,
  BetaFeedbackStatus,
  BetaWhitelistEntry,
  BetaWhitelistStatus,
  CanaryRelease,
  ReleaseGateEvaluation,
  StabilityAlert,
  StabilityAlertLevel,
  StabilityAlertStatus,
  StabilityAlertType,
  StabilityCheckpoint,
  StabilitySoakRun,
  SystemActionIdempotencyRecord
} from "./types.js";

const whitelistKey = (userId: string, releaseId: string): string => `${userId}::${releaseId}`;

const toDefaultPriority = (severity: BetaFeedbackSeverity): BetaFeedbackPriority => {
  if (severity === "critical") {
    return "critical";
  }
  if (severity === "high") {
    return "high";
  }
  if (severity === "medium") {
    return "medium";
  }
  return "low";
};

type StabilityTrendPoint = {
  checkpointId: string;
  atHour: number;
  crashCount: number;
  activeSessions: number;
  crashRatePer1k: number;
  apiSuccessRate: number;
  latencyP95Ms: number;
  recordedAt: string;
};

type StabilityReportSummary = {
  checkpointCount: number;
  collectedDurationHours: number;
  lastCheckpointAt: string;
  totalCrashes: number;
  maxCrashCount: number;
  avgCrashRatePer1k: number;
  minApiSuccessRate: number;
  avgApiSuccessRate: number;
  maxLatencyP95Ms: number;
  avgLatencyP95Ms: number;
};

type StabilityReport = {
  run: StabilitySoakRun;
  summary: StabilityReportSummary;
  trend: StabilityTrendPoint[];
  generatedAt: string;
};

type StabilityComparison = {
  baseline: StabilityReport;
  target: StabilityReport;
  delta: {
    totalCrashes: number;
    avgCrashRatePer1k: number;
    avgApiSuccessRate: number;
    avgLatencyP95Ms: number;
  };
  conclusion: "improved" | "regressed" | "no_change";
  comparedAt: string;
};

type StabilityComparisonExport = {
  filename: string;
  content: string;
  comparedAt: string;
};

type StabilityAlertThresholds = {
  crashRatePer1k: {
    yellow: number;
    red: number;
  };
  apiSuccessRate: {
    yellow: number;
    red: number;
  };
  latencyP95Ms: {
    yellow: number;
    red: number;
  };
};

type IdempotencyActionMetrics = {
  actionName: string;
  attempts: number;
  replayHits: number;
  conflictCount: number;
  replayRate: number;
  conflictRate: number;
};

type ReleaseWriteLatencySample = {
  operation: string;
  latencyMs: number;
  failed: boolean;
  recordedAt: string;
};

type ReleaseWriteLatencyAlert = {
  operation: string;
  latencyMs: number;
  level: "yellow" | "red";
  failed: boolean;
  thresholdMs: number;
  recordedAt: string;
};

type StorageResilienceAlertEvent = "circuit_opened" | "circuit_prolonged" | "circuit_recovered";

type StorageResilienceAlert = {
  event: StorageResilienceAlertEvent;
  backend: ReleaseRepositoryWriteResilienceState["backend"];
  operation: string;
  writeFailed: boolean;
  consecutiveWriteFailures: number;
  durationMs?: number;
  lastError?: string;
  recordedAt: string;
};

export type ReleaseOperationalMetrics = {
  idempotency: {
    totals: {
      attempts: number;
      replayHits: number;
      conflictCount: number;
      replayRate: number;
      conflictRate: number;
    };
    actions: IdempotencyActionMetrics[];
  };
  writeLatency: {
    totalWrites: number;
    failedWrites: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    maxLatencyMs: number;
    thresholdsMs: {
      yellow: number;
      red: number;
    };
    alerts: {
      yellowCount: number;
      redCount: number;
      recent: ReleaseWriteLatencyAlert[];
    };
    recentSamples: ReleaseWriteLatencySample[];
  };
  storageResilience: ReleaseRepositoryWriteResilienceState;
  storageResilienceAlerting: {
    circuitOpenThresholdMs: number;
    recentLimit: number;
    recentCount: number;
    cappedCount: number;
    openedCount: number;
    prolongedCount: number;
    recoveredCount: number;
    recent: StorageResilienceAlert[];
  };
};

type BetaCohortTimedAnalyticsEvent = AnalyticsEvent & {
  timestampMs: number;
};

type BetaCohortPriorityRank = BetaFeedbackPriority | "none";

export type BetaCohortUserExportRow = {
  whitelistId: string;
  userId: string;
  releaseId: string;
  whitelistStatus: BetaWhitelistStatus;
  cohortStartedAt: string;
  whitelistUpdatedAt: string;
  onboardingCompletedAt?: string;
  firstCoreLearningEventAt?: string;
  activationQualified: boolean;
  activationQualifiedAt?: string;
  d7Retained: boolean;
  d7RetainedAt?: string;
  week1CoreLearningEventCount: number;
  week1TaskCompletionQualified: boolean;
  firstMockCompletedAt?: string;
  firstMockCompletionQualified: boolean;
  totalCoreLearningEventCount: number;
  feedbackTotal: number;
  unresolvedFeedbackCount: number;
  highestOpenFeedbackPriority: BetaCohortPriorityRank;
};

export type BetaCohortMetrics = {
  releaseId: string;
  generatedAt: string;
  invitedUsers: number;
  disabledUsers: number;
  eligibleActiveUsers: number;
  internalFeedbackTotal: number;
  unresolvedCriticalFeedback: number;
  unresolvedHighFeedbackOlderThan48h: number;
  invitedToActivationUsers: number;
  invitedToActivationRate: number;
  d7RetainedUsers: number;
  d7RetentionRate: number;
  week1TaskCompletedUsers: number;
  week1TaskCompletionRate: number;
  firstMockCompletedUsers: number;
  firstMockCompletionRate: number;
};

export type BetaCohortExport = {
  releaseId: string;
  generatedAt: string;
  metrics: BetaCohortMetrics;
  users: BetaCohortUserExportRow[];
};

type BetaCohortExportFile = {
  filename: string;
  content: string;
  generatedAt: string;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const HOUR_IN_MS = 60 * 60 * 1000;
const ACTIVATION_WINDOW_MS = 72 * HOUR_IN_MS;
const D7_WINDOW_START_MS = 6 * DAY_IN_MS;
const D7_WINDOW_END_MS = 7 * DAY_IN_MS;
const WEEK1_WINDOW_MS = 7 * DAY_IN_MS;
const FIRST_MOCK_WINDOW_MS = 14 * DAY_IN_MS;
const HIGH_FEEDBACK_SLA_MS = 48 * HOUR_IN_MS;

const CORE_BETA_LEARNING_EVENT_TYPES = new Set([
  "diagnostic_completed",
  "practice_submitted",
  "speaking_turn_scored",
  "writing_evaluated",
  "mock_exam_submitted"
]);

const FEEDBACK_PRIORITY_WEIGHT: Record<BetaFeedbackPriority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

class RingBuffer<T> {
  private readonly items: (T | undefined)[];
  private nextIndex = 0;
  private count = 0;

  constructor(private readonly capacity: number) {
    this.items = new Array<T | undefined>(capacity);
  }

  push(value: T): void {
    if (this.capacity <= 0) {
      return;
    }
    this.items[this.nextIndex] = value;
    this.nextIndex = (this.nextIndex + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  toArray(): T[] {
    if (this.count === 0) {
      return [];
    }
    const start = (this.nextIndex - this.count + this.capacity) % this.capacity;
    const ordered: T[] = [];
    for (let index = 0; index < this.count; index += 1) {
      const item = this.items[(start + index) % this.capacity];
      if (item !== undefined) {
        ordered.push(item);
      }
    }
    return ordered;
  }

  size(): number {
    return this.count;
  }
}

const stringifyJson = (value: unknown): string => JSON.stringify(value);

const parseIsoToMs = (value: string): number => {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const isEventTypeInWindow = (eventMs: number, startMs: number, endMs: number): boolean =>
  eventMs >= startMs && eventMs < endMs;

const resolveRate = (numerator: number, denominator: number): number => {
  if (denominator <= 0) {
    return 0;
  }
  return round2((numerator / denominator) * 100);
};

const csvEscape = (value: string | number | boolean | undefined): string => {
  if (value === undefined) {
    return "";
  }
  const raw = String(value);
  if (!raw.includes(",") && !raw.includes("\"") && !raw.includes("\n")) {
    return raw;
  }
  return `"${raw.replaceAll("\"", "\"\"")}"`;
};

const toCrashRatePer1k = (crashCount: number, activeSessions: number): number => {
  if (activeSessions <= 0) {
    return 0;
  }
  return round2((crashCount / activeSessions) * 1000);
};

const sanitizeFileSegment = (value: string): string => value.replace(/[^a-zA-Z0-9_-]+/g, "_");

const STABILITY_ALERT_THRESHOLDS: StabilityAlertThresholds = {
  crashRatePer1k: {
    yellow: 1.5,
    red: 3
  },
  apiSuccessRate: {
    yellow: 99.5,
    red: 99
  },
  latencyP95Ms: {
    yellow: 1500,
    red: 2500
  }
};

export type ReleaseServiceErrorCode =
  | "RELEASE_STORAGE_UNAVAILABLE"
  | "RELEASE_GATE_NOT_PASSED"
  | "CANARY_NOT_FOUND"
  | "CANARY_NOT_RUNNING"
  | "CANARY_VERSION_CONFLICT"
  | "CANARY_METRICS_NOT_MET"
  | "STABILITY_RELEASE_ID_REQUIRED"
  | "STABILITY_SOAK_RUN_NOT_FOUND"
  | "STABILITY_SOAK_RUN_NOT_RUNNING"
  | "STABILITY_CHECKPOINT_OUT_OF_RANGE"
  | "STABILITY_CHECKPOINT_VERSION_CONFLICT"
  | "STABILITY_REPORT_NOT_FOUND"
  | "STABILITY_REPORT_NOT_READY"
  | "STABILITY_ALERT_NOT_FOUND"
  | "STABILITY_ALERT_VERSION_CONFLICT"
  | "STABILITY_ALERT_ALREADY_RESOLVED"
  | "IDEMPOTENCY_KEY_CONFLICT"
  | "BETA_RELEASE_ID_REQUIRED"
  | "BETA_WHITELIST_CORRUPTED"
  | "BETA_WHITELIST_VERSION_CONFLICT"
  | "BETA_ACCESS_DENIED"
  | "BETA_FEEDBACK_VERSION_CONFLICT"
  | "BETA_FEEDBACK_NOT_FOUND";

export class ReleaseServiceError extends Error {
  readonly code: ReleaseServiceErrorCode;

  constructor(code: ReleaseServiceErrorCode) {
    super(code);
    this.name = "ReleaseServiceError";
    this.code = code;
  }
}

export const isReleaseServiceError = (error: unknown): error is ReleaseServiceError =>
  error instanceof ReleaseServiceError;

export class ReleaseService {
  private readonly idempotencyCountersByAction = new Map<
    string,
    {
      attempts: number;
      replayHits: number;
      conflictCount: number;
    }
  >();

  private readonly writeLatencySamples: ReleaseWriteLatencySample[] = [];
  private readonly recentWriteLatencyAlerts: ReleaseWriteLatencyAlert[] = [];
  private readonly writeLatencyThresholdsMs = {
    yellow: 400,
    red: 1000
  } as const;
  private readonly storageResilienceCircuitOpenThresholdMs = toPositiveInt(
    process.env.RELEASE_POSTGRES_CIRCUIT_ALERT_THRESHOLD_MS,
    30_000
  );
  private readonly maxRecentWriteLatencySamples = 200;
  private readonly maxRecentWriteLatencyAlerts = 50;
  private readonly maxRecentStorageResilienceAlerts = toPositiveInt(
    process.env.RELEASE_POSTGRES_CIRCUIT_ALERT_RECENT_LIMIT,
    30
  );
  private readonly recentStorageResilienceAlerts = new RingBuffer<StorageResilienceAlert>(
    this.maxRecentStorageResilienceAlerts
  );
  private storageResilienceOpenedCount = 0;
  private storageResilienceProlongedCount = 0;
  private storageResilienceRecoveredCount = 0;
  private storageResilienceAlertTotalCount = 0;
  private storageResilienceOpenedAtMs: number | null = null;
  private storageResilienceLastProlongedAlertAtMs: number | null = null;
  private storageResilienceLastCircuitOpen = false;

  constructor(
    private readonly store: InMemoryStore,
    private readonly releaseRepository: ReleaseRepository = new InMemoryReleaseRepository(store)
  ) {}

  flush(): Promise<void> {
    return this.releaseRepository.flush();
  }

  private async flushOrThrow(operation: string): Promise<void> {
    const startedAt = performance.now();
    try {
      await this.releaseRepository.flush();
      this.recordWriteLatency({
        operation,
        latencyMs: performance.now() - startedAt,
        failed: false
      });
      this.observeStorageResilience({
        operation,
        writeFailed: false
      });
    } catch {
      this.recordWriteLatency({
        operation,
        latencyMs: performance.now() - startedAt,
        failed: true
      });
      this.observeStorageResilience({
        operation,
        writeFailed: true
      });
      throw new ReleaseServiceError("RELEASE_STORAGE_UNAVAILABLE");
    }
  }

  evaluateGate(input: {
    releaseId: string;
    p0Defects: number;
    regressionPassRate: number;
    apiSuccessRate: number;
    providerHealthy: boolean;
  }): ReleaseGateEvaluation {
    const checks = [
      {
        name: "p0_defects",
        threshold: "== 0",
        actual: String(input.p0Defects),
        passed: input.p0Defects === 0
      },
      {
        name: "regression_pass_rate",
        threshold: ">= 98%",
        actual: `${input.regressionPassRate}%`,
        passed: input.regressionPassRate >= 98
      },
      {
        name: "api_success_rate",
        threshold: ">= 99.5%",
        actual: `${input.apiSuccessRate}%`,
        passed: input.apiSuccessRate >= 99.5
      },
      {
        name: "provider_health",
        threshold: "healthy",
        actual: input.providerHealthy ? "healthy" : "degraded",
        passed: input.providerHealthy
      }
    ];

    const evaluation: ReleaseGateEvaluation = {
      id: randomUUID(),
      releaseId: input.releaseId,
      checks,
      passed: checks.every((item) => item.passed),
      createdAt: nowIso()
    };
    this.releaseRepository.latestReleaseGateByReleaseId.set(input.releaseId, evaluation);

    appendAudit(this.store, "release_gate_evaluated", {
      metadata: {
        releaseId: input.releaseId,
        passed: evaluation.passed
      }
    });

    return evaluation;
  }

  async evaluateGateAsync(input: {
    releaseId: string;
    p0Defects: number;
    regressionPassRate: number;
    apiSuccessRate: number;
    providerHealthy: boolean;
  }): Promise<ReleaseGateEvaluation> {
    const result = this.evaluateGate(input);
    await this.flushOrThrow("release_gate_evaluate");
    return result;
  }

  startCanary(input: {
    releaseId: string;
    targetPercent: number;
    metrics: {
      errorRate: number;
      latencyP95Ms: number;
      providerHealthy: boolean;
    };
    idempotencyKey?: string;
  }): CanaryRelease {
    const percent = Math.max(1, Math.min(50, Math.trunc(input.targetPercent)));
    const fingerprint = stringifyJson({
      releaseId: input.releaseId,
      targetPercent: percent,
      metrics: input.metrics
    });
    if (input.idempotencyKey?.trim()) {
      const cached = this.resolveIdempotencyResult<CanaryRelease>({
        idempotencyKey: input.idempotencyKey.trim(),
        actionName: "canary_release_start",
        resourceId: input.releaseId,
        fingerprint
      });
      if (cached) {
        return cached;
      }
    }
    const gate = this.releaseRepository.latestReleaseGateByReleaseId.get(input.releaseId);
    if (!gate || !gate.passed) {
      throw new ReleaseServiceError("RELEASE_GATE_NOT_PASSED");
    }

    const now = nowIso();
    const canary: CanaryRelease = {
      id: randomUUID(),
      releaseId: input.releaseId,
      version: 1,
      targetPercent: percent,
      status: "running",
      startedAt: now,
      metrics: {
        errorRate: input.metrics.errorRate,
        latencyP95Ms: input.metrics.latencyP95Ms,
        providerHealthy: input.metrics.providerHealthy
      },
      createdAt: now,
      updatedAt: now
    };
    this.releaseRepository.canaryReleasesById.set(canary.id, canary);

    appendAudit(this.store, "canary_release_started", {
      metadata: {
        releaseId: input.releaseId,
        canaryId: canary.id,
        targetPercent: canary.targetPercent
      }
    });

    if (input.idempotencyKey?.trim()) {
      this.persistIdempotencyResult({
        idempotencyKey: input.idempotencyKey.trim(),
        actionName: "canary_release_start",
        resourceId: input.releaseId,
        fingerprint,
        response: canary
      });
    }

    return canary;
  }

  async startCanaryAsync(input: {
    releaseId: string;
    targetPercent: number;
    metrics: {
      errorRate: number;
      latencyP95Ms: number;
      providerHealthy: boolean;
    };
    idempotencyKey?: string;
  }): Promise<CanaryRelease> {
    const result = this.startCanary(input);
    await this.flushOrThrow("canary_release_start");
    return result;
  }

  promoteCanary(input: {
    canaryId: string;
    metrics: {
      errorRate: number;
      latencyP95Ms: number;
      providerHealthy: boolean;
    };
    expectedVersion?: number;
    idempotencyKey?: string;
  }): CanaryRelease {
    const fingerprint = stringifyJson({
      canaryId: input.canaryId,
      metrics: input.metrics,
      expectedVersion: input.expectedVersion
    });
    if (input.idempotencyKey?.trim()) {
      const cached = this.resolveIdempotencyResult<CanaryRelease>({
        idempotencyKey: input.idempotencyKey.trim(),
        actionName: "canary_release_promote",
        resourceId: input.canaryId,
        fingerprint
      });
      if (cached) {
        return cached;
      }
    }
    const canary = this.requireCanary(input.canaryId);
    if (typeof input.expectedVersion === "number" && canary.version !== input.expectedVersion) {
      throw new ReleaseServiceError("CANARY_VERSION_CONFLICT");
    }
    if (canary.status !== "running") {
      throw new ReleaseServiceError("CANARY_NOT_RUNNING");
    }

    canary.metrics = input.metrics;
    if (input.metrics.errorRate > 1 || input.metrics.latencyP95Ms > 3000 || !input.metrics.providerHealthy) {
      throw new ReleaseServiceError("CANARY_METRICS_NOT_MET");
    }

    canary.status = "promoted";
    canary.promotedAt = nowIso();
    canary.updatedAt = nowIso();
    canary.version += 1;
    this.releaseRepository.canaryReleasesById.set(canary.id, canary);

    appendAudit(this.store, "canary_release_promoted", {
      metadata: {
        canaryId: canary.id,
        releaseId: canary.releaseId
      }
    });

    if (input.idempotencyKey?.trim()) {
      this.persistIdempotencyResult({
        idempotencyKey: input.idempotencyKey.trim(),
        actionName: "canary_release_promote",
        resourceId: input.canaryId,
        fingerprint,
        response: canary
      });
    }

    return canary;
  }

  async promoteCanaryAsync(input: {
    canaryId: string;
    metrics: {
      errorRate: number;
      latencyP95Ms: number;
      providerHealthy: boolean;
    };
    expectedVersion?: number;
    idempotencyKey?: string;
  }): Promise<CanaryRelease> {
    const result = this.promoteCanary(input);
    await this.flushOrThrow("canary_release_promote");
    return result;
  }

  rollbackCanary(input: {
    canaryId: string;
    reason: string;
    expectedVersion?: number;
    idempotencyKey?: string;
  }): CanaryRelease {
    const fingerprint = stringifyJson({
      canaryId: input.canaryId,
      reason: input.reason.trim(),
      expectedVersion: input.expectedVersion
    });
    if (input.idempotencyKey?.trim()) {
      const cached = this.resolveIdempotencyResult<CanaryRelease>({
        idempotencyKey: input.idempotencyKey.trim(),
        actionName: "canary_release_rollback",
        resourceId: input.canaryId,
        fingerprint
      });
      if (cached) {
        return cached;
      }
    }

    const canary = this.requireCanary(input.canaryId);
    if (typeof input.expectedVersion === "number" && canary.version !== input.expectedVersion) {
      throw new ReleaseServiceError("CANARY_VERSION_CONFLICT");
    }
    if (canary.status === "rolled_back") {
      if (input.idempotencyKey?.trim()) {
        this.persistIdempotencyResult({
          idempotencyKey: input.idempotencyKey.trim(),
          actionName: "canary_release_rollback",
          resourceId: input.canaryId,
          fingerprint,
          response: canary
        });
      }
      return canary;
    }

    canary.status = "rolled_back";
    canary.rollbackReason = input.reason;
    canary.rolledBackAt = nowIso();
    canary.updatedAt = nowIso();
    canary.version += 1;
    this.releaseRepository.canaryReleasesById.set(canary.id, canary);

    appendAudit(this.store, "canary_release_rolled_back", {
      metadata: {
        canaryId: canary.id,
        releaseId: canary.releaseId,
        reason: input.reason
      }
    });

    if (input.idempotencyKey?.trim()) {
      this.persistIdempotencyResult({
        idempotencyKey: input.idempotencyKey.trim(),
        actionName: "canary_release_rollback",
        resourceId: input.canaryId,
        fingerprint,
        response: canary
      });
    }

    return canary;
  }

  async rollbackCanaryAsync(input: {
    canaryId: string;
    reason: string;
    expectedVersion?: number;
    idempotencyKey?: string;
  }): Promise<CanaryRelease> {
    const result = this.rollbackCanary(input);
    await this.flushOrThrow("canary_release_rollback");
    return result;
  }

  getCanary(canaryId: string): CanaryRelease {
    return this.requireCanary(canaryId);
  }

  startStabilitySoakRun(input: {
    releaseId: string;
    plannedDurationHours?: number;
    operatorUserId: string;
  }): StabilitySoakRun {
    const releaseId = input.releaseId.trim();
    if (!releaseId) {
      throw new ReleaseServiceError("STABILITY_RELEASE_ID_REQUIRED");
    }
    const plannedDurationHours = Math.max(1, Math.min(240, Math.trunc(input.plannedDurationHours ?? 72)));
    const now = nowIso();
    const run: StabilitySoakRun = {
      id: randomUUID(),
      releaseId,
      plannedDurationHours,
      status: "running",
      startedAt: now,
      createdByUserId: input.operatorUserId,
      createdAt: now,
      updatedAt: now
    };
    this.releaseRepository.stabilitySoakRunsById.set(run.id, run);
    this.releaseRepository.stabilityCheckpointsByRunId.set(run.id, []);

    appendAudit(this.store, "stability_soak_started", {
      userId: input.operatorUserId,
      metadata: {
        runId: run.id,
        releaseId: run.releaseId,
        plannedDurationHours: run.plannedDurationHours
      }
    });

    return run;
  }

  async startStabilitySoakRunAsync(input: {
    releaseId: string;
    plannedDurationHours?: number;
    operatorUserId: string;
  }): Promise<StabilitySoakRun> {
    const result = this.startStabilitySoakRun(input);
    await this.flushOrThrow("stability_soak_start");
    return result;
  }

  recordStabilityCheckpoint(input: {
    runId: string;
    atHour: number;
    crashCount: number;
    activeSessions: number;
    apiSuccessRate: number;
    latencyP95Ms: number;
    expectedVersion?: number;
    idempotencyKey?: string;
    operatorUserId: string;
  }): {
    run: StabilitySoakRun;
    checkpoint: StabilityCheckpoint;
    alerts: StabilityAlert[];
  } {
    const run = this.requireStabilitySoakRun(input.runId);
    if (run.status !== "running") {
      throw new ReleaseServiceError("STABILITY_SOAK_RUN_NOT_RUNNING");
    }

    const atHour = Math.max(0, Math.trunc(input.atHour));
    if (atHour > run.plannedDurationHours) {
      throw new ReleaseServiceError("STABILITY_CHECKPOINT_OUT_OF_RANGE");
    }

    const checkpoints = this.releaseRepository.stabilityCheckpointsByRunId.get(run.id) ?? [];
    const existing = checkpoints.find((item) => item.atHour === atHour);
    const resourceId = `${run.id}:${atHour}`;
    const fingerprint = stringifyJson({
      runId: input.runId,
      atHour,
      crashCount: Math.max(0, Math.trunc(input.crashCount)),
      activeSessions: Math.max(0, Math.trunc(input.activeSessions)),
      apiSuccessRate: round2(input.apiSuccessRate),
      latencyP95Ms: Math.max(0, Math.trunc(input.latencyP95Ms)),
      expectedVersion: input.expectedVersion
    });
    if (input.idempotencyKey?.trim()) {
      const cached = this.resolveIdempotencyResult<{
        run: StabilitySoakRun;
        checkpoint: StabilityCheckpoint;
        alerts: StabilityAlert[];
      }>({
        idempotencyKey: input.idempotencyKey.trim(),
        actionName: "stability_checkpoint_record",
        resourceId,
        fingerprint
      });
      if (cached) {
        return cached;
      }
    }
    const now = nowIso();
    const checkpoint: StabilityCheckpoint =
      existing ??
      ({
        id: randomUUID(),
        runId: run.id,
        releaseId: run.releaseId,
        version: 0,
        atHour,
        crashCount: 0,
        activeSessions: 0,
        apiSuccessRate: 0,
        latencyP95Ms: 0,
        createdByUserId: input.operatorUserId,
        createdAt: now
      } satisfies StabilityCheckpoint);

    if (typeof input.expectedVersion === "number" && checkpoint.version !== input.expectedVersion) {
      throw new ReleaseServiceError("STABILITY_CHECKPOINT_VERSION_CONFLICT");
    }

    checkpoint.crashCount = Math.max(0, Math.trunc(input.crashCount));
    checkpoint.activeSessions = Math.max(0, Math.trunc(input.activeSessions));
    checkpoint.apiSuccessRate = round2(input.apiSuccessRate);
    checkpoint.latencyP95Ms = Math.max(0, Math.trunc(input.latencyP95Ms));
    checkpoint.version += 1;

    if (!existing) {
      checkpoints.push(checkpoint);
    }
    this.releaseRepository.stabilityCheckpointsByRunId.set(run.id, checkpoints);

    if (atHour >= run.plannedDurationHours) {
      run.status = "completed";
      run.completedAt = now;
    }
    run.updatedAt = now;
    this.releaseRepository.stabilitySoakRunsById.set(run.id, run);

    appendAudit(this.store, "stability_soak_checkpoint_recorded", {
      userId: input.operatorUserId,
      metadata: {
        runId: run.id,
        releaseId: run.releaseId,
        checkpointId: checkpoint.id,
        atHour: checkpoint.atHour,
        crashCount: checkpoint.crashCount,
        activeSessions: checkpoint.activeSessions,
        apiSuccessRate: checkpoint.apiSuccessRate,
        latencyP95Ms: checkpoint.latencyP95Ms,
        runStatus: run.status
      }
    });
    const alerts = this.evaluateStabilityAlerts({
      run,
      checkpoint,
      operatorUserId: input.operatorUserId
    });

    const result = {
      run,
      checkpoint,
      alerts
    };
    if (input.idempotencyKey?.trim()) {
      this.persistIdempotencyResult({
        idempotencyKey: input.idempotencyKey.trim(),
        actionName: "stability_checkpoint_record",
        resourceId,
        fingerprint,
        response: result
      });
    }
    return result;
  }

  async recordStabilityCheckpointAsync(input: {
    runId: string;
    atHour: number;
    crashCount: number;
    activeSessions: number;
    apiSuccessRate: number;
    latencyP95Ms: number;
    expectedVersion?: number;
    idempotencyKey?: string;
    operatorUserId: string;
  }): Promise<{
    run: StabilitySoakRun;
    checkpoint: StabilityCheckpoint;
    alerts: StabilityAlert[];
  }> {
    const result = this.recordStabilityCheckpoint(input);
    await this.flushOrThrow("stability_checkpoint_record");
    return result;
  }

  getStabilityReport(input: {
    runId: string;
    operatorUserId?: string;
  }): StabilityReport {
    const run = this.requireStabilitySoakRun(input.runId);
    const report = this.buildStabilityReport(run);

    appendAudit(this.store, "stability_report_generated", {
      userId: input.operatorUserId,
      metadata: {
        runId: run.id,
        releaseId: run.releaseId,
        status: run.status,
        checkpointCount: report.summary.checkpointCount
      }
    });

    return report;
  }

  compareStabilityReports(input: {
    baselineReleaseId: string;
    targetReleaseId: string;
    operatorUserId?: string;
  }): StabilityComparison {
    const baselineRun = this.findLatestStabilityRunByReleaseId(input.baselineReleaseId);
    const targetRun = this.findLatestStabilityRunByReleaseId(input.targetReleaseId);
    if (!baselineRun || !targetRun) {
      throw new ReleaseServiceError("STABILITY_REPORT_NOT_FOUND");
    }

    const baseline = this.buildStabilityReport(baselineRun);
    const target = this.buildStabilityReport(targetRun);
    const delta = {
      totalCrashes: target.summary.totalCrashes - baseline.summary.totalCrashes,
      avgCrashRatePer1k: round2(target.summary.avgCrashRatePer1k - baseline.summary.avgCrashRatePer1k),
      avgApiSuccessRate: round2(target.summary.avgApiSuccessRate - baseline.summary.avgApiSuccessRate),
      avgLatencyP95Ms: round2(target.summary.avgLatencyP95Ms - baseline.summary.avgLatencyP95Ms)
    };
    const conclusion = this.resolveStabilityConclusion(delta);
    const result: StabilityComparison = {
      baseline,
      target,
      delta,
      conclusion,
      comparedAt: nowIso()
    };

    appendAudit(this.store, "stability_report_compared", {
      userId: input.operatorUserId,
      metadata: {
        baselineReleaseId: input.baselineReleaseId,
        targetReleaseId: input.targetReleaseId,
        baselineRunId: baseline.run.id,
        targetRunId: target.run.id,
        conclusion
      }
    });

    return result;
  }

  exportStabilityComparison(input: {
    baselineReleaseId: string;
    targetReleaseId: string;
    operatorUserId?: string;
  }): StabilityComparisonExport {
    const compared = this.compareStabilityReports(input);
    const content = [
      `baseline_release_id,${input.baselineReleaseId}`,
      `target_release_id,${input.targetReleaseId}`,
      `conclusion,${compared.conclusion}`,
      `compared_at,${compared.comparedAt}`,
      "",
      "metric,baseline,target,delta",
      `total_crashes,${compared.baseline.summary.totalCrashes},${compared.target.summary.totalCrashes},${compared.delta.totalCrashes}`,
      `avg_crash_rate_per_1k,${compared.baseline.summary.avgCrashRatePer1k},${compared.target.summary.avgCrashRatePer1k},${compared.delta.avgCrashRatePer1k}`,
      `avg_api_success_rate,${compared.baseline.summary.avgApiSuccessRate},${compared.target.summary.avgApiSuccessRate},${compared.delta.avgApiSuccessRate}`,
      `avg_latency_p95_ms,${compared.baseline.summary.avgLatencyP95Ms},${compared.target.summary.avgLatencyP95Ms},${compared.delta.avgLatencyP95Ms}`
    ].join("\n");
    const filename = `stability-report-${sanitizeFileSegment(input.baselineReleaseId)}-to-${sanitizeFileSegment(input.targetReleaseId)}.csv`;

    appendAudit(this.store, "stability_report_exported", {
      userId: input.operatorUserId,
      metadata: {
        baselineReleaseId: input.baselineReleaseId,
        targetReleaseId: input.targetReleaseId,
        filename,
        comparedAt: compared.comparedAt
      }
    });

    return {
      filename,
      content,
      comparedAt: compared.comparedAt
    };
  }

  listStabilityAlerts(input?: {
    runId?: string;
    releaseId?: string;
    level?: StabilityAlertLevel;
    status?: StabilityAlertStatus;
    page?: number;
    pageSize?: number;
  }): {
    items: StabilityAlert[];
    total: number;
    page: number;
    pageSize: number;
    thresholds: StabilityAlertThresholds;
  } {
    const page = Math.max(1, input?.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, input?.pageSize ?? 20));
    const filtered = [...this.releaseRepository.stabilityAlertsById.values()]
      .filter((item) => (input?.runId ? item.runId === input.runId : true))
      .filter((item) => (input?.releaseId ? item.releaseId === input.releaseId : true))
      .filter((item) => (input?.level ? item.level === input.level : true))
      .filter((item) => (input?.status ? item.status === input.status : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
      thresholds: STABILITY_ALERT_THRESHOLDS
    };
  }

  handleStabilityAlert(input: {
    alertId: string;
    action: "acknowledge" | "resolve";
    note?: string;
    expectedVersion?: number;
    idempotencyKey?: string;
    operatorUserId: string;
  }): StabilityAlert {
    const alert = this.releaseRepository.stabilityAlertsById.get(input.alertId);
    if (!alert) {
      throw new ReleaseServiceError("STABILITY_ALERT_NOT_FOUND");
    }
    const fingerprint = stringifyJson({
      alertId: input.alertId,
      action: input.action,
      note: input.note?.trim() || undefined,
      expectedVersion: input.expectedVersion
    });
    if (input.idempotencyKey?.trim()) {
      const cached = this.resolveIdempotencyResult<StabilityAlert>({
        idempotencyKey: input.idempotencyKey.trim(),
        actionName: "stability_alert_handle",
        resourceId: input.alertId,
        fingerprint
      });
      if (cached) {
        return cached;
      }
    }
    if (typeof input.expectedVersion === "number" && alert.version !== input.expectedVersion) {
      throw new ReleaseServiceError("STABILITY_ALERT_VERSION_CONFLICT");
    }
    if (alert.status === "resolved") {
      throw new ReleaseServiceError("STABILITY_ALERT_ALREADY_RESOLVED");
    }

    const nextStatus: StabilityAlertStatus = input.action === "resolve" ? "resolved" : "acknowledged";
    alert.status = nextStatus;
    alert.handledAt = nowIso();
    alert.updatedAt = alert.handledAt;
    alert.version += 1;
    alert.handledByUserId = input.operatorUserId;
    alert.handlingAction = input.action;
    alert.handlingNote = input.note?.trim() || undefined;
    this.releaseRepository.stabilityAlertsById.set(alert.id, alert);

    appendAudit(this.store, "stability_alert_handled", {
      userId: input.operatorUserId,
      metadata: {
        alertId: alert.id,
        runId: alert.runId,
        releaseId: alert.releaseId,
        action: input.action,
        status: alert.status,
        note: alert.handlingNote
      }
    });

    if (input.idempotencyKey?.trim()) {
      this.persistIdempotencyResult({
        idempotencyKey: input.idempotencyKey.trim(),
        actionName: "stability_alert_handle",
        resourceId: input.alertId,
        fingerprint,
        response: alert
      });
    }
    return alert;
  }

  async handleStabilityAlertAsync(input: {
    alertId: string;
    action: "acknowledge" | "resolve";
    note?: string;
    expectedVersion?: number;
    idempotencyKey?: string;
    operatorUserId: string;
  }): Promise<StabilityAlert> {
    const result = this.handleStabilityAlert(input);
    await this.flushOrThrow("stability_alert_handle");
    return result;
  }

  upsertBetaWhitelist(input: {
    userId: string;
    releaseId: string;
    status?: BetaWhitelistStatus;
    note?: string;
    expectedVersion?: number;
    idempotencyKey?: string;
    operatorUserId: string;
  }): BetaWhitelistEntry {
    const releaseId = input.releaseId.trim();
    if (!releaseId) {
      throw new ReleaseServiceError("BETA_RELEASE_ID_REQUIRED");
    }
    const key = whitelistKey(input.userId, releaseId);
    const status = input.status ?? "active";
    const note = input.note?.trim() || undefined;
    const fingerprint = stringifyJson({
      userId: input.userId,
      releaseId,
      status,
      note,
      expectedVersion: input.expectedVersion,
      operatorUserId: input.operatorUserId
    });
    if (input.idempotencyKey?.trim()) {
      const cached = this.resolveIdempotencyResult<BetaWhitelistEntry>({
        idempotencyKey: input.idempotencyKey.trim(),
        actionName: "beta_whitelist_upsert",
        resourceId: key,
        fingerprint
      });
      if (cached) {
        return cached;
      }
    }

    const existingId = this.releaseRepository.betaWhitelistEntryIdByUserAndRelease.get(key);
    const now = nowIso();

    if (existingId) {
      const existing = this.releaseRepository.betaWhitelistEntriesById.get(existingId);
      if (!existing) {
        throw new ReleaseServiceError("BETA_WHITELIST_CORRUPTED");
      }
      if (typeof input.expectedVersion === "number" && existing.version !== input.expectedVersion) {
        throw new ReleaseServiceError("BETA_WHITELIST_VERSION_CONFLICT");
      }
      existing.status = status;
      existing.note = note;
      existing.updatedByUserId = input.operatorUserId;
      existing.updatedAt = now;
      existing.version += 1;
      this.releaseRepository.betaWhitelistEntriesById.set(existing.id, existing);
      appendAudit(this.store, "beta_whitelist_upserted", {
        userId: input.userId,
        metadata: {
          whitelistId: existing.id,
          releaseId: existing.releaseId,
          status: existing.status,
          operatorUserId: input.operatorUserId,
          action: "updated"
        }
      });

      if (input.idempotencyKey?.trim()) {
        this.persistIdempotencyResult({
          idempotencyKey: input.idempotencyKey.trim(),
          actionName: "beta_whitelist_upsert",
          resourceId: key,
          fingerprint,
          response: existing
        });
      }
      return existing;
    }

    if (typeof input.expectedVersion === "number" && input.expectedVersion !== 0) {
      throw new ReleaseServiceError("BETA_WHITELIST_VERSION_CONFLICT");
    }

    const entry: BetaWhitelistEntry = {
      id: randomUUID(),
      userId: input.userId,
      releaseId,
      version: 1,
      status,
      note,
      createdByUserId: input.operatorUserId,
      updatedByUserId: input.operatorUserId,
      createdAt: now,
      updatedAt: now
    };
    this.releaseRepository.betaWhitelistEntriesById.set(entry.id, entry);
    this.releaseRepository.betaWhitelistEntryIdByUserAndRelease.set(key, entry.id);

    appendAudit(this.store, "beta_whitelist_upserted", {
      userId: input.userId,
      metadata: {
        whitelistId: entry.id,
        releaseId: entry.releaseId,
        status: entry.status,
        operatorUserId: input.operatorUserId,
        action: "created"
      }
    });

    if (input.idempotencyKey?.trim()) {
      this.persistIdempotencyResult({
        idempotencyKey: input.idempotencyKey.trim(),
        actionName: "beta_whitelist_upsert",
        resourceId: key,
        fingerprint,
        response: entry
      });
    }

    return entry;
  }

  async upsertBetaWhitelistAsync(input: {
    userId: string;
    releaseId: string;
    status?: BetaWhitelistStatus;
    note?: string;
    expectedVersion?: number;
    idempotencyKey?: string;
    operatorUserId: string;
  }): Promise<BetaWhitelistEntry> {
    const result = this.upsertBetaWhitelist(input);
    await this.flushOrThrow("beta_whitelist_upsert");
    return result;
  }

  listBetaWhitelist(input?: {
    userId?: string;
    releaseId?: string;
    status?: BetaWhitelistStatus;
    page?: number;
    pageSize?: number;
  }): {
    items: BetaWhitelistEntry[];
    total: number;
    page: number;
    pageSize: number;
  } {
    const page = Math.max(1, input?.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, input?.pageSize ?? 20));

    const filtered = Array.from(this.releaseRepository.betaWhitelistEntriesById.values())
      .filter((item) => (input?.userId ? item.userId === input.userId : true))
      .filter((item) => (input?.releaseId ? item.releaseId === input.releaseId : true))
      .filter((item) => (input?.status ? item.status === input.status : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize
    };
  }

  submitBetaFeedback(input: {
    userId: string;
    title: string;
    description: string;
    category: BetaFeedbackCategory;
    severity: BetaFeedbackSeverity;
    appVersion?: string;
    idempotencyKey?: string;
  }): BetaFeedback {
    const title = input.title.trim();
    const description = input.description.trim();
    const appVersion = input.appVersion?.trim() || undefined;
    const fingerprint = stringifyJson({
      userId: input.userId,
      title,
      description,
      category: input.category,
      severity: input.severity,
      appVersion
    });
    if (input.idempotencyKey?.trim()) {
      const cached = this.resolveIdempotencyResult<BetaFeedback>({
        idempotencyKey: input.idempotencyKey.trim(),
        actionName: "beta_feedback_submit",
        resourceId: input.userId,
        fingerprint
      });
      if (cached) {
        return cached;
      }
    }

    const activeWhitelist = Array.from(this.releaseRepository.betaWhitelistEntriesById.values())
      .filter((item) => item.userId === input.userId && item.status === "active")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const scopedWhitelist = activeWhitelist[0];
    if (!scopedWhitelist) {
      throw new ReleaseServiceError("BETA_ACCESS_DENIED");
    }

    const now = nowIso();
    const feedback: BetaFeedback = {
      id: randomUUID(),
      userId: input.userId,
      releaseId: scopedWhitelist.releaseId,
      version: 1,
      appVersion,
      category: input.category,
      severity: input.severity,
      priority: toDefaultPriority(input.severity),
      status: "open",
      title,
      description,
      createdAt: now,
      updatedAt: now
    };
    this.releaseRepository.betaFeedbacksById.set(feedback.id, feedback);

    appendAudit(this.store, "beta_feedback_submitted", {
      userId: input.userId,
      metadata: {
        feedbackId: feedback.id,
        releaseId: feedback.releaseId,
        severity: feedback.severity,
        priority: feedback.priority
      }
    });

    if (input.idempotencyKey?.trim()) {
      this.persistIdempotencyResult({
        idempotencyKey: input.idempotencyKey.trim(),
        actionName: "beta_feedback_submit",
        resourceId: input.userId,
        fingerprint,
        response: feedback
      });
    }

    return feedback;
  }

  async submitBetaFeedbackAsync(input: {
    userId: string;
    title: string;
    description: string;
    category: BetaFeedbackCategory;
    severity: BetaFeedbackSeverity;
    appVersion?: string;
    idempotencyKey?: string;
  }): Promise<BetaFeedback> {
    const result = this.submitBetaFeedback(input);
    await this.flushOrThrow("beta_feedback_submit");
    return result;
  }

  listBetaFeedback(input?: {
    userId?: string;
    releaseId?: string;
    status?: BetaFeedbackStatus;
    priority?: BetaFeedbackPriority;
    page?: number;
    pageSize?: number;
    operatorUserId?: string;
  }): {
    items: BetaFeedback[];
    total: number;
    page: number;
    pageSize: number;
  } {
    const page = Math.max(1, input?.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, input?.pageSize ?? 20));
    const filtered = Array.from(this.releaseRepository.betaFeedbacksById.values())
      .filter((item) => (input?.userId ? item.userId === input.userId : true))
      .filter((item) => (input?.releaseId ? item.releaseId === input.releaseId : true))
      .filter((item) => (input?.status ? item.status === input.status : true))
      .filter((item) => (input?.priority ? item.priority === input.priority : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const start = (page - 1) * pageSize;

    appendAudit(this.store, "beta_feedback_queried", {
      metadata: {
        operatorUserId: input?.operatorUserId,
        releaseId: input?.releaseId,
        status: input?.status,
        priority: input?.priority,
        total: filtered.length
      }
    });

    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize
    };
  }

  getBetaFeedback(feedbackId: string): BetaFeedback {
    const feedback = this.releaseRepository.betaFeedbacksById.get(feedbackId);
    if (!feedback) {
      throw new ReleaseServiceError("BETA_FEEDBACK_NOT_FOUND");
    }
    return feedback;
  }

  escalateBetaFeedback(input: {
    feedbackId: string;
    priority: Extract<BetaFeedbackPriority, "high" | "critical">;
    reason: string;
    expectedVersion?: number;
    idempotencyKey?: string;
    operatorUserId: string;
  }): BetaFeedback {
    const reason = input.reason.trim();
    const fingerprint = stringifyJson({
      feedbackId: input.feedbackId,
      priority: input.priority,
      reason,
      expectedVersion: input.expectedVersion,
      operatorUserId: input.operatorUserId
    });
    if (input.idempotencyKey?.trim()) {
      const cached = this.resolveIdempotencyResult<BetaFeedback>({
        idempotencyKey: input.idempotencyKey.trim(),
        actionName: "beta_feedback_escalate",
        resourceId: input.feedbackId,
        fingerprint
      });
      if (cached) {
        return cached;
      }
    }

    const feedback = this.releaseRepository.betaFeedbacksById.get(input.feedbackId);
    if (!feedback) {
      throw new ReleaseServiceError("BETA_FEEDBACK_NOT_FOUND");
    }
    if (typeof input.expectedVersion === "number" && feedback.version !== input.expectedVersion) {
      throw new ReleaseServiceError("BETA_FEEDBACK_VERSION_CONFLICT");
    }
    const previousPriority = feedback.priority;
    feedback.priority = input.priority;
    feedback.status = feedback.status === "resolved" ? "resolved" : "triaged";
    feedback.escalatedAt = nowIso();
    feedback.escalatedByUserId = input.operatorUserId;
    feedback.escalationReason = reason;
    feedback.updatedAt = nowIso();
    feedback.version += 1;
    this.releaseRepository.betaFeedbacksById.set(feedback.id, feedback);

    appendAudit(this.store, "beta_feedback_priority_escalated", {
      userId: feedback.userId,
      metadata: {
        feedbackId: feedback.id,
        releaseId: feedback.releaseId,
        previousPriority,
        currentPriority: feedback.priority,
        operatorUserId: input.operatorUserId,
        reason
      }
    });

    if (input.idempotencyKey?.trim()) {
      this.persistIdempotencyResult({
        idempotencyKey: input.idempotencyKey.trim(),
        actionName: "beta_feedback_escalate",
        resourceId: input.feedbackId,
        fingerprint,
        response: feedback
      });
    }

    return feedback;
  }

  async escalateBetaFeedbackAsync(input: {
    feedbackId: string;
    priority: Extract<BetaFeedbackPriority, "high" | "critical">;
    reason: string;
    expectedVersion?: number;
    idempotencyKey?: string;
    operatorUserId: string;
  }): Promise<BetaFeedback> {
    const result = this.escalateBetaFeedback(input);
    await this.flushOrThrow("beta_feedback_escalate");
    return result;
  }

  getBetaCohortMetrics(input: {
    releaseId: string;
    operatorUserId?: string;
  }): BetaCohortMetrics {
    return this.buildBetaCohortExport(input).metrics;
  }

  getBetaCohortExport(input: {
    releaseId: string;
    operatorUserId?: string;
  }): BetaCohortExport {
    return this.buildBetaCohortExport(input);
  }

  exportBetaCohortCsv(input: {
    releaseId: string;
    operatorUserId?: string;
  }): BetaCohortExportFile {
    const report = this.buildBetaCohortExport(input);
    const filename = `beta-cohort-${sanitizeFileSegment(report.releaseId)}-${report.generatedAt.slice(0, 10)}.csv`;
    const content = [
      `release_id,${csvEscape(report.releaseId)}`,
      `generated_at,${csvEscape(report.generatedAt)}`,
      `invited_users,${report.metrics.invitedUsers}`,
      `disabled_users,${report.metrics.disabledUsers}`,
      `eligible_active_users,${report.metrics.eligibleActiveUsers}`,
      `internal_feedback_total,${report.metrics.internalFeedbackTotal}`,
      `unresolved_critical_feedback,${report.metrics.unresolvedCriticalFeedback}`,
      `unresolved_high_feedback_older_than_48h,${report.metrics.unresolvedHighFeedbackOlderThan48h}`,
      `invited_to_activation_users,${report.metrics.invitedToActivationUsers}`,
      `invited_to_activation_rate,${report.metrics.invitedToActivationRate}`,
      `d7_retained_users,${report.metrics.d7RetainedUsers}`,
      `d7_retention_rate,${report.metrics.d7RetentionRate}`,
      `week1_task_completed_users,${report.metrics.week1TaskCompletedUsers}`,
      `week1_task_completion_rate,${report.metrics.week1TaskCompletionRate}`,
      `first_mock_completed_users,${report.metrics.firstMockCompletedUsers}`,
      `first_mock_completion_rate,${report.metrics.firstMockCompletionRate}`,
      "",
      [
        "user_id",
        "whitelist_id",
        "whitelist_status",
        "cohort_started_at",
        "whitelist_updated_at",
        "onboarding_completed_at",
        "first_core_learning_event_at",
        "activation_qualified",
        "activation_qualified_at",
        "d7_retained",
        "d7_retained_at",
        "week1_core_learning_event_count",
        "week1_task_completion_qualified",
        "first_mock_completed_at",
        "first_mock_completion_qualified",
        "total_core_learning_event_count",
        "feedback_total",
        "unresolved_feedback_count",
        "highest_open_feedback_priority"
      ].join(","),
      ...report.users.map((item) =>
        [
          csvEscape(item.userId),
          csvEscape(item.whitelistId),
          csvEscape(item.whitelistStatus),
          csvEscape(item.cohortStartedAt),
          csvEscape(item.whitelistUpdatedAt),
          csvEscape(item.onboardingCompletedAt),
          csvEscape(item.firstCoreLearningEventAt),
          csvEscape(item.activationQualified),
          csvEscape(item.activationQualifiedAt),
          csvEscape(item.d7Retained),
          csvEscape(item.d7RetainedAt),
          csvEscape(item.week1CoreLearningEventCount),
          csvEscape(item.week1TaskCompletionQualified),
          csvEscape(item.firstMockCompletedAt),
          csvEscape(item.firstMockCompletionQualified),
          csvEscape(item.totalCoreLearningEventCount),
          csvEscape(item.feedbackTotal),
          csvEscape(item.unresolvedFeedbackCount),
          csvEscape(item.highestOpenFeedbackPriority)
        ].join(",")
      )
    ].join("\n");

    appendAudit(this.store, "beta_cohort_exported", {
      userId: input.operatorUserId,
      metadata: {
        releaseId: report.releaseId,
        filename,
        generatedAt: report.generatedAt,
        invitedUsers: report.metrics.invitedUsers
      }
    });

    return {
      filename,
      content,
      generatedAt: report.generatedAt
    };
  }

  getOperationalMetrics(): ReleaseOperationalMetrics {
    const actionMetrics: IdempotencyActionMetrics[] = [...this.idempotencyCountersByAction.entries()]
      .map(([actionName, item]) => ({
        actionName,
        attempts: item.attempts,
        replayHits: item.replayHits,
        conflictCount: item.conflictCount,
        replayRate: item.attempts === 0 ? 0 : round2((item.replayHits / item.attempts) * 100),
        conflictRate: item.attempts === 0 ? 0 : round2((item.conflictCount / item.attempts) * 100)
      }))
      .sort((a, b) => a.actionName.localeCompare(b.actionName));

    const totalAttempts = actionMetrics.reduce((acc, item) => acc + item.attempts, 0);
    const totalReplayHits = actionMetrics.reduce((acc, item) => acc + item.replayHits, 0);
    const totalConflictCount = actionMetrics.reduce((acc, item) => acc + item.conflictCount, 0);

    const samples = [...this.writeLatencySamples];
    const latencyValues = samples.map((item) => item.latencyMs).sort((a, b) => a - b);
    const avgLatencyMs =
      latencyValues.length === 0
        ? 0
        : round2(latencyValues.reduce((acc, value) => acc + value, 0) / latencyValues.length);
    const p95LatencyMs = this.resolvePercentile(latencyValues, 0.95);
    const maxLatencyMs = latencyValues.length === 0 ? 0 : round2(latencyValues[latencyValues.length - 1]);
    const failedWrites = samples.filter((item) => item.failed).length;
    const yellowCount = this.recentWriteLatencyAlerts.filter((item) => item.level === "yellow").length;
    const redCount = this.recentWriteLatencyAlerts.filter((item) => item.level === "red").length;
    const storageResilience = this.releaseRepository.getWriteResilienceState();
    const recentStorageResilienceAlerts = this.recentStorageResilienceAlerts.toArray();
    const recentStorageResilienceCount = this.recentStorageResilienceAlerts.size();

    return {
      idempotency: {
        totals: {
          attempts: totalAttempts,
          replayHits: totalReplayHits,
          conflictCount: totalConflictCount,
          replayRate: totalAttempts === 0 ? 0 : round2((totalReplayHits / totalAttempts) * 100),
          conflictRate: totalAttempts === 0 ? 0 : round2((totalConflictCount / totalAttempts) * 100)
        },
        actions: actionMetrics
      },
      writeLatency: {
        totalWrites: samples.length,
        failedWrites,
        avgLatencyMs,
        p95LatencyMs,
        maxLatencyMs,
        thresholdsMs: {
          yellow: this.writeLatencyThresholdsMs.yellow,
          red: this.writeLatencyThresholdsMs.red
        },
        alerts: {
          yellowCount,
          redCount,
          recent: [...this.recentWriteLatencyAlerts]
        },
        recentSamples: samples
      },
      storageResilience,
      storageResilienceAlerting: {
        circuitOpenThresholdMs: this.storageResilienceCircuitOpenThresholdMs,
        recentLimit: this.maxRecentStorageResilienceAlerts,
        recentCount: recentStorageResilienceCount,
        cappedCount: Math.max(0, this.storageResilienceAlertTotalCount - recentStorageResilienceCount),
        openedCount: this.storageResilienceOpenedCount,
        prolongedCount: this.storageResilienceProlongedCount,
        recoveredCount: this.storageResilienceRecoveredCount,
        recent: recentStorageResilienceAlerts
      }
    };
  }

  private evaluateStabilityAlerts(input: {
    run: StabilitySoakRun;
    checkpoint: StabilityCheckpoint;
    operatorUserId: string;
  }): StabilityAlert[] {
    this.clearStabilityAlertsByCheckpointId(input.checkpoint.id);

    const alerts: StabilityAlert[] = [];
    const crashRatePer1k = toCrashRatePer1k(input.checkpoint.crashCount, input.checkpoint.activeSessions);
    const crashLevel = this.resolveHighRiskLevel(crashRatePer1k, STABILITY_ALERT_THRESHOLDS.crashRatePer1k);
    if (crashLevel) {
      alerts.push(
        this.createStabilityAlert({
          run: input.run,
          checkpoint: input.checkpoint,
          type: "crash_rate_per_1k",
          level: crashLevel,
          threshold: crashLevel === "red" ? STABILITY_ALERT_THRESHOLDS.crashRatePer1k.red : STABILITY_ALERT_THRESHOLDS.crashRatePer1k.yellow,
          actual: crashRatePer1k,
          reason: `crash_rate_per_1k=${crashRatePer1k} exceeds ${crashLevel} threshold`,
          operatorUserId: input.operatorUserId
        })
      );
    }

    const successLevel = this.resolveLowRiskLevel(input.checkpoint.apiSuccessRate, STABILITY_ALERT_THRESHOLDS.apiSuccessRate);
    if (successLevel) {
      alerts.push(
        this.createStabilityAlert({
          run: input.run,
          checkpoint: input.checkpoint,
          type: "api_success_rate",
          level: successLevel,
          threshold: successLevel === "red" ? STABILITY_ALERT_THRESHOLDS.apiSuccessRate.red : STABILITY_ALERT_THRESHOLDS.apiSuccessRate.yellow,
          actual: input.checkpoint.apiSuccessRate,
          reason: `api_success_rate=${input.checkpoint.apiSuccessRate} falls below ${successLevel} threshold`,
          operatorUserId: input.operatorUserId
        })
      );
    }

    const latencyLevel = this.resolveHighRiskLevel(input.checkpoint.latencyP95Ms, STABILITY_ALERT_THRESHOLDS.latencyP95Ms);
    if (latencyLevel) {
      alerts.push(
        this.createStabilityAlert({
          run: input.run,
          checkpoint: input.checkpoint,
          type: "latency_p95_ms",
          level: latencyLevel,
          threshold: latencyLevel === "red" ? STABILITY_ALERT_THRESHOLDS.latencyP95Ms.red : STABILITY_ALERT_THRESHOLDS.latencyP95Ms.yellow,
          actual: input.checkpoint.latencyP95Ms,
          reason: `latency_p95_ms=${input.checkpoint.latencyP95Ms} exceeds ${latencyLevel} threshold`,
          operatorUserId: input.operatorUserId
        })
      );
    }

    return alerts;
  }

  private clearStabilityAlertsByCheckpointId(checkpointId: string): void {
    for (const [alertId, alert] of this.releaseRepository.stabilityAlertsById.entries()) {
      if (alert.checkpointId === checkpointId) {
        this.releaseRepository.stabilityAlertsById.delete(alertId);
      }
    }
  }

  private createStabilityAlert(input: {
    run: StabilitySoakRun;
    checkpoint: StabilityCheckpoint;
    type: StabilityAlertType;
    level: StabilityAlertLevel;
    threshold: number;
    actual: number;
    reason: string;
    operatorUserId: string;
  }): StabilityAlert {
    const now = nowIso();
    const alert: StabilityAlert = {
      id: randomUUID(),
      runId: input.run.id,
      releaseId: input.run.releaseId,
      checkpointId: input.checkpoint.id,
      version: 1,
      atHour: input.checkpoint.atHour,
      type: input.type,
      level: input.level,
      status: "open",
      threshold: round2(input.threshold),
      actual: round2(input.actual),
      reason: input.reason,
      triggeredAt: now,
      updatedAt: now
    };
    this.releaseRepository.stabilityAlertsById.set(alert.id, alert);

    appendAudit(this.store, "stability_alert_triggered", {
      userId: input.operatorUserId,
      metadata: {
        alertId: alert.id,
        runId: alert.runId,
        releaseId: alert.releaseId,
        checkpointId: alert.checkpointId,
        type: alert.type,
        level: alert.level,
        threshold: alert.threshold,
        actual: alert.actual
      }
    });

    return alert;
  }

  private resolveHighRiskLevel(
    actual: number,
    thresholds: {
      yellow: number;
      red: number;
    }
  ): StabilityAlertLevel | undefined {
    if (actual >= thresholds.red) {
      return "red";
    }
    if (actual >= thresholds.yellow) {
      return "yellow";
    }
    return undefined;
  }

  private resolveLowRiskLevel(
    actual: number,
    thresholds: {
      yellow: number;
      red: number;
    }
  ): StabilityAlertLevel | undefined {
    if (actual <= thresholds.red) {
      return "red";
    }
    if (actual <= thresholds.yellow) {
      return "yellow";
    }
    return undefined;
  }

  private buildStabilityReport(run: StabilitySoakRun): StabilityReport {
    const checkpoints = [...(this.releaseRepository.stabilityCheckpointsByRunId.get(run.id) ?? [])].sort(
      (a, b) => a.atHour - b.atHour
    );
    if (checkpoints.length === 0) {
      throw new ReleaseServiceError("STABILITY_REPORT_NOT_READY");
    }

    const trend: StabilityTrendPoint[] = checkpoints.map((item) => ({
      checkpointId: item.id,
      atHour: item.atHour,
      crashCount: item.crashCount,
      activeSessions: item.activeSessions,
      crashRatePer1k: toCrashRatePer1k(item.crashCount, item.activeSessions),
      apiSuccessRate: item.apiSuccessRate,
      latencyP95Ms: item.latencyP95Ms,
      recordedAt: item.createdAt
    }));
    const totalCrashes = checkpoints.reduce((acc, item) => acc + item.crashCount, 0);
    const avgCrashRatePer1k = round2(
      trend.reduce((acc, item) => acc + item.crashRatePer1k, 0) / checkpoints.length
    );
    const minApiSuccessRate = Math.min(...checkpoints.map((item) => item.apiSuccessRate));
    const avgApiSuccessRate = round2(checkpoints.reduce((acc, item) => acc + item.apiSuccessRate, 0) / checkpoints.length);
    const maxLatencyP95Ms = Math.max(...checkpoints.map((item) => item.latencyP95Ms));
    const avgLatencyP95Ms = round2(checkpoints.reduce((acc, item) => acc + item.latencyP95Ms, 0) / checkpoints.length);
    const summary: StabilityReportSummary = {
      checkpointCount: checkpoints.length,
      collectedDurationHours: checkpoints[checkpoints.length - 1].atHour,
      lastCheckpointAt: checkpoints[checkpoints.length - 1].createdAt,
      totalCrashes,
      maxCrashCount: Math.max(...checkpoints.map((item) => item.crashCount)),
      avgCrashRatePer1k,
      minApiSuccessRate,
      avgApiSuccessRate,
      maxLatencyP95Ms,
      avgLatencyP95Ms
    };
    return {
      run,
      summary,
      trend,
      generatedAt: nowIso()
    };
  }

  private findLatestStabilityRunByReleaseId(releaseId: string): StabilitySoakRun | undefined {
    return [...this.releaseRepository.stabilitySoakRunsById.values()]
      .filter((item) => item.releaseId === releaseId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  }

  private resolveStabilityConclusion(delta: {
    totalCrashes: number;
    avgCrashRatePer1k: number;
    avgApiSuccessRate: number;
    avgLatencyP95Ms: number;
  }): "improved" | "regressed" | "no_change" {
    const improvements = [
      delta.totalCrashes < 0,
      delta.avgCrashRatePer1k < 0,
      delta.avgApiSuccessRate > 0,
      delta.avgLatencyP95Ms < 0
    ].filter(Boolean).length;
    const regressions = [
      delta.totalCrashes > 0,
      delta.avgCrashRatePer1k > 0,
      delta.avgApiSuccessRate < 0,
      delta.avgLatencyP95Ms > 0
    ].filter(Boolean).length;
    if (improvements === 0 && regressions === 0) {
      return "no_change";
    }
    return improvements >= regressions ? "improved" : "regressed";
  }

  private resolveIdempotencyResult<T>(input: {
    idempotencyKey: string;
    actionName: string;
    resourceId: string;
    fingerprint: string;
  }): T | undefined {
    this.trackIdempotencyAttempt(input.actionName);
    const record = this.releaseRepository.systemActionIdempotencyByKey.get(input.idempotencyKey);
    if (!record) {
      return undefined;
    }
    if (
      record.actionName !== input.actionName ||
      record.resourceId !== input.resourceId ||
      record.fingerprint !== input.fingerprint
    ) {
      this.trackIdempotencyConflict(input.actionName);
      throw new ReleaseServiceError("IDEMPOTENCY_KEY_CONFLICT");
    }
    this.trackIdempotencyReplay(input.actionName);
    return JSON.parse(record.responseJson) as T;
  }

  private persistIdempotencyResult(input: {
    idempotencyKey: string;
    actionName: string;
    resourceId: string;
    fingerprint: string;
    response: unknown;
  }): void {
    const now = nowIso();
    const existing = this.releaseRepository.systemActionIdempotencyByKey.get(input.idempotencyKey);
    const record: SystemActionIdempotencyRecord = {
      idempotencyKey: input.idempotencyKey,
      actionName: input.actionName,
      resourceId: input.resourceId,
      fingerprint: input.fingerprint,
      responseJson: stringifyJson(input.response),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.releaseRepository.systemActionIdempotencyByKey.set(record.idempotencyKey, record);
  }

  private trackIdempotencyAttempt(actionName: string): void {
    const current = this.idempotencyCountersByAction.get(actionName) ?? {
      attempts: 0,
      replayHits: 0,
      conflictCount: 0
    };
    current.attempts += 1;
    this.idempotencyCountersByAction.set(actionName, current);
  }

  private trackIdempotencyReplay(actionName: string): void {
    const current = this.idempotencyCountersByAction.get(actionName) ?? {
      attempts: 0,
      replayHits: 0,
      conflictCount: 0
    };
    current.replayHits += 1;
    this.idempotencyCountersByAction.set(actionName, current);
  }

  private trackIdempotencyConflict(actionName: string): void {
    const current = this.idempotencyCountersByAction.get(actionName) ?? {
      attempts: 0,
      replayHits: 0,
      conflictCount: 0
    };
    current.conflictCount += 1;
    this.idempotencyCountersByAction.set(actionName, current);
  }

  private recordWriteLatency(input: {
    operation: string;
    latencyMs: number;
    failed: boolean;
  }): void {
    const now = nowIso();
    const sample: ReleaseWriteLatencySample = {
      operation: input.operation,
      latencyMs: round2(input.latencyMs),
      failed: input.failed,
      recordedAt: now
    };
    this.writeLatencySamples.push(sample);
    if (this.writeLatencySamples.length > this.maxRecentWriteLatencySamples) {
      this.writeLatencySamples.splice(0, this.writeLatencySamples.length - this.maxRecentWriteLatencySamples);
    }

    let level: "yellow" | "red" | undefined;
    let thresholdMs: number = this.writeLatencyThresholdsMs.yellow;
    if (sample.latencyMs >= this.writeLatencyThresholdsMs.red) {
      level = "red";
      thresholdMs = this.writeLatencyThresholdsMs.red;
    } else if (sample.latencyMs >= this.writeLatencyThresholdsMs.yellow) {
      level = "yellow";
    }

    if (!level) {
      return;
    }

    const alert: ReleaseWriteLatencyAlert = {
      operation: sample.operation,
      latencyMs: sample.latencyMs,
      level,
      failed: sample.failed,
      thresholdMs,
      recordedAt: now
    };
    this.recentWriteLatencyAlerts.push(alert);
    if (this.recentWriteLatencyAlerts.length > this.maxRecentWriteLatencyAlerts) {
      this.recentWriteLatencyAlerts.splice(0, this.recentWriteLatencyAlerts.length - this.maxRecentWriteLatencyAlerts);
    }

    appendAudit(this.store, "release_write_latency_alerted", {
      metadata: {
        operation: alert.operation,
        latency_ms: alert.latencyMs,
        level: alert.level,
        threshold_ms: alert.thresholdMs,
        failed: alert.failed
      }
    });
  }

  private observeStorageResilience(input: {
    operation: string;
    writeFailed: boolean;
  }): void {
    const state = this.releaseRepository.getWriteResilienceState();
    const nowMs = Date.now();

    if (state.circuitOpen) {
      if (!this.storageResilienceLastCircuitOpen) {
        this.storageResilienceOpenedAtMs = nowMs;
        this.storageResilienceLastProlongedAlertAtMs = null;
        this.pushStorageResilienceAlert({
          event: "circuit_opened",
          state,
          operation: input.operation,
          writeFailed: input.writeFailed
        });
      }
      const openedAt = this.storageResilienceOpenedAtMs ?? nowMs;
      const openDurationMs = Math.max(0, nowMs - openedAt);
      const shouldAlertProlonged =
        openDurationMs >= this.storageResilienceCircuitOpenThresholdMs &&
        (this.storageResilienceLastProlongedAlertAtMs === null ||
          nowMs - this.storageResilienceLastProlongedAlertAtMs >= this.storageResilienceCircuitOpenThresholdMs);
      if (shouldAlertProlonged) {
        this.storageResilienceLastProlongedAlertAtMs = nowMs;
        this.pushStorageResilienceAlert({
          event: "circuit_prolonged",
          state,
          operation: input.operation,
          writeFailed: input.writeFailed,
          durationMs: openDurationMs
        });
      }
    } else if (this.storageResilienceLastCircuitOpen) {
      const openDurationMs = this.storageResilienceOpenedAtMs ? Math.max(0, nowMs - this.storageResilienceOpenedAtMs) : 0;
      this.pushStorageResilienceAlert({
        event: "circuit_recovered",
        state,
        operation: input.operation,
        writeFailed: input.writeFailed,
        durationMs: openDurationMs
      });
      this.storageResilienceOpenedAtMs = null;
      this.storageResilienceLastProlongedAlertAtMs = null;
    }

    this.storageResilienceLastCircuitOpen = state.circuitOpen;
  }

  private pushStorageResilienceAlert(input: {
    event: StorageResilienceAlertEvent;
    state: ReleaseRepositoryWriteResilienceState;
    operation: string;
    writeFailed: boolean;
    durationMs?: number;
  }): void {
    const recordedAt = nowIso();
    const alert: StorageResilienceAlert = {
      event: input.event,
      backend: input.state.backend,
      operation: input.operation,
      writeFailed: input.writeFailed,
      consecutiveWriteFailures: input.state.consecutiveWriteFailures,
      durationMs: input.durationMs !== undefined ? round2(input.durationMs) : undefined,
      lastError: input.state.lastError ?? undefined,
      recordedAt
    };
    this.storageResilienceAlertTotalCount += 1;
    this.recentStorageResilienceAlerts.push(alert);

    if (input.event === "circuit_opened") {
      this.storageResilienceOpenedCount += 1;
      appendAudit(this.store, "release_write_circuit_opened", {
        metadata: {
          backend: alert.backend,
          operation: alert.operation,
          write_failed: alert.writeFailed,
          consecutive_write_failures: alert.consecutiveWriteFailures,
          last_error: alert.lastError
        }
      });
      return;
    }

    if (input.event === "circuit_prolonged") {
      this.storageResilienceProlongedCount += 1;
      appendAudit(this.store, "release_write_circuit_prolonged", {
        metadata: {
          backend: alert.backend,
          operation: alert.operation,
          write_failed: alert.writeFailed,
          duration_ms: alert.durationMs,
          threshold_ms: this.storageResilienceCircuitOpenThresholdMs,
          consecutive_write_failures: alert.consecutiveWriteFailures,
          last_error: alert.lastError
        }
      });
      return;
    }

    this.storageResilienceRecoveredCount += 1;
    appendAudit(this.store, "release_write_circuit_recovered", {
      metadata: {
        backend: alert.backend,
        operation: alert.operation,
        write_failed: alert.writeFailed,
        duration_ms: alert.durationMs,
        consecutive_write_failures: alert.consecutiveWriteFailures
      }
    });
  }

  private buildBetaCohortExport(input: {
    releaseId: string;
    operatorUserId?: string;
  }): BetaCohortExport {
    const releaseId = input.releaseId.trim();
    if (!releaseId) {
      throw new ReleaseServiceError("BETA_RELEASE_ID_REQUIRED");
    }

    const generatedAt = nowIso();
    const generatedAtMs = parseIsoToMs(generatedAt);
    const whitelistEntries = Array.from(this.releaseRepository.betaWhitelistEntriesById.values())
      .filter((item) => item.releaseId === releaseId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.userId.localeCompare(b.userId));
    const feedbacks = Array.from(this.releaseRepository.betaFeedbacksById.values())
      .filter((item) => item.releaseId === releaseId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

    const cohortUserIds = new Set(whitelistEntries.map((item) => item.userId));
    const feedbacksByUser = new Map<string, BetaFeedback[]>();
    for (const feedback of feedbacks) {
      const scoped = feedbacksByUser.get(feedback.userId) ?? [];
      scoped.push(feedback);
      feedbacksByUser.set(feedback.userId, scoped);
    }

    const analyticsEventsByUser = new Map<string, BetaCohortTimedAnalyticsEvent[]>();
    for (const event of this.store.analyticsEvents) {
      if (!event.userId || !cohortUserIds.has(event.userId)) {
        continue;
      }
      const scoped = analyticsEventsByUser.get(event.userId) ?? [];
      scoped.push({
        ...event,
        timestampMs: parseIsoToMs(event.createdAt)
      });
      analyticsEventsByUser.set(event.userId, scoped);
    }
    for (const scopedEvents of analyticsEventsByUser.values()) {
      scopedEvents.sort((a, b) => a.timestampMs - b.timestampMs || a.id.localeCompare(b.id));
    }

    const users = whitelistEntries.map((entry) =>
      this.buildBetaCohortUserExportRow({
        entry,
        events: analyticsEventsByUser.get(entry.userId) ?? [],
        feedbacks: feedbacksByUser.get(entry.userId) ?? []
      })
    );
    const activeUsers = users.filter((item) => item.whitelistStatus === "active");
    const invitedToActivationUsers = activeUsers.filter((item) => item.activationQualified).length;
    const d7RetainedUsers = activeUsers.filter((item) => item.d7Retained).length;
    const week1TaskCompletedUsers = activeUsers.filter((item) => item.week1TaskCompletionQualified).length;
    const firstMockCompletedUsers = activeUsers.filter((item) => item.firstMockCompletionQualified).length;
    const unresolvedCriticalFeedback = feedbacks.filter(
      (item) => item.priority === "critical" && item.status !== "resolved"
    ).length;
    const unresolvedHighFeedbackOlderThan48h = feedbacks.filter(
      (item) =>
        item.priority === "high" &&
        item.status !== "resolved" &&
        parseIsoToMs(item.createdAt) <= generatedAtMs - HIGH_FEEDBACK_SLA_MS
    ).length;

    const metrics: BetaCohortMetrics = {
      releaseId,
      generatedAt,
      invitedUsers: activeUsers.length,
      disabledUsers: users.filter((item) => item.whitelistStatus === "disabled").length,
      eligibleActiveUsers: activeUsers.length,
      internalFeedbackTotal: feedbacks.length,
      unresolvedCriticalFeedback,
      unresolvedHighFeedbackOlderThan48h,
      invitedToActivationUsers,
      invitedToActivationRate: resolveRate(invitedToActivationUsers, activeUsers.length),
      d7RetainedUsers,
      d7RetentionRate: resolveRate(d7RetainedUsers, activeUsers.length),
      week1TaskCompletedUsers,
      week1TaskCompletionRate: resolveRate(week1TaskCompletedUsers, activeUsers.length),
      firstMockCompletedUsers,
      firstMockCompletionRate: resolveRate(firstMockCompletedUsers, activeUsers.length)
    };

    appendAudit(this.store, "beta_cohort_metrics_generated", {
      userId: input.operatorUserId,
      metadata: {
        releaseId,
        invitedUsers: metrics.invitedUsers,
        disabledUsers: metrics.disabledUsers,
        internalFeedbackTotal: metrics.internalFeedbackTotal,
        generatedAt
      }
    });

    return {
      releaseId,
      generatedAt,
      metrics,
      users
    };
  }

  private buildBetaCohortUserExportRow(input: {
    entry: BetaWhitelistEntry;
    events: BetaCohortTimedAnalyticsEvent[];
    feedbacks: BetaFeedback[];
  }): BetaCohortUserExportRow {
    const cohortStartedAt = input.entry.createdAt;
    const cohortStartMs = parseIsoToMs(cohortStartedAt);
    const eventsAfterCohortStart = input.events.filter((item) => item.timestampMs >= cohortStartMs);
    const onboardingCompletedAt = eventsAfterCohortStart.find((item) => item.eventType === "onboarding_submitted");
    const onboardingWithin72h = eventsAfterCohortStart.find(
      (item) =>
        item.eventType === "onboarding_submitted" &&
        isEventTypeInWindow(item.timestampMs, cohortStartMs, cohortStartMs + ACTIVATION_WINDOW_MS)
    );
    const coreLearningEvents = eventsAfterCohortStart.filter((item) => CORE_BETA_LEARNING_EVENT_TYPES.has(item.eventType));
    const firstCoreLearningEventAt = coreLearningEvents[0];
    const coreLearningWithin72h = coreLearningEvents.find((item) =>
      isEventTypeInWindow(item.timestampMs, cohortStartMs, cohortStartMs + ACTIVATION_WINDOW_MS)
    );
    const activationQualified = Boolean(onboardingWithin72h && coreLearningWithin72h);
    const activationQualifiedAt =
      activationQualified && onboardingWithin72h && coreLearningWithin72h
        ? new Date(Math.max(onboardingWithin72h.timestampMs, coreLearningWithin72h.timestampMs)).toISOString()
        : undefined;
    const d7RetainedAt = coreLearningEvents.find((item) =>
      isEventTypeInWindow(item.timestampMs, cohortStartMs + D7_WINDOW_START_MS, cohortStartMs + D7_WINDOW_END_MS)
    );
    const week1CoreLearningEventCount = coreLearningEvents.filter((item) =>
      isEventTypeInWindow(item.timestampMs, cohortStartMs, cohortStartMs + WEEK1_WINDOW_MS)
    ).length;
    const firstMockCompletedAt = eventsAfterCohortStart.find(
      (item) =>
        item.eventType === "mock_exam_submitted" &&
        isEventTypeInWindow(item.timestampMs, cohortStartMs, cohortStartMs + FIRST_MOCK_WINDOW_MS)
    );
    const unresolvedFeedback = input.feedbacks.filter((item) => item.status !== "resolved");
    const highestOpenFeedbackPriority = unresolvedFeedback.reduce<BetaCohortPriorityRank>((current, item) => {
      if (current === "none") {
        return item.priority;
      }
      return FEEDBACK_PRIORITY_WEIGHT[item.priority] > FEEDBACK_PRIORITY_WEIGHT[current] ? item.priority : current;
    }, "none");

    return {
      whitelistId: input.entry.id,
      userId: input.entry.userId,
      releaseId: input.entry.releaseId,
      whitelistStatus: input.entry.status,
      cohortStartedAt,
      whitelistUpdatedAt: input.entry.updatedAt,
      onboardingCompletedAt: onboardingCompletedAt?.createdAt,
      firstCoreLearningEventAt: firstCoreLearningEventAt?.createdAt,
      activationQualified,
      activationQualifiedAt,
      d7Retained: Boolean(d7RetainedAt),
      d7RetainedAt: d7RetainedAt?.createdAt,
      week1CoreLearningEventCount,
      week1TaskCompletionQualified: week1CoreLearningEventCount >= 3,
      firstMockCompletedAt: firstMockCompletedAt?.createdAt,
      firstMockCompletionQualified: Boolean(firstMockCompletedAt),
      totalCoreLearningEventCount: coreLearningEvents.length,
      feedbackTotal: input.feedbacks.length,
      unresolvedFeedbackCount: unresolvedFeedback.length,
      highestOpenFeedbackPriority
    };
  }

  private resolvePercentile(sortedValues: number[], ratio: number): number {
    if (sortedValues.length === 0) {
      return 0;
    }
    const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * ratio) - 1));
    return round2(sortedValues[index]);
  }

  private requireStabilitySoakRun(runId: string): StabilitySoakRun {
    const run = this.releaseRepository.stabilitySoakRunsById.get(runId);
    if (!run) {
      throw new ReleaseServiceError("STABILITY_SOAK_RUN_NOT_FOUND");
    }
    return run;
  }

  private requireCanary(canaryId: string): CanaryRelease {
    const canary = this.releaseRepository.canaryReleasesById.get(canaryId);
    if (!canary) {
      throw new ReleaseServiceError("CANARY_NOT_FOUND");
    }
    return canary;
  }
}
