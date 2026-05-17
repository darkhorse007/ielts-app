import type { ApiClient } from "./api-client";
import { TokenStorage } from "./token-storage";

type AnalyticsCapableApiClient = Partial<Pick<ApiClient, "analyticsBatch">>;

export type LearnerAnalyticsEventType =
  | "onboarding_submitted"
  | "practice_submitted"
  | "writing_evaluated"
  | "mock_exam_submitted"
  | "reminder_clicked";

export type LearnerAnalyticsSkill = "listening" | "speaking" | "reading" | "writing";

type TrackWebAnalyticsEventInput = {
  eventType: LearnerAnalyticsEventType;
  skill?: LearnerAnalyticsSkill;
  createdAt?: string;
  traceId?: string;
  providerName?: string;
  success?: boolean;
  fallbackTriggered?: boolean;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
};

export const trackWebAnalyticsEvent = async (
  apiClient: AnalyticsCapableApiClient,
  tokenStorage: TokenStorage,
  input: TrackWebAnalyticsEventInput
): Promise<void> => {
  const accessToken = tokenStorage.getAccessToken();
  if (!accessToken || typeof apiClient.analyticsBatch !== "function") {
    return;
  }

  try {
    await apiClient.analyticsBatch(accessToken, {
      events: [
        {
          platform: "web",
          skill: input.skill,
          event_type: input.eventType,
          trace_id: input.traceId,
          provider_name: input.providerName,
          success: input.success ?? true,
          fallback_triggered: input.fallbackTriggered,
          latency_ms: input.latencyMs,
          metadata: input.metadata,
          created_at: input.createdAt ?? new Date().toISOString()
        }
      ]
    });
  } catch {
    // Analytics is best-effort and must not block learner flows.
  }
};
