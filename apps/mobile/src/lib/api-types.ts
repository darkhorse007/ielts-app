export * from "@ielts/shared-client/api-types";

export type HealthResponse = {
  status: string;
  reminder_dispatch_scheduler?: {
    enabled: boolean;
    running: boolean;
    interval_seconds?: number;
    batch_size?: number;
    last_trigger?: "startup" | "interval";
    last_started_at?: string;
    last_completed_at?: string;
    last_success_at?: string;
    last_error?: string;
    last_due_count?: number;
    last_dispatched_reminder_count?: number;
    last_skipped_already_attempted_count?: number;
  };
};

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
};
