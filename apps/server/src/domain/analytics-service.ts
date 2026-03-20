import { createHash, randomUUID } from "node:crypto";
import { appendAudit } from "./audit.js";
import type { AnalyticsRepository } from "./analytics-repository.js";
import { nowIso } from "./time.js";
import { InMemoryStore } from "./store.js";
import type { AbExperiment, AbExperimentStatus, AnalyticsEvent, AnalyticsPlatform, SkillType } from "./types.js";

const CORE_EVENT_TYPES = [
  "onboarding_submitted",
  "diagnostic_completed",
  "practice_submitted",
  "speaking_turn_scored",
  "writing_evaluated",
  "mock_exam_submitted",
  "subscription_upgraded",
  "admin_adjustment"
];

const HOLDOUT_VARIANT_KEY = "__holdout__";

const isPlatform = (value: string): value is AnalyticsPlatform =>
  ["windows", "macos", "ios", "android", "web"].includes(value);

const isSkill = (value: string): value is SkillType =>
  ["listening", "speaking", "reading", "writing"].includes(value);

const normalizeExperimentKey = (value: string): string => value.trim().toLowerCase();

const hashToInt = (value: string): number => {
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 8);
  return Number.parseInt(digest, 16);
};

const round2 = (value: number): number => Number(value.toFixed(2));

export class AnalyticsService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly analyticsRepository: AnalyticsRepository
  ) {}

  ingestBatch(input: {
    userId?: string;
    events: Array<{
      platform: string;
      event_type: string;
      skill?: string;
      trace_id?: string;
      provider_name?: string;
      success?: boolean;
      fallback_triggered?: boolean;
      latency_ms?: number;
      metadata?: Record<string, unknown>;
      created_at?: string;
    }>;
  }): {
    acceptedCount: number;
    rejectedCount: number;
    coveragePercent: number;
    fieldCompletenessPercent: number;
  } {
    let accepted = 0;
    let rejected = 0;

    for (const raw of input.events) {
      const platform = raw.platform?.trim().toLowerCase();
      if (!platform || !isPlatform(platform) || !raw.event_type?.trim()) {
        rejected += 1;
        continue;
      }
      if (raw.skill && !isSkill(raw.skill)) {
        rejected += 1;
        continue;
      }

      const createdAt = raw.created_at && !Number.isNaN(new Date(raw.created_at).getTime()) ? raw.created_at : nowIso();
      const event: AnalyticsEvent = {
        id: randomUUID(),
        userId: input.userId,
        platform,
        skill: raw.skill as SkillType | undefined,
        eventType: raw.event_type.trim(),
        traceId: raw.trace_id?.trim() || randomUUID().replaceAll("-", ""),
        providerName: raw.provider_name?.trim(),
        success: raw.success,
        fallbackTriggered: raw.fallback_triggered,
        latencyMs: typeof raw.latency_ms === "number" ? Math.max(0, Math.trunc(raw.latency_ms)) : undefined,
        metadata: raw.metadata ?? {},
        createdAt
      };

      this.analyticsRepository.append(event);
      this.collectAbMetrics(input.userId, event);
      accepted += 1;
    }

    if (this.store.analyticsEvents.length > 10000) {
      this.analyticsRepository.deleteOldest(this.store.analyticsEvents.length - 10000);
    }

    const summary = this.getSummary();
    appendAudit(this.store, "analytics_events_ingested", {
      userId: input.userId,
      metadata: {
        acceptedCount: accepted,
        rejectedCount: rejected,
        coveragePercent: summary.coreCoveragePercent,
        fieldCompletenessPercent: summary.fieldCompletenessPercent
      }
    });

    return {
      acceptedCount: accepted,
      rejectedCount: rejected,
      coveragePercent: summary.coreCoveragePercent,
      fieldCompletenessPercent: summary.fieldCompletenessPercent
    };
  }

  getSummary(filter?: {
    platform?: AnalyticsPlatform;
    skill?: SkillType;
  }): {
    totalEvents: number;
    coreCoveragePercent: number;
    fieldCompletenessPercent: number;
    byPlatform: Record<string, number>;
    bySkill: Record<string, number>;
    recentEvents: AnalyticsEvent[];
  } {
    const filtered = this.store.analyticsEvents.filter((item) => (filter?.platform ? item.platform === filter.platform : true)).filter(
      (item) => (filter?.skill ? item.skill === filter.skill : true)
    );

    const byPlatform: Record<string, number> = {};
    const bySkill: Record<string, number> = {};
    const covered = new Set<string>();
    let completeCount = 0;

    for (const event of filtered) {
      byPlatform[event.platform] = (byPlatform[event.platform] ?? 0) + 1;
      if (event.skill) {
        bySkill[event.skill] = (bySkill[event.skill] ?? 0) + 1;
      }
      if (CORE_EVENT_TYPES.includes(event.eventType)) {
        covered.add(event.eventType);
      }

      const isComplete =
        event.platform.length > 0 &&
        event.eventType.length > 0 &&
        event.traceId.length > 0 &&
        event.createdAt.length > 0 &&
        (event.skill === undefined || event.skill.length > 0);
      if (isComplete) {
        completeCount += 1;
      }
    }

    const total = filtered.length;
    const coreCoveragePercent =
      CORE_EVENT_TYPES.length === 0 ? 100 : Number(((covered.size / CORE_EVENT_TYPES.length) * 100).toFixed(1));
    const fieldCompletenessPercent = total === 0 ? 0 : Number(((completeCount / total) * 100).toFixed(1));

    return {
      totalEvents: total,
      coreCoveragePercent,
      fieldCompletenessPercent,
      byPlatform,
      bySkill,
      recentEvents: [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20)
    };
  }

  upsertExperiment(input: {
    key: string;
    name: string;
    description?: string;
    status: AbExperimentStatus;
    trafficPercent: number;
    variants: Array<{
      key: string;
      label: string;
      weight: number;
    }>;
    metricEventType: string;
    stopCondition: {
      minSampleSize: number;
      targetLiftPercent: number;
      maxDurationDays: number;
    };
  }): AbExperiment {
    if (!input.key.trim() || !input.name.trim() || !input.metricEventType.trim()) {
      throw new Error("AB_EXPERIMENT_INVALID");
    }
    if (input.trafficPercent < 0 || input.trafficPercent > 100) {
      throw new Error("AB_EXPERIMENT_INVALID");
    }
    if (input.variants.length < 2) {
      throw new Error("AB_EXPERIMENT_INVALID");
    }
    if (input.stopCondition.minSampleSize <= 0 || input.stopCondition.maxDurationDays <= 0) {
      throw new Error("AB_EXPERIMENT_INVALID");
    }

    const variantKeys = new Set<string>();
    let totalWeight = 0;
    for (const variant of input.variants) {
      const key = variant.key.trim();
      if (!key || variantKeys.has(key) || variant.weight <= 0 || !variant.label.trim()) {
        throw new Error("AB_EXPERIMENT_INVALID");
      }
      variantKeys.add(key);
      totalWeight += variant.weight;
    }
    if (totalWeight <= 0) {
      throw new Error("AB_EXPERIMENT_INVALID");
    }

    const key = normalizeExperimentKey(input.key);
    const existing = this.store.abExperimentsByKey.get(key);
    const now = nowIso();

    const experiment: AbExperiment = {
      key,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      status: input.status,
      trafficPercent: input.trafficPercent,
      variants: input.variants.map((variant) => ({
        key: variant.key.trim(),
        label: variant.label.trim(),
        weight: round2(variant.weight)
      })),
      metricEventType: input.metricEventType.trim(),
      stopCondition: {
        minSampleSize: Math.trunc(input.stopCondition.minSampleSize),
        targetLiftPercent: round2(input.stopCondition.targetLiftPercent),
        maxDurationDays: Math.trunc(input.stopCondition.maxDurationDays)
      },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      startedAt: existing?.startedAt,
      stoppedAt: existing?.stoppedAt,
      stopReason: existing?.stopReason
    };

    if (experiment.status === "running" && !experiment.startedAt) {
      experiment.startedAt = now;
      experiment.stoppedAt = undefined;
      experiment.stopReason = undefined;
    }

    if (experiment.status === "stopped") {
      experiment.stoppedAt = existing?.stoppedAt ?? now;
      experiment.stopReason = experiment.stopReason ?? "manually_stopped";
    }

    this.store.abExperimentsByKey.set(key, experiment);

    appendAudit(this.store, "ab_experiment_upserted", {
      metadata: {
        experimentKey: experiment.key,
        status: experiment.status,
        trafficPercent: experiment.trafficPercent,
        metricEventType: experiment.metricEventType
      }
    });

    return experiment;
  }

  stopExperiment(input: {
    key: string;
    reason?: string;
  }): AbExperiment {
    const key = normalizeExperimentKey(input.key);
    const existing = this.store.abExperimentsByKey.get(key);
    if (!existing) {
      throw new Error("AB_EXPERIMENT_NOT_FOUND");
    }
    if (existing.status === "stopped") {
      return existing;
    }

    existing.status = "stopped";
    existing.stoppedAt = nowIso();
    existing.stopReason = input.reason?.trim() || "manually_stopped";
    existing.updatedAt = nowIso();

    appendAudit(this.store, "ab_experiment_stopped", {
      metadata: {
        experimentKey: existing.key,
        reason: existing.stopReason
      }
    });

    return existing;
  }

  assignExperimentVariant(input: {
    key: string;
    userId: string;
  }): {
    experiment: AbExperiment;
    variantKey?: string;
    holdout: boolean;
    assignmentSource: "existing" | "new";
  } {
    const experiment = this.store.abExperimentsByKey.get(normalizeExperimentKey(input.key));
    if (!experiment) {
      throw new Error("AB_EXPERIMENT_NOT_FOUND");
    }
    if (experiment.status !== "running") {
      throw new Error("AB_EXPERIMENT_NOT_RUNNING");
    }

    const assignmentKey = this.assignmentKey(experiment.key, input.userId);
    const existing = this.store.abExperimentAssignmentByExperimentAndUser.get(assignmentKey);
    if (existing) {
      return {
        experiment,
        variantKey: existing === HOLDOUT_VARIANT_KEY ? undefined : existing,
        holdout: existing === HOLDOUT_VARIANT_KEY,
        assignmentSource: "existing"
      };
    }

    const trafficBucket = hashToInt(`${experiment.key}:${input.userId}:traffic`) % 100;
    let assignedVariant = HOLDOUT_VARIANT_KEY;

    if (trafficBucket < experiment.trafficPercent) {
      const variantBucket = hashToInt(`${experiment.key}:${input.userId}:variant`) % 10000;
      assignedVariant = this.pickVariantByWeight(experiment, variantBucket);
    }

    this.store.abExperimentAssignmentByExperimentAndUser.set(assignmentKey, assignedVariant);

    appendAudit(this.store, "ab_experiment_assigned", {
      userId: input.userId,
      metadata: {
        experimentKey: experiment.key,
        variantKey: assignedVariant,
        holdout: assignedVariant === HOLDOUT_VARIANT_KEY
      }
    });

    return {
      experiment,
      variantKey: assignedVariant === HOLDOUT_VARIANT_KEY ? undefined : assignedVariant,
      holdout: assignedVariant === HOLDOUT_VARIANT_KEY,
      assignmentSource: "new"
    };
  }

  listExperiments(filter?: {
    status?: AbExperimentStatus;
  }): Array<{
    experiment: AbExperiment;
    metrics: {
      sampleSize: number;
      runningDays: number;
      variants: Array<{
        variantKey: string;
        label: string;
        assignedUsers: number;
        exposureCount: number;
        conversionCount: number;
        conversionRate: number;
        liftPercent?: number;
      }>;
    };
    stopRecommendation: {
      shouldStop: boolean;
      reasons: string[];
      evaluatedAt: string;
    };
  }> {
    const experiments = Array.from(this.store.abExperimentsByKey.values())
      .filter((item) => (filter?.status ? item.status === filter.status : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return experiments.map((experiment) => {
      const metrics = this.computeExperimentMetrics(experiment);
      const stopRecommendation = this.evaluateStopRecommendation(experiment, metrics);
      return {
        experiment,
        metrics,
        stopRecommendation
      };
    });
  }

  private collectAbMetrics(userId: string | undefined, event: AnalyticsEvent): void {
    if (!userId) {
      return;
    }

    const metadata = event.metadata as Record<string, unknown>;
    const experimentKeyFromMetadata =
      typeof metadata.experiment_key === "string" ? normalizeExperimentKey(metadata.experiment_key) : undefined;
    const variantFromMetadata = typeof metadata.experiment_variant === "string" ? metadata.experiment_variant : undefined;

    if (experimentKeyFromMetadata) {
      const experiment = this.store.abExperimentsByKey.get(experimentKeyFromMetadata);
      if (!experiment) {
        return;
      }

      let variantKey = this.resolveVariantFromMetadataOrAssignment(experiment, userId, variantFromMetadata);
      if (!variantKey && experiment.status === "running") {
        variantKey = this.assignExperimentVariant({
          key: experiment.key,
          userId
        }).variantKey;
      }
      if (!variantKey) {
        return;
      }

      if (event.eventType === "experiment_exposure") {
        this.incrementMetric(this.store.abExperimentExposureCountByExperimentAndVariant, experiment.key, variantKey);
      }
      if (event.eventType === experiment.metricEventType) {
        this.incrementMetric(this.store.abExperimentConversionCountByExperimentAndVariant, experiment.key, variantKey);
      }
      return;
    }

    // If client does not send explicit experiment metadata, conversion events can still be attributed
    // by user assignment for running experiments.
    for (const experiment of this.store.abExperimentsByKey.values()) {
      if (experiment.status !== "running" || event.eventType !== experiment.metricEventType) {
        continue;
      }
      const assignment = this.store.abExperimentAssignmentByExperimentAndUser.get(this.assignmentKey(experiment.key, userId));
      if (!assignment || assignment === HOLDOUT_VARIANT_KEY) {
        continue;
      }
      this.incrementMetric(this.store.abExperimentConversionCountByExperimentAndVariant, experiment.key, assignment);
    }
  }

  private resolveVariantFromMetadataOrAssignment(
    experiment: AbExperiment,
    userId: string,
    variantFromMetadata?: string
  ): string | undefined {
    if (variantFromMetadata && experiment.variants.some((item) => item.key === variantFromMetadata)) {
      this.store.abExperimentAssignmentByExperimentAndUser.set(this.assignmentKey(experiment.key, userId), variantFromMetadata);
      return variantFromMetadata;
    }

    const assignment = this.store.abExperimentAssignmentByExperimentAndUser.get(this.assignmentKey(experiment.key, userId));
    if (!assignment || assignment === HOLDOUT_VARIANT_KEY) {
      return undefined;
    }
    return assignment;
  }

  private pickVariantByWeight(experiment: AbExperiment, bucket: number): string {
    const totalWeight = experiment.variants.reduce((sum, variant) => sum + variant.weight, 0);
    if (totalWeight <= 0) {
      return experiment.variants[0]?.key ?? HOLDOUT_VARIANT_KEY;
    }
    let cursor = (bucket / 10000) * totalWeight;
    for (const variant of experiment.variants) {
      if (cursor < variant.weight) {
        return variant.key;
      }
      cursor -= variant.weight;
    }
    return experiment.variants[experiment.variants.length - 1].key;
  }

  private computeExperimentMetrics(experiment: AbExperiment): {
    sampleSize: number;
    runningDays: number;
    variants: Array<{
      variantKey: string;
      label: string;
      assignedUsers: number;
      exposureCount: number;
      conversionCount: number;
      conversionRate: number;
      liftPercent?: number;
    }>;
  } {
    const variantStats = experiment.variants.map((variant) => {
      const assignedUsers = this.countAssignedUsers(experiment.key, variant.key);
      const exposureCount = this.store.abExperimentExposureCountByExperimentAndVariant.get(this.metricKey(experiment.key, variant.key)) ?? 0;
      const conversionCount =
        this.store.abExperimentConversionCountByExperimentAndVariant.get(this.metricKey(experiment.key, variant.key)) ?? 0;
      const denominator = exposureCount > 0 ? exposureCount : assignedUsers;
      const conversionRate = denominator === 0 ? 0 : round2((conversionCount / denominator) * 100);
      return {
        variantKey: variant.key,
        label: variant.label,
        assignedUsers,
        exposureCount,
        conversionCount,
        conversionRate
      };
    });

    const sampleSize = variantStats.reduce((sum, item) => sum + (item.exposureCount > 0 ? item.exposureCount : item.assignedUsers), 0);
    const baselineRate = variantStats[0]?.conversionRate ?? 0;
    const variantsWithLift = variantStats.map((item, index) => ({
      ...item,
      liftPercent:
        index === 0
          ? undefined
          : baselineRate <= 0
            ? item.conversionRate > 0
              ? 100
              : 0
            : round2(((item.conversionRate - baselineRate) / baselineRate) * 100)
    }));

    const runningDays = experiment.startedAt
      ? Math.max(0, Math.ceil((Date.now() - new Date(experiment.startedAt).getTime()) / (24 * 3600 * 1000)))
      : 0;

    return {
      sampleSize,
      runningDays,
      variants: variantsWithLift
    };
  }

  private evaluateStopRecommendation(
    experiment: AbExperiment,
    metrics: {
      sampleSize: number;
      runningDays: number;
      variants: Array<{
        liftPercent?: number;
      }>;
    }
  ): {
    shouldStop: boolean;
    reasons: string[];
    evaluatedAt: string;
  } {
    const reasons: string[] = [];
    const liftCandidates = metrics.variants
      .slice(1)
      .map((item) => item.liftPercent ?? 0)
      .sort((a, b) => b - a);
    const bestLift = liftCandidates[0] ?? 0;

    if (metrics.sampleSize >= experiment.stopCondition.minSampleSize) {
      reasons.push(`sample_size_reached(${metrics.sampleSize})`);
    }
    if (bestLift >= experiment.stopCondition.targetLiftPercent) {
      reasons.push(`target_lift_reached(${bestLift}%)`);
    }
    if (metrics.runningDays >= experiment.stopCondition.maxDurationDays) {
      reasons.push(`max_duration_reached(${metrics.runningDays}d)`);
    }

    const shouldStop =
      experiment.status === "running" &&
      metrics.sampleSize >= experiment.stopCondition.minSampleSize &&
      (bestLift >= experiment.stopCondition.targetLiftPercent ||
        metrics.runningDays >= experiment.stopCondition.maxDurationDays);

    return {
      shouldStop,
      reasons,
      evaluatedAt: nowIso()
    };
  }

  private countAssignedUsers(experimentKey: string, variantKey: string): number {
    let count = 0;
    const prefix = `${experimentKey}:`;
    for (const [key, assignment] of this.store.abExperimentAssignmentByExperimentAndUser.entries()) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      if (assignment === variantKey) {
        count += 1;
      }
    }
    return count;
  }

  private assignmentKey(experimentKey: string, userId: string): string {
    return `${experimentKey}:${userId}`;
  }

  private metricKey(experimentKey: string, variantKey: string): string {
    return `${experimentKey}:${variantKey}`;
  }

  private incrementMetric(target: Map<string, number>, experimentKey: string, variantKey: string): void {
    const key = this.metricKey(experimentKey, variantKey);
    target.set(key, (target.get(key) ?? 0) + 1);
  }
}
