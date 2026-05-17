import { Platform } from "react-native";
import type { ApiClient } from "./api-client";

export type LearnerAnalyticsEventType =
  | "onboarding_submitted"
  | "practice_submitted"
  | "writing_evaluated"
  | "mock_exam_submitted"
  | "reminder_clicked";

export type LearnerAnalyticsSkill = "listening" | "speaking" | "reading" | "writing";

type TrackMobileAnalyticsEventInput = {
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

type AuthorizedClientRunner = <T>(
  execute: (apiClient: ApiClient, accessToken: string) => Promise<T>
) => Promise<T>;

const resolveMobileAnalyticsPlatform = (): "ios" | "android" => (Platform.OS === "android" ? "android" : "ios");

export const trackMobileAnalyticsEvent = async (
  runWithAuthorizedClient: AuthorizedClientRunner,
  input: TrackMobileAnalyticsEventInput
): Promise<void> => {
  try {
    await runWithAuthorizedClient((apiClient, accessToken) => {
      const analyticsCapableClient = apiClient as Partial<Pick<ApiClient, "analyticsBatch">>;
      if (typeof analyticsCapableClient.analyticsBatch !== "function") {
        return Promise.resolve(undefined);
      }

      return analyticsCapableClient.analyticsBatch(accessToken, {
        events: [
          {
            platform: resolveMobileAnalyticsPlatform(),
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
    });
  } catch {
    // Analytics is best-effort and must not block learner flows.
  }
};
