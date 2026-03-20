import { randomUUID } from "node:crypto";
import { appendAudit } from "./audit.js";
import { nowIso } from "./time.js";
import { InMemoryStore } from "./store.js";
import type { ReminderPreference, ReminderRecommendation } from "./types.js";

const DEFAULT_ACTIVE_HOUR_UTC = 20;
const MAX_REMINDER_RECOMMENDATIONS = 1000;

type HourScore = {
  hour: number;
  score: number;
  eventCount: number;
  latestEventTs: number;
};

const CORE_LEARNING_EVENTS = new Set<string>([
  "onboarding_submitted",
  "diagnostic_completed",
  "practice_submitted",
  "speaking_turn_scored",
  "writing_evaluated",
  "mock_exam_submitted"
]);

const formatHourLabel = (hour: number): string => `${String(hour).padStart(2, "0")}:00`;

export class ReminderService {
  constructor(private readonly store: InMemoryStore) {}

  getActiveHourUtc(userId: string): number {
    return this.inferActiveHourUtc(userId).hour;
  }

  getPreference(userId: string): ReminderPreference {
    const existing = this.store.reminderPreferencesByUserId.get(userId);
    if (existing) {
      return existing;
    }

    const created: ReminderPreference = {
      userId,
      subscribed: true,
      updatedAt: nowIso()
    };
    this.store.reminderPreferencesByUserId.set(userId, created);
    return created;
  }

  updatePreference(input: {
    userId: string;
    subscribed: boolean;
  }): ReminderPreference {
    const next: ReminderPreference = {
      userId: input.userId,
      subscribed: input.subscribed,
      updatedAt: nowIso()
    };
    this.store.reminderPreferencesByUserId.set(input.userId, next);

    appendAudit(this.store, "reminder_preference_updated", {
      userId: input.userId,
      metadata: {
        subscribed: next.subscribed
      }
    });

    return next;
  }

  getRecommendation(userId: string): {
    preference: ReminderPreference;
    activeHourUtc: number;
    recommendation?: ReminderRecommendation;
  } {
    const preference = this.getPreference(userId);
    const activeStats = this.inferActiveHourUtc(userId);
    const activeHourUtc = activeStats.hour;

    if (!preference.subscribed) {
      return {
        preference,
        activeHourUtc
      };
    }

    const targetTask = this.pickTargetTask(userId);
    const scheduledAt = this.computeNextSchedule(activeHourUtc);
    const recommendation: ReminderRecommendation = {
      id: randomUUID(),
      userId,
      activeHourUtc,
      scheduledAt,
      reason:
        activeStats.eventCount === 0
          ? "基于默认学习节奏，建议在晚间固定时段学习。"
          : `基于你最近 ${activeStats.eventCount} 条学习行为，建议在 UTC ${formatHourLabel(activeHourUtc)} 提醒。`,
      deepLink: this.buildDeepLink(targetTask),
      planId: targetTask.planId,
      taskId: targetTask.taskId,
      createdAt: nowIso()
    };

    this.store.reminderRecommendationsById.set(recommendation.id, recommendation);
    this.trimRecommendationHistory();

    appendAudit(this.store, "reminder_recommendation_generated", {
      userId,
      metadata: {
        reminderId: recommendation.id,
        activeHourUtc,
        scheduledAt,
        taskId: recommendation.taskId,
        planId: recommendation.planId
      }
    });

    return {
      preference,
      activeHourUtc,
      recommendation
    };
  }

  clickReminder(input: {
    userId: string;
    reminderId: string;
  }): ReminderRecommendation {
    const reminder = this.store.reminderRecommendationsById.get(input.reminderId);
    if (!reminder || reminder.userId !== input.userId) {
      throw new Error("REMINDER_NOT_FOUND");
    }

    reminder.clickedAt = nowIso();

    appendAudit(this.store, "reminder_clicked", {
      userId: input.userId,
      metadata: {
        reminderId: reminder.id,
        deepLink: reminder.deepLink,
        clickedAt: reminder.clickedAt
      }
    });

    return reminder;
  }

  private inferActiveHourUtc(userId: string): {
    hour: number;
    eventCount: number;
  } {
    const buckets: HourScore[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      score: 0,
      eventCount: 0,
      latestEventTs: 0
    }));

    for (const event of this.store.analyticsEvents) {
      if (event.userId !== userId) {
        continue;
      }
      const createdAtTs = new Date(event.createdAt).getTime();
      if (Number.isNaN(createdAtTs)) {
        continue;
      }

      const hour = new Date(createdAtTs).getUTCHours();
      const daysAgo = Math.max(0, (Date.now() - createdAtTs) / (1000 * 60 * 60 * 24));
      const recencyWeight = daysAgo <= 14 ? 1.4 : daysAgo <= 30 ? 1.2 : 1;
      const signalWeight = CORE_LEARNING_EVENTS.has(event.eventType) ? 1.3 : 1;

      const bucket = buckets[hour];
      bucket.score += recencyWeight * signalWeight;
      bucket.eventCount += 1;
      bucket.latestEventTs = Math.max(bucket.latestEventTs, createdAtTs);
    }

    const best = [...buckets].sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (b.latestEventTs !== a.latestEventTs) {
        return b.latestEventTs - a.latestEventTs;
      }
      return a.hour - b.hour;
    })[0];

    if (!best || best.eventCount === 0) {
      return {
        hour: DEFAULT_ACTIVE_HOUR_UTC,
        eventCount: 0
      };
    }

    return {
      hour: best.hour,
      eventCount: best.eventCount
    };
  }

  private computeNextSchedule(hourUtc: number): string {
    const candidate = new Date();
    candidate.setUTCMinutes(0, 0, 0);
    candidate.setUTCHours(hourUtc);

    if (candidate.getTime() <= Date.now()) {
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }

    return candidate.toISOString();
  }

  private pickTargetTask(userId: string): {
    planId?: string;
    taskId?: string;
  } {
    const planId = this.store.activePlanIdByUserId.get(userId);
    if (!planId) {
      return {};
    }
    const plan = this.store.studyPlansById.get(planId);
    if (!plan || plan.userId !== userId) {
      return {};
    }

    const tasks = plan.weeks
      .flatMap((week) =>
        week.tasks.map((task) => ({
          taskId: task.id,
          dayOfWeek: task.dayOfWeek,
          weekNo: week.weekNo,
          status: task.status
        }))
      )
      .sort((a, b) => {
        if (a.weekNo !== b.weekNo) {
          return a.weekNo - b.weekNo;
        }
        return a.dayOfWeek - b.dayOfWeek;
      });

    const target = tasks.find((item) => item.status !== "done" && item.status !== "skipped") ?? tasks[0];
    if (!target) {
      return {};
    }

    return {
      planId,
      taskId: target.taskId
    };
  }

  private buildDeepLink(input: {
    planId?: string;
    taskId?: string;
  }): string {
    const query = new URLSearchParams({
      from: "reminder"
    });
    if (input.planId) {
      query.set("plan_id", input.planId);
    }
    if (input.taskId) {
      query.set("task_id", input.taskId);
    }
    return `/plan?${query.toString()}`;
  }

  private trimRecommendationHistory(): void {
    if (this.store.reminderRecommendationsById.size <= MAX_REMINDER_RECOMMENDATIONS) {
      return;
    }
    let overflow = this.store.reminderRecommendationsById.size - MAX_REMINDER_RECOMMENDATIONS;
    for (const key of this.store.reminderRecommendationsById.keys()) {
      this.store.reminderRecommendationsById.delete(key);
      overflow -= 1;
      if (this.store.reminderRecommendationsById.size <= MAX_REMINDER_RECOMMENDATIONS || overflow <= 0) {
        break;
      }
    }
  }
}
