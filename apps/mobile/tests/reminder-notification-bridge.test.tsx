import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { StoredSession } from "../src/lib/api-types";
import { emitDebugReminderNotificationOpen } from "../src/lib/notifications";
import type { InstanceConfig } from "../src/lib/runtime-config";
import { useAppSession } from "../src/state/app-session";
import { ReminderNotificationBridge } from "../src/state/reminder-notification-bridge";

vi.mock("expo-router", () => ({
  router: {
    push: vi.fn()
  }
}));

vi.mock("../src/state/app-session", () => ({
  useAppSession: vi.fn()
}));

const mockedUseAppSession = vi.mocked(useAppSession);
const mockedNotifications = Notifications as typeof Notifications & {
  __resetMockNotifications: () => void;
  __emitMockNotificationResponse: (response: Record<string, unknown>) => void;
};

const instanceConfig: InstanceConfig = {
  apiBaseUrl: "http://127.0.0.1:8787",
  wsBaseUrl: "ws://127.0.0.1:8787"
};

const session: StoredSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  userId: "user-1"
};

describe("reminder notification bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedNotifications.__resetMockNotifications();
  });

  test("restores the deep link and tracks reminder click from the last notification response", async () => {
    const clickReminder = vi.fn().mockResolvedValue({
      reminder_id: "rem-1",
      deep_link: "/plan?task_id=task-1"
    });

    mockedUseAppSession.mockReturnValue({
      ready: true,
      defaultInstanceConfig: instanceConfig,
      instanceConfig,
      session,
      saveInstanceConfig: vi.fn(),
      saveSession: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
      syncReminderDevice: vi.fn().mockResolvedValue(undefined),
      runWithAuthorizedClient: async <T,>(execute: (apiClient: any, accessToken: string) => Promise<T>): Promise<T> =>
        execute(
          {
            clickReminder
          },
          session.accessToken
        )
    } as unknown as ReturnType<typeof useAppSession>);

    mockedNotifications.__emitMockNotificationResponse({
      notification: {
        request: {
          content: {
            data: {
              kind: "study-reminder",
              reminderId: "rem-1",
              deepLink: "/plan?task_id=task-1"
            }
          }
        }
      }
    });

    render(<ReminderNotificationBridge />);

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/plan?task_id=task-1");
    });
    await waitFor(() => {
      expect(clickReminder).toHaveBeenCalledWith(session.accessToken, "rem-1");
    });
  });

  test("restores the deep link and tracks reminder click from the debug notification harness", async () => {
    const clickReminder = vi.fn().mockResolvedValue({
      reminder_id: "rem-2",
      deep_link: "/plan?from=reminder"
    });

    mockedUseAppSession.mockReturnValue({
      ready: true,
      defaultInstanceConfig: instanceConfig,
      instanceConfig,
      session,
      saveInstanceConfig: vi.fn(),
      saveSession: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
      syncReminderDevice: vi.fn().mockResolvedValue(undefined),
      runWithAuthorizedClient: async <T,>(execute: (apiClient: any, accessToken: string) => Promise<T>): Promise<T> =>
        execute(
          {
            clickReminder
          },
          session.accessToken
        )
    } as unknown as ReturnType<typeof useAppSession>);

    render(<ReminderNotificationBridge />);
    await act(async () => {
      emitDebugReminderNotificationOpen({
        reminderId: "rem-2",
        deepLink: "/plan?from=reminder"
      });
    });

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/plan?from=reminder");
    });
    await waitFor(() => {
      expect(clickReminder).toHaveBeenCalledWith(session.accessToken, "rem-2");
    });
  });
});
