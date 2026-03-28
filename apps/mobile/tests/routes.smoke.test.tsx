import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { router } from "expo-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { StoredSession } from "../src/lib/api-types";
import type { InstanceConfig } from "../src/lib/runtime-config";
import { useAppSession } from "../src/state/app-session";
import AccountScreen from "../app/account";
import HomeScreen from "../app/home";
import MockExamScreen from "../app/mock-exam";

vi.mock("expo-router", () => ({
  router: {
    push: vi.fn(),
    replace: vi.fn()
  }
}));

vi.mock("../src/state/app-session", () => ({
  useAppSession: vi.fn()
}));

const defaultInstanceConfig: InstanceConfig = {
  apiBaseUrl: "http://127.0.0.1:8787",
  wsBaseUrl: "ws://127.0.0.1:8787"
};

const defaultSession: StoredSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  userId: "user-1"
};

const mockedUseAppSession = vi.mocked(useAppSession);

const createSessionContext = (overrides?: {
  apiClient?: Record<string, (...args: any[]) => Promise<any>>;
  session?: StoredSession | null;
  instanceConfig?: InstanceConfig | null;
}): ReturnType<typeof useAppSession> => {
  const apiClient = {
    getProfile: vi.fn().mockResolvedValue({
      id: "user-1",
      email: "learner@example.com",
      phone: "13800000000",
      status: "active",
      created_at: "2026-03-28T00:00:00.000Z",
      updated_at: "2026-03-28T00:00:00.000Z"
    }),
    getReminderPreference: vi.fn().mockResolvedValue({
      subscribed: true,
      active_hour_utc: 12,
      updated_at: "2026-03-28T00:00:00.000Z"
    }),
    getReminderRecommendation: vi.fn().mockResolvedValue({
      subscribed: true,
      active_hour_utc: 12,
      reminder_id: "rem-1",
      scheduled_at: "2026-03-28T12:00:00.000Z",
      reason: "今日写作任务仍未完成",
      deep_link: "/plan"
    }),
    exportUserData: vi.fn().mockResolvedValue({
      filename: "user-data-export-user-1.json",
      content: "{\"user_id\":\"user-1\"}"
    }),
    requestDeletion: vi.fn().mockResolvedValue({
      user_id: "user-1",
      status: "pending_deletion",
      deletion_requested_at: "2026-03-28T00:00:00.000Z"
    }),
    deleteAccount: vi.fn().mockResolvedValue({
      user_id: "user-1",
      status: "deleted",
      deleted_at: "2026-03-28T00:00:00.000Z",
      revoked_sessions: 2,
      removed_assessments: 1,
      removed_plans: 1,
      removed_goal_profiles: 1,
      removed_progress_conflicts: 0,
      removed_practice_sessions: 2,
      removed_retry_queue_items: 1,
      removed_speaking_sessions: 1,
      removed_writing_evaluations: 1,
      removed_writing_rewrite_archives: 1,
      removed_mock_exams: 1,
      removed_mock_exam_reports: 1
    }),
    createMockExam: vi.fn().mockResolvedValue({
      exam_id: "mock-1",
      status: "in_progress",
      time_limit_seconds: 7200,
      elapsed_seconds: 0,
      remaining_seconds: 7200,
      current_skill: "reading",
      sections: [],
      created_at: "2026-03-28T00:00:00.000Z",
      updated_at: "2026-03-28T00:00:00.000Z"
    }),
    ...overrides?.apiClient
  };

  return {
    ready: true,
    defaultInstanceConfig,
    instanceConfig: overrides?.instanceConfig ?? defaultInstanceConfig,
    session: overrides?.session ?? defaultSession,
    saveInstanceConfig: vi.fn(),
    saveSession: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    runWithAuthorizedClient: async <T,>(execute: (client: any, accessToken: string) => Promise<T>): Promise<T> =>
      execute(apiClient, "access-token")
  } as unknown as ReturnType<typeof useAppSession>;
};

describe("mobile route smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("home screen renders mock exam and account entry points", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());

    render(<HomeScreen />);

    expect(screen.getByText("自托管移动端骨架已落地")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("learner@example.com"))).toBeTruthy();
    });
    expect(screen.getByText("模考与报告")).toBeTruthy();
    expect(screen.getByText("进入账户中心")).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  test("mock exam screen renders report and export controls", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());

    render(<MockExamScreen />);

    expect(screen.getByText("模考与报告已进入移动端")).toBeTruthy();
    expect(screen.getByText("创建模考")).toBeTruthy();
    expect(screen.getByText("导出结果")).toBeTruthy();
  });

  test("account screen loads profile and export/delete controls", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());

    render(<AccountScreen />);

    expect(screen.getByText("账户中心已进入移动端")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("learner@example.com"))).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("今日写作任务仍未完成"))).toBeTruthy();
    expect(screen.getByText("导出并分享")).toBeTruthy();
    expect(screen.getByText("立即删除")).toBeTruthy();
  });
});
