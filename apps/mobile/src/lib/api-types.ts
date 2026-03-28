export * from "@ielts/shared-client/api-types";

export type HealthResponse = {
  status: string;
};

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
};
