import { randomUUID } from "node:crypto";
import { appendAudit } from "./audit.js";
import { nowIso } from "./time.js";
import { InMemoryStore } from "./store.js";
import type {
  ChurnRiskLevel,
  ChurnRiskSnapshot,
  ChurnStrategyTrigger,
  ChurnStrategyType
} from "./types.js";
import type { ReminderService } from "./reminder-service.js";

const CORE_LEARNING_EVENTS = new Set<string>([
  "onboarding_submitted",
  "diagnostic_completed",
  "practice_submitted",
  "speaking_turn_scored",
  "writing_evaluated",
  "mock_exam_submitted"
]);

const MAX_WINDOW_DAYS = 30;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const toRiskLevel = (score: number): ChurnRiskLevel => {
  if (score >= 70) {
    return "high";
  }
  if (score >= 45) {
    return "medium";
  }
  return "low";
};

export class ChurnService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly reminderService: ReminderService
  ) {}

  listRisks(input?: {
    minScore?: number;
    level?: ChurnRiskLevel;
    limit?: number;
  }): ChurnRiskSnapshot[] {
    const snapshots = Array.from(this.store.usersById.values())
      .filter((user) => user.status !== "deleted")
      .map((user) => {
        const snapshot = this.buildRiskSnapshot(user.id);
        this.store.churnRiskSnapshotsByUserId.set(user.id, snapshot);
        return snapshot;
      })
      .filter((snapshot) => (typeof input?.minScore === "number" ? snapshot.score >= input.minScore : true))
      .filter((snapshot) => (input?.level ? snapshot.level === input.level : true))
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return b.computedAt.localeCompare(a.computedAt);
      });

    const limit = clamp(typeof input?.limit === "number" ? Math.trunc(input.limit) : 50, 1, 200);

    appendAudit(this.store, "churn_risk_scored", {
      metadata: {
        scoredUsers: snapshots.length,
        minScore: input?.minScore,
        level: input?.level
      }
    });

    return snapshots.slice(0, limit);
  }

  computeRiskForUser(userId: string): ChurnRiskSnapshot {
    const user = this.store.usersById.get(userId);
    if (!user || user.status === "deleted") {
      throw new Error("USER_NOT_FOUND");
    }

    const snapshot = this.buildRiskSnapshot(userId);
    this.store.churnRiskSnapshotsByUserId.set(userId, snapshot);

    appendAudit(this.store, "churn_risk_scored", {
      userId,
      metadata: {
        score: snapshot.score,
        level: snapshot.level
      }
    });

    return snapshot;
  }

  triggerStrategy(input: {
    targetUserId: string;
    strategyType: ChurnStrategyType;
    reason?: string;
    conversionWindowDays?: number;
    actorUserId?: string;
  }): {
    risk: ChurnRiskSnapshot;
    trigger: ChurnStrategyTrigger;
  } {
    const user = this.store.usersById.get(input.targetUserId);
    if (!user || user.status === "deleted") {
      throw new Error("USER_NOT_FOUND");
    }

    const risk = this.computeRiskForUser(input.targetUserId);
    const triggerId = randomUUID();
    const conversionWindowDays = clamp(Math.trunc(input.conversionWindowDays ?? 7), 1, MAX_WINDOW_DAYS);
    const payload = this.buildStrategyPayload(input.targetUserId, input.strategyType);

    const trigger: ChurnStrategyTrigger = {
      id: triggerId,
      userId: input.targetUserId,
      riskSnapshotId: risk.id,
      strategyType: input.strategyType,
      reason: input.reason?.trim() || undefined,
      status: "triggered",
      triggeredAt: nowIso(),
      conversionWindowDays,
      payload
    };
    this.store.churnStrategyTriggersById.set(trigger.id, trigger);

    appendAudit(this.store, "churn_strategy_triggered", {
      userId: input.actorUserId,
      metadata: {
        triggerId: trigger.id,
        targetUserId: trigger.userId,
        strategyType: trigger.strategyType,
        riskLevel: risk.level,
        riskScore: risk.score,
        conversionWindowDays: trigger.conversionWindowDays
      }
    });

    return {
      risk,
      trigger
    };
  }

  getRecallEffect(input?: {
    since?: string;
    strategyType?: ChurnStrategyType;
  }): {
    totalTriggers: number;
    convertedTriggers: number;
    recallRatePercent: number;
    byStrategy: Array<{
      strategyType: ChurnStrategyType;
      totalTriggers: number;
      convertedTriggers: number;
      recallRatePercent: number;
    }>;
    items: ChurnStrategyTrigger[];
  } {
    const sinceTs =
      input?.since && !Number.isNaN(new Date(input.since).getTime()) ? new Date(input.since).getTime() : undefined;

    const triggers = Array.from(this.store.churnStrategyTriggersById.values())
      .filter((trigger) => (input?.strategyType ? trigger.strategyType === input.strategyType : true))
      .filter((trigger) => (sinceTs ? new Date(trigger.triggeredAt).getTime() >= sinceTs : true))
      .sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt));

    for (const trigger of triggers) {
      if (trigger.status === "converted") {
        continue;
      }
      const convertedAt = this.findConversionAt(trigger);
      if (convertedAt) {
        trigger.status = "converted";
        trigger.convertedAt = convertedAt;
      }
    }

    const convertedTriggers = triggers.filter((item) => item.status === "converted").length;
    const recallRatePercent = triggers.length === 0 ? 0 : Number(((convertedTriggers / triggers.length) * 100).toFixed(1));

    const strategyTypes: ChurnStrategyType[] = ["smart_reminder", "mock_exam_boost", "coupon_nudge"];
    const byStrategy = strategyTypes.map((strategyType) => {
      const scoped = triggers.filter((item) => item.strategyType === strategyType);
      const converted = scoped.filter((item) => item.status === "converted").length;
      return {
        strategyType,
        totalTriggers: scoped.length,
        convertedTriggers: converted,
        recallRatePercent: scoped.length === 0 ? 0 : Number(((converted / scoped.length) * 100).toFixed(1))
      };
    });

    appendAudit(this.store, "churn_effect_queried", {
      metadata: {
        totalTriggers: triggers.length,
        convertedTriggers,
        strategyType: input?.strategyType
      }
    });

    return {
      totalTriggers: triggers.length,
      convertedTriggers,
      recallRatePercent,
      byStrategy,
      items: triggers
    };
  }

  private buildRiskSnapshot(userId: string): ChurnRiskSnapshot {
    const now = Date.now();
    const learningEvents = this.store.analyticsEvents
      .filter((event) => event.userId === userId && CORE_LEARNING_EVENTS.has(event.eventType))
      .filter((event) => !Number.isNaN(new Date(event.createdAt).getTime()));

    const sortedLearningEvents = [...learningEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const lastActiveAt = sortedLearningEvents[0]?.createdAt;
    const lastActiveDays = lastActiveAt ? Math.max(0, Math.floor((now - new Date(lastActiveAt).getTime()) / (24 * 3600 * 1000))) : 30;

    const weeklyLearningEvents = learningEvents.filter((event) => now - new Date(event.createdAt).getTime() <= 7 * 24 * 3600 * 1000).length;
    const reminderClicksIn30Days = Array.from(this.store.reminderRecommendationsById.values()).filter((item) => {
      if (item.userId !== userId || !item.clickedAt) {
        return false;
      }
      const clickedTs = new Date(item.clickedAt).getTime();
      return !Number.isNaN(clickedTs) && now - clickedTs <= 30 * 24 * 3600 * 1000;
    }).length;

    const inactivityScore = lastActiveAt ? Math.min(55, lastActiveDays * 3) : 55;
    const frequencyScore = Math.max(0, 30 - weeklyLearningEvents * 6);
    const reminderEngagementScore = reminderClicksIn30Days > 0 ? 0 : 15;
    const noPlanScore = this.store.activePlanIdByUserId.has(userId) ? 0 : 10;

    const score = clamp(
      Math.round(inactivityScore + frequencyScore + reminderEngagementScore + noPlanScore),
      0,
      100
    );
    const level = toRiskLevel(score);

    const factors = [
      `last_active_days=${lastActiveDays}`,
      `weekly_learning_events=${weeklyLearningEvents}`,
      `reminder_clicks_30d=${reminderClicksIn30Days}`,
      `has_active_plan=${this.store.activePlanIdByUserId.has(userId)}`
    ];
    if (!lastActiveAt) {
      factors.push("no_learning_event_detected");
    }
    if (weeklyLearningEvents <= 1) {
      factors.push("low_weekly_activity");
    }
    if (reminderClicksIn30Days === 0) {
      factors.push("reminder_not_engaged");
    }

    return {
      id: randomUUID(),
      userId,
      score,
      level,
      factors,
      lastActiveAt,
      weeklyLearningEvents,
      reminderClicksIn30Days,
      computedAt: nowIso()
    };
  }

  private buildStrategyPayload(userId: string, strategyType: ChurnStrategyType): Record<string, unknown> {
    if (strategyType === "smart_reminder") {
      const recommendation = this.reminderService.getRecommendation(userId);
      return {
        channel: "in_app_reminder",
        subscribed: recommendation.preference.subscribed,
        reminderId: recommendation.recommendation?.id,
        scheduledAt: recommendation.recommendation?.scheduledAt,
        deepLink: recommendation.recommendation?.deepLink
      };
    }

    if (strategyType === "mock_exam_boost") {
      return {
        channel: "in_app_banner",
        message: "提供一次模考冲刺任务，激活学习节奏。",
        deepLink: "/mock-exam?from=churn_boost"
      };
    }

    return {
      channel: "coupon_offer",
      couponCode: "IELTS-RECALL-10",
      message: "发放限时折扣券，降低回流门槛。",
      deepLink: "/subscription?from=recall_coupon"
    };
  }

  private findConversionAt(trigger: ChurnStrategyTrigger): string | undefined {
    const triggeredTs = new Date(trigger.triggeredAt).getTime();
    if (Number.isNaN(triggeredTs)) {
      return undefined;
    }
    const deadlineTs = triggeredTs + trigger.conversionWindowDays * 24 * 3600 * 1000;

    const matched = this.store.analyticsEvents
      .filter((event) => event.userId === trigger.userId && CORE_LEARNING_EVENTS.has(event.eventType))
      .map((event) => ({
        event,
        ts: new Date(event.createdAt).getTime()
      }))
      .filter((item) => !Number.isNaN(item.ts) && item.ts >= triggeredTs && item.ts <= deadlineTs)
      .sort((a, b) => a.ts - b.ts)[0];

    return matched?.event.createdAt;
  }
}
