import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as Audio from "expo-audio";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { router, useLocalSearchParams } from "expo-router";
import { AppState, Linking, Share } from "react-native";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  MinorGuardianResponse,
  MinorGuardianSupportRequestResponse,
  ReminderDeviceRegistrationResponse,
  StoredSession,
  UserProfileResponse
} from "../src/lib/api-types";
import { buildScopedStorageKey } from "../src/lib/storage";
import { buildCurrentRemoteReminderDeviceRegistrationAsync } from "../src/lib/notifications";
import type { InstanceConfig } from "../src/lib/runtime-config";
import { useAppSession } from "../src/state/app-session";
import { MinorGuardianProvider } from "../src/state/minor-guardian";
import { StudyLoopProvider } from "../src/state/study-loop";
import AccountScreen from "../app/account";
import DiagnosticScreen from "../app/diagnostic";
import HomeScreen from "../app/home";
import InstanceConfigScreen from "../app/instance";
import ListeningScreen from "../app/listening";
import LoginScreen from "../app/login";
import ReadingScreen from "../app/reading";
import RegisterScreen from "../app/register";
import MockExamScreen from "../app/mock-exam";
import OnboardingScreen from "../app/onboarding";
import PlanScreen from "../app/plan";
import ProgressScreen from "../app/progress";
import SpeakingScreen from "../app/speaking";
import WritingScreen from "../app/writing";

vi.mock("expo-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Redirect: () => null,
  router: {
    push: vi.fn(),
    replace: vi.fn()
  },
  useLocalSearchParams: vi.fn(() => ({}))
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
const mockedUseLocalSearchParams = vi.mocked(useLocalSearchParams);
const mockedSecureStore = SecureStore as typeof SecureStore & {
  __resetMockStorage: () => void;
  __setMockItem: (key: string, value: string) => void;
  __getMockItem: (key: string) => string | null;
};
const mockedNotifications = Notifications as typeof Notifications & {
  __resetMockNotifications: () => void;
  __getMockScheduledNotifications: () => Array<{
    identifier: string;
    content: {
      title?: string;
      body?: string;
      data?: Record<string, unknown>;
    };
    trigger: {
      date?: Date | number;
    } | null;
  }>;
  __setMockNotificationPermission: (overrides: {
    granted?: boolean;
    canAskAgain?: boolean;
    expires?: string;
    status?: string;
    ios?: {
      status?: number | null;
    };
  }) => void;
  __setMockDevicePushToken: (token: { type: string; data: string }) => void;
};
const mockedAppState = AppState as typeof AppState & {
  __emitMockStateChange: (state: "active" | "background" | "inactive") => void;
};
const mockedLinking = Linking as typeof Linking & {
  openSettings: ReturnType<typeof vi.fn>;
};
const mockedShare = Share as typeof Share & {
  share: ReturnType<typeof vi.fn>;
};

const toPushTokenPreview = (pushToken?: string): string | undefined => {
  if (!pushToken) {
    return undefined;
  }

  if (pushToken.length <= 10) {
    return pushToken;
  }

  return `${pushToken.slice(0, 6)}...${pushToken.slice(-4)}`;
};

const createSessionContext = (overrides?: {
  apiClient?: Record<string, (...args: any[]) => Promise<any>>;
  session?: StoredSession | null;
  instanceConfig?: InstanceConfig | null;
  defaultInstanceConfig?: InstanceConfig | null;
  reminderDevices?: ReminderDeviceRegistrationResponse[];
  saveInstanceConfig?: ReturnType<typeof vi.fn>;
}): ReturnType<typeof useAppSession> => {
  const hasSessionOverride = Boolean(overrides && Object.prototype.hasOwnProperty.call(overrides, "session"));
  const hasInstanceOverride = Boolean(overrides && Object.prototype.hasOwnProperty.call(overrides, "instanceConfig"));
  const hasDefaultInstanceOverride = Boolean(
    overrides && Object.prototype.hasOwnProperty.call(overrides, "defaultInstanceConfig")
  );
  const sessionValue = hasSessionOverride ? (overrides?.session ?? null) : defaultSession;
  const resolvedDefaultInstanceConfig = hasDefaultInstanceOverride
    ? (overrides?.defaultInstanceConfig ?? null)
    : defaultInstanceConfig;
  const resolvedInstanceConfig = hasInstanceOverride
    ? (overrides?.instanceConfig ?? null)
    : resolvedDefaultInstanceConfig;
  const minorGuardianSupportRequests: MinorGuardianSupportRequestResponse[] = [];
  const reminderDevicesByInstallationId = new Map<string, ReminderDeviceRegistrationResponse>(
    (overrides?.reminderDevices ?? []).map((item) => [item.installation_id, { ...item }])
  );
  const profileState: UserProfileResponse & { minor_guardian: MinorGuardianResponse } = {
    id: sessionValue?.userId ?? "user-1",
    email: "learner@example.com",
    phone: "13800000000",
    system_roles: [],
    status: "active" as const,
    minor_guardian: {
      age_band: "unknown" as const
    },
    created_at: "2026-03-28T00:00:00.000Z",
    updated_at: "2026-03-28T00:00:00.000Z"
  };
  const listReminderDevices = vi.fn(async () => {
    const items = Array.from(reminderDevicesByInstallationId.values()).sort((left, right) =>
      right.updated_at.localeCompare(left.updated_at)
    );
    return {
      total_count: items.length,
      deliverable_count: items.filter((item) => item.delivery_ready).length,
      items
    };
  });
  const upsertReminderDevice = vi.fn(
    async (
      _accessToken: string,
      installationId: string,
      payload: {
        platform: "ios" | "android";
        permission_status: "granted" | "provisional" | "undetermined" | "denied" | "unsupported";
        push_provider?: "apns" | "fcm";
        push_token?: string;
        device_label?: string;
        app_build?: string;
        environment: "development" | "preview" | "production";
      }
    ) => {
      const existing = reminderDevicesByInstallationId.get(installationId);
      const timestamp = new Date().toISOString();
      const next: ReminderDeviceRegistrationResponse = {
        installation_id: installationId,
        platform: payload.platform,
        permission_status: payload.permission_status,
        push_provider: payload.push_provider,
        push_token_preview: toPushTokenPreview(payload.push_token),
        device_label: payload.device_label,
        app_build: payload.app_build,
        environment: payload.environment,
        delivery_ready:
          Boolean(payload.push_token) &&
          (payload.permission_status === "granted" || payload.permission_status === "provisional"),
        created_at: existing?.created_at ?? timestamp,
        updated_at: timestamp
      };
      reminderDevicesByInstallationId.set(installationId, next);
      return next;
    }
  );
  const deleteReminderDevice = vi.fn(async (_accessToken: string, installationId: string) => ({
    installation_id: installationId,
    removed: reminderDevicesByInstallationId.delete(installationId)
  }));
  const updateMinorGuardian = vi.fn(
    async (
      _accessToken: string,
      payload: {
        age_band: "unknown" | "under_18" | "adult";
        source?: "register" | "account";
      }
    ) => {
      const timestamp = new Date().toISOString();
      profileState.minor_guardian = {
        age_band: payload.age_band,
        source: payload.source ?? "account",
        updated_at: timestamp
      };
      profileState.updated_at = timestamp;
      return {
        ...profileState.minor_guardian
      };
    }
  );
  const acknowledgeMinorGuardianNotice = vi.fn(async () => {
    const timestamp = new Date().toISOString();
    profileState.minor_guardian = {
      ...profileState.minor_guardian,
      updated_at: timestamp,
      guardian_notice_accepted_at: timestamp,
      guardian_notice_accepted_user_id: sessionValue?.userId ?? "user-1"
    };
    profileState.updated_at = timestamp;
    return {
      ...profileState.minor_guardian
    };
  });
  const listMinorGuardianSupportRequests = vi.fn(async () => ({
    total_count: minorGuardianSupportRequests.length,
    items: [...minorGuardianSupportRequests].sort((left, right) => right.created_at.localeCompare(left.created_at))
  }));
  const submitMinorGuardianSupportRequest = vi.fn(
    async (
      _accessToken: string,
      payload: {
        topic: "account_review" | "data_deletion" | "usage_concern" | "other";
        contact_channel: "email" | "phone";
        contact_value: string;
        message: string;
      }
    ) => {
      const timestamp = new Date().toISOString();
      const request: MinorGuardianSupportRequestResponse = {
        request_id: `guardian-support-${minorGuardianSupportRequests.length + 1}`,
        topic: payload.topic,
        contact_channel: payload.contact_channel,
        contact_value: payload.contact_value,
        message: payload.message,
        status: "pending_review",
        created_at: timestamp,
        updated_at: timestamp
      };
      minorGuardianSupportRequests.unshift(request);
      return request;
    }
  );
  const apiClient = {
    getProfile: vi.fn().mockImplementation(async () => ({
      ...profileState,
      minor_guardian: {
        ...profileState.minor_guardian
      }
    })),
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
      user_id: sessionValue?.userId ?? "user-1",
      status: "pending_deletion",
      deletion_requested_at: "2026-03-28T00:00:00.000Z"
    }),
    deleteAccount: vi.fn().mockResolvedValue({
      user_id: sessionValue?.userId ?? "user-1",
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
    listReminderDevices,
    upsertReminderDevice,
    deleteReminderDevice,
    updateMinorGuardian,
    acknowledgeMinorGuardianNotice,
    listMinorGuardianSupportRequests,
    submitMinorGuardianSupportRequest,
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
    fetchActivePlan: vi.fn().mockResolvedValue({
      plan_id: "home-plan-1",
      status: "active",
      horizon_weeks: 8,
      version: 3,
      created_at: "2026-03-28T00:00:00.000Z",
      updated_at: "2026-03-28T00:00:00.000Z",
      adjustment_history: [],
      weeks: [
        {
          week_id: "week-1",
          week_no: 1,
          goals: ["先稳定阅读节奏"],
          tasks: [
            {
              task_id: "home-task-1",
              skill: "reading",
              task_type: "foundation",
              title: "首周阅读节奏训练",
              target_minutes: 50,
              completion_criteria: "完成 1 次阅读训练",
              day_of_week: 1,
              status: "todo"
            }
          ]
        }
      ]
    }),
    ...overrides?.apiClient
  };
  const syncReminderDevice = vi.fn(async () => {
    const registration = await buildCurrentRemoteReminderDeviceRegistrationAsync();
    await upsertReminderDevice("access-token", registration.installationId, {
      platform: registration.platform,
      permission_status: registration.permissionStatus,
      push_provider: registration.pushProvider,
      push_token: registration.pushToken,
      device_label: registration.deviceLabel,
      app_build: registration.appBuild,
      environment: registration.environment
    });
  });

  return {
    ready: true,
    defaultInstanceConfig: resolvedDefaultInstanceConfig,
    instanceConfig: resolvedInstanceConfig,
    session: sessionValue,
    saveInstanceConfig: overrides?.saveInstanceConfig ?? vi.fn(),
    saveSession: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    syncReminderDevice,
    runWithAuthorizedClient: async <T,>(execute: (client: any, accessToken: string) => Promise<T>): Promise<T> =>
      execute(apiClient, "access-token")
  } as unknown as ReturnType<typeof useAppSession>;
};

describe("mobile route smoke", () => {
  const renderHomeWithStudyLoop = () =>
    render(
      <StudyLoopProvider>
        <HomeScreen />
      </StudyLoopProvider>
    );

  const renderPlanWithStudyLoop = () =>
    render(
      <StudyLoopProvider>
        <PlanScreen />
      </StudyLoopProvider>
    );

  const renderProgressWithStudyLoop = () =>
    render(
      <StudyLoopProvider>
        <ProgressScreen />
      </StudyLoopProvider>
    );

  const renderListeningWithStudyLoop = () =>
    render(
      <StudyLoopProvider>
        <ListeningScreen />
      </StudyLoopProvider>
    );

  const renderReadingWithStudyLoop = () =>
    render(
      <StudyLoopProvider>
        <ReadingScreen />
      </StudyLoopProvider>
    );

  const renderDiagnosticWithStudyLoop = () =>
    render(
      <StudyLoopProvider>
        <DiagnosticScreen />
      </StudyLoopProvider>
    );

  const renderMockExamWithStudyLoop = () =>
    render(
      <StudyLoopProvider>
        <MockExamScreen />
      </StudyLoopProvider>
    );

  const renderWritingWithStudyLoop = () =>
    render(
      <StudyLoopProvider>
        <WritingScreen />
      </StudyLoopProvider>
    );

  const renderSpeakingWithStudyLoop = () =>
    render(
      <StudyLoopProvider>
        <SpeakingScreen />
      </StudyLoopProvider>
    );

  const renderRegisterScreen = () =>
    render(
      <MinorGuardianProvider>
        <RegisterScreen />
      </MinorGuardianProvider>
    );

  const renderAccountScreen = () =>
    render(
      <MinorGuardianProvider>
        <AccountScreen />
      </MinorGuardianProvider>
    );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mockedSecureStore.__resetMockStorage();
    mockedNotifications.__resetMockNotifications();
    mockedUseLocalSearchParams.mockReturnValue({});
    mockedAppState.__emitMockStateChange("active");
  });

  test("home screen renders mock exam and account entry points", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());

    render(<HomeScreen />);

    expect(screen.getByText("自托管移动端骨架已落地")).toBeTruthy();
    expect(screen.getByText("当前正在使用安装包预置实例")).toBeTruthy();
    expect(screen.getByText((content) => content.includes("localhost/127.0.0.1 回环地址"))).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("learner@example.com"))).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("today_action_count: 1"))).toBeTruthy();
      expect(screen.getByText((content) => content.includes("next_action: 直接进入当前计划任务"))).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("action_1_title: 直接进入当前计划任务"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("action_1_source: 主线"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("action_1_priority: P1"))).toBeTruthy();
    expect(screen.getByText("模考与报告")).toBeTruthy();
    expect(screen.getByText("进入账户中心")).toBeTruthy();

    fireEvent.click(screen.getByTestId("home.mockExam"));
    fireEvent.click(screen.getByTestId("home.accountQuick"));

    expect(router.push).toHaveBeenCalledWith("/mock-exam");
    expect(router.push).toHaveBeenCalledWith("/account");
    expect(router.replace).not.toHaveBeenCalled();
  });

  test("home screen initializes profile and plan fetch only once", async () => {
    const getProfile = vi.fn().mockResolvedValue({
      id: defaultSession.userId,
      email: "learner@example.com",
      phone: "13800000000",
      system_roles: [],
      status: "active",
      minor_guardian: {
        age_band: "unknown"
      },
      created_at: "2026-03-28T00:00:00.000Z",
      updated_at: "2026-03-28T00:00:00.000Z"
    });
    const fetchActivePlan = vi.fn().mockResolvedValue({
      plan_id: "home-plan-1",
      status: "active",
      horizon_weeks: 8,
      version: 3,
      created_at: "2026-03-28T00:00:00.000Z",
      updated_at: "2026-03-28T00:00:00.000Z",
      adjustment_history: [],
      weeks: [
        {
          week_id: "week-1",
          week_no: 1,
          goals: ["先稳定阅读节奏"],
          tasks: [
            {
              task_id: "home-task-1",
              skill: "reading",
              task_type: "foundation",
              title: "首周阅读节奏训练",
              target_minutes: 50,
              completion_criteria: "完成 1 次阅读训练",
              day_of_week: 1,
              status: "todo"
            }
          ]
        }
      ]
    });
    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          getProfile,
          fetchActivePlan
        }
      })
    );

    renderHomeWithStudyLoop();

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("today_action_count: 1"))).toBeTruthy();
    });

    expect(getProfile).toHaveBeenCalledTimes(1);
    expect(fetchActivePlan).toHaveBeenCalledTimes(1);
  });

  test("home screen selects the next actionable plan task across task statuses", async () => {
    const fetchActivePlan = vi.fn().mockResolvedValue({
      plan_id: "home-plan-actionable-1",
      status: "active",
      horizon_weeks: 8,
      version: 4,
      created_at: "2026-04-05T00:00:00.000Z",
      updated_at: "2026-04-05T00:00:00.000Z",
      adjustment_history: [],
      weeks: [
        {
          week_id: "week-1",
          week_no: 1,
          goals: ["先收尾历史任务"],
          tasks: [
            {
              task_id: "home-task-done-1",
              skill: "reading",
              task_type: "foundation",
              title: "已完成阅读任务",
              target_minutes: 40,
              completion_criteria: "完成 1 次阅读训练",
              day_of_week: 1,
              status: "done"
            },
            {
              task_id: "home-task-skipped-1",
              skill: "writing",
              task_type: "foundation",
              title: "已跳过写作任务",
              target_minutes: 30,
              completion_criteria: "完成 1 次写作训练",
              day_of_week: 2,
              status: "skipped"
            }
          ]
        },
        {
          week_id: "week-2",
          week_no: 2,
          goals: ["继续当前口语训练"],
          tasks: [
            {
              task_id: "home-task-doing-1",
              skill: "speaking",
              task_type: "foundation",
              title: "当前口语冲刺",
              target_minutes: 45,
              completion_criteria: "完成 1 次口语训练",
              day_of_week: 1,
              status: "doing"
            }
          ]
        }
      ]
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          fetchActivePlan
        }
      })
    );

    renderHomeWithStudyLoop();

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("action_1_title: 直接进入当前计划任务"))).toBeTruthy();
      expect(screen.getByText((content) => content.includes("action_1_detail: 当前计划下一步：当前口语冲刺"))).toBeTruthy();
    });

    expect(screen.getAllByText("进入口语训练").length).toBeGreaterThan(0);
  });

  test("home screen can run API health smoke", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/health");
      expect(init?.method).toBe("GET");

      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      });
    });

    vi.stubGlobal("fetch", fetchMock);
    mockedUseAppSession.mockReturnValue(createSessionContext());

    renderHomeWithStudyLoop();

    fireEvent.click(screen.getByTestId("home.checkHealth"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText("API 连通: ok")).toBeTruthy();
    });
  });

  test("home screen can run speaking websocket smoke", async () => {
    const createSpeakingSession = vi.fn().mockResolvedValue({
      session_id: "smoke-speaking-1",
      status: "created",
      task_type: "core_training",
      resume_token: "resume-smoke-1",
      resume_until: "2026-04-05T10:30:00.000Z",
      current_part: 1,
      topic: "Mobile smoke connection",
      turns: 0,
      created_at: "2026-04-05T10:00:00.000Z",
      updated_at: "2026-04-05T10:00:00.000Z"
    });
    const endSpeakingSession = vi.fn().mockResolvedValue({
      session_id: "smoke-speaking-1",
      status: "ended",
      resume_until: "2026-04-05T10:30:00.000Z",
      turns: 0,
      created_at: "2026-04-05T10:00:00.000Z",
      updated_at: "2026-04-05T10:00:05.000Z",
      ended_at: "2026-04-05T10:00:05.000Z"
    });

    class MockWebSocket {
      onerror: ((event?: unknown) => void) | null = null;
      onclose: ((event: { code: number }) => void) | null = null;
      private messageHandler: ((event: { data: string }) => void) | null = null;
      send = vi.fn();
      close = vi.fn(() => {
        this.onclose?.({ code: 1000 });
      });

      constructor(url: string) {
        expect(url).toBe(
          "ws://127.0.0.1:8787/v1/realtime/speaking?session_id=smoke-speaking-1&resume_token=resume-smoke-1"
        );
      }

      set onmessage(handler: ((event: { data: string }) => void) | null) {
        this.messageHandler = handler;
        handler?.({
          data: JSON.stringify({
            type: "session_start",
            current_part: 2
          })
        });
      }

      get onmessage(): ((event: { data: string }) => void) | null {
        return this.messageHandler;
      }
    }

    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createSpeakingSession,
          endSpeakingSession
        }
      })
    );

    renderHomeWithStudyLoop();

    fireEvent.click(screen.getByTestId("home.checkSpeakingSocket"));

    await waitFor(() => {
      expect(createSpeakingSession).toHaveBeenCalledTimes(1);
      expect(endSpeakingSession).toHaveBeenCalledTimes(1);
      expect(screen.getByText("WS 连通: session_start / part 2")).toBeTruthy();
    });
  });

  test("home screen can refresh profile on demand", async () => {
    const getProfile = vi
      .fn()
      .mockResolvedValueOnce({
        id: defaultSession.userId,
        email: "learner@example.com",
        phone: "13800000000",
        system_roles: [],
        status: "active",
        minor_guardian: {
          age_band: "unknown"
        },
        created_at: "2026-03-28T00:00:00.000Z",
        updated_at: "2026-03-28T00:00:00.000Z"
      })
      .mockResolvedValueOnce({
        id: defaultSession.userId,
        email: "learner+refresh@example.com",
        phone: "13800000000",
        system_roles: [],
        status: "active",
        minor_guardian: {
          age_band: "unknown"
        },
        created_at: "2026-03-28T00:00:00.000Z",
        updated_at: "2026-04-05T00:00:00.000Z"
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          getProfile
        }
      })
    );

    renderHomeWithStudyLoop();

    await waitFor(() => {
      expect(getProfile).toHaveBeenCalledTimes(1);
      expect(screen.getByText((content) => content.includes("email: learner@example.com"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("home.refreshProfile"));

    await waitFor(() => {
      expect(getProfile).toHaveBeenCalledTimes(2);
      expect(screen.getByText((content) => content.includes("email: learner+refresh@example.com"))).toBeTruthy();
    });
  });

  test("home screen can logout and redirect to login", async () => {
    const sessionContext = createSessionContext();
    const logout = vi.fn().mockResolvedValue(undefined);

    mockedUseAppSession.mockReturnValue({
      ...sessionContext,
      logout
    } as ReturnType<typeof useAppSession>);

    renderHomeWithStudyLoop();

    fireEvent.click(screen.getByTestId("home.signOut"));

    await waitFor(() => {
      expect(logout).toHaveBeenCalledTimes(1);
      expect(router.replace).toHaveBeenCalledWith("/login");
    });
  });

  test("home screen shows pending study loop refreshes", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("study-loop", "activities", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        activities: [
          {
            id: "loop-1",
            skill: "listening",
            source: "practice_submission",
            title: "听力训练已提交",
            summary: "听力提交 8/10，accuracy 80%",
            route: "/listening",
            planPending: true,
            progressPending: true,
            createdAt: "2026-04-04T12:00:00.000Z",
            updatedAt: "2026-04-04T12:00:00.000Z"
          }
        ]
      })
    );

    renderHomeWithStudyLoop();

    await waitFor(() => {
      expect(screen.getByText("学习主线闭环")).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("today_action_count: 1"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("action_1_title: 先回看学习计划"))).toBeTruthy();
    expect(screen.getByText("计划待刷新 1")).toBeTruthy();
    expect(screen.getByText("进度待刷新 1")).toBeTruthy();
    expect(screen.getByText((content) => content.includes("next_action: 先回看学习计划"))).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes("next_action_detail: 听力结果刚更新，先消化计划侧变化。"))
    ).toBeTruthy();
    expect(screen.getByText((content) => content.includes("听力 · 听力提交 8/10"))).toBeTruthy();
  });

  test("home screen falls back to diagnostic entry when active plan has no first task", async () => {
    const fetchActivePlan = vi.fn().mockResolvedValue({
      plan_id: "home-plan-empty-1",
      status: "active",
      horizon_weeks: 8,
      version: 4,
      created_at: "2026-04-05T00:00:00.000Z",
      updated_at: "2026-04-05T00:00:00.000Z",
      adjustment_history: [],
      weeks: [
        {
          week_id: "week-empty-1",
          week_no: 1,
          goals: ["先完成首次诊断"],
          tasks: []
        }
      ]
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          fetchActivePlan
        }
      })
    );

    renderHomeWithStudyLoop();

    await waitFor(() => {
      expect(fetchActivePlan).toHaveBeenCalledTimes(1);
      expect(screen.getByText((content) => content.includes("today_action_count: 1"))).toBeTruthy();
      expect(screen.getByText((content) => content.includes("action_1_title: 开始今天的学习主线"))).toBeTruthy();
      expect(screen.getByText((content) => content.includes("action_1_detail: 先做首次诊断，或直接进入当前计划。"))).toBeTruthy();
    });

    expect(screen.getByText((content) => content.includes("next_action: 开始今天的学习主线"))).toBeTruthy();
    expect(screen.getAllByText("进入首次诊断").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("home.todayAction.0"));

    expect(router.push).toHaveBeenCalledWith("/diagnostic");
  });

  test("home screen shows resume checkpoint shortcut", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("writing", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        taskType: "task2",
        prompt: "Resume prompt",
        essay: "Resume essay",
        rewriteEssay: "Resume rewrite",
        evaluationId: "resume-eval-1",
        comparisonDelta: null,
        selectedTemplateId: "",
        templateInsertionMode: "append",
        templatePreservedOriginal: false,
        templateAdoptionText: "-",
        updatedAt: "2026-04-05T08:00:00.000Z"
      })
    );

    renderHomeWithStudyLoop();

    await waitFor(() => {
      expect(screen.getByText("上次中断恢复")).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("today_action_count: 2"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("action_1_title: 继续写作批改"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("action_1_source: 恢复"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("action_1_priority: P0"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("action_2_title: 直接进入当前计划任务"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("action_2_source: 主线"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("action_2_priority: P1"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("resume_title: 继续写作批改"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("resume_count: 1"))).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes("resume_detail: 上次写作草稿与改写内容仍保留在本地。"))
    ).toBeTruthy();

    fireEvent.click(screen.getByTestId("home.resumeCheckpoint"));

    expect(router.push).toHaveBeenCalledWith("/writing");
  });

  test("home screen shows multiple resume checkpoints and can open queued item", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("writing", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        taskType: "task2",
        prompt: "Resume prompt",
        essay: "Resume essay",
        rewriteEssay: "Resume rewrite",
        evaluationId: "resume-eval-1",
        comparisonDelta: null,
        selectedTemplateId: "",
        templateInsertionMode: "append",
        templatePreservedOriginal: false,
        templateAdoptionText: "-",
        updatedAt: "2026-04-05T08:00:00.000Z"
      })
    );
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("reading", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        trainingMode: "training",
        timeLimitSeconds: "1200",
        session: {
          session_id: "reading-resume-2",
          skill: "reading",
          task_type: "foundation",
          training_mode: "training",
          mode: "core_training",
          status: "in_progress",
          created_at: "2026-04-05T07:30:00.000Z",
          updated_at: "2026-04-05T07:45:00.000Z",
          questions: []
        },
        answers: {},
        timerText: "running / elapsed 120s / remain 1080s",
        timerRecovered: true,
        evidenceCount: 1,
        updatedAt: "2026-04-05T07:45:00.000Z"
      })
    );

    renderHomeWithStudyLoop();

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("resume_count: 2"))).toBeTruthy();
      expect(screen.getByText((content) => content.includes("today_action_count: 3"))).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("action_1_title: 继续写作批改"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("action_1_priority: P0"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("action_2_title: 直接进入当前计划任务"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("action_2_priority: P1"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("action_3_title: 继续阅读训练"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("action_3_source: 恢复"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("action_3_priority: P2"))).toBeTruthy();
    expect(screen.getAllByText("继续阅读训练").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("home.resumeCheckpointItem.reading"));

    expect(router.push).toHaveBeenCalledWith("/reading");
  });

  test("home screen today action list can dismiss a queued resume action", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("writing", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        taskType: "task2",
        prompt: "Resume prompt",
        essay: "Resume essay",
        rewriteEssay: "Resume rewrite",
        evaluationId: "resume-eval-3",
        comparisonDelta: null,
        selectedTemplateId: "",
        templateInsertionMode: "append",
        templatePreservedOriginal: false,
        templateAdoptionText: "-",
        updatedAt: "2026-04-05T08:00:00.000Z"
      })
    );
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("reading", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        trainingMode: "training",
        timeLimitSeconds: "1200",
        session: {
          session_id: "reading-resume-3",
          skill: "reading",
          task_type: "foundation",
          training_mode: "training",
          mode: "core_training",
          status: "in_progress",
          created_at: "2026-04-05T07:30:00.000Z",
          updated_at: "2026-04-05T07:45:00.000Z",
          questions: []
        },
        answers: {},
        timerText: "running / elapsed 120s / remain 1080s",
        timerRecovered: true,
        evidenceCount: 1,
        updatedAt: "2026-04-05T07:45:00.000Z"
      })
    );

    renderHomeWithStudyLoop();

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("today_action_count: 3"))).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("action_3_title: 继续阅读训练"))).toBeTruthy();

    fireEvent.click(screen.getByTestId("home.dismissTodayAction.2"));

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("today_action_count: 2"))).toBeTruthy();
    });
    expect(screen.queryByText((content) => content.includes("action_3_title: 继续阅读训练"))).toBeNull();
    expect(screen.getByText((content) => content.includes("action_1_title: 继续写作批改"))).toBeTruthy();
    expect(
      mockedSecureStore.__getMockItem(buildScopedStorageKey("reading", "draft", "v1", defaultSession.userId))
    ).toBeNull();
    expect(
      mockedSecureStore.__getMockItem(buildScopedStorageKey("writing", "draft", "v1", defaultSession.userId))
    ).not.toBeNull();
  });

  test("home screen refreshes resume checkpoints after app returns to foreground", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());

    renderHomeWithStudyLoop();

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("today_action_count: 1"))).toBeTruthy();
    });
    expect(screen.queryByText("上次中断恢复")).toBeNull();

    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("writing", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        taskType: "task2",
        prompt: "Foreground resume prompt",
        essay: "Foreground resume essay",
        rewriteEssay: "",
        evaluationId: "resume-eval-foreground",
        comparisonDelta: null,
        selectedTemplateId: "",
        templateInsertionMode: "append",
        templatePreservedOriginal: false,
        templateAdoptionText: "-",
        updatedAt: "2026-04-05T09:00:00.000Z"
      })
    );

    await act(async () => {
      mockedAppState.__emitMockStateChange("background");
      mockedAppState.__emitMockStateChange("active");
    });

    await waitFor(() => {
      expect(screen.getByText("上次中断恢复")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("today_action_count: 2"))).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("action_1_title: 继续写作批改"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("resume_count: 1"))).toBeTruthy();
  });

  test("home screen today action list can open the prioritized action", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("speaking", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        taskType: "core_training",
        scenarioType: "campus_service",
        topic: "Resume speaking topic",
        transcript: "",
        sessionState: null,
        resumeToken: "",
        scenarioItems: [],
        currentPart: 1,
        scoreText: "-",
        suggestions: [],
        latencyMs: 0,
        traceCount: 0,
        recentEvents: [],
        comparisonText: "-",
        heatmapText: "-",
        replaySegmentCount: 0,
        pronunciationTasks: [],
        trackedTaskText: "-",
        reconnectIntent: false,
        updatedAt: "2026-04-05T08:30:00.000Z"
      })
    );

    renderHomeWithStudyLoop();

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("action_1_title: 继续口语训练"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("home.todayAction.0"));

    expect(router.push).toHaveBeenCalledWith("/speaking");
  });

  test("home screen can dismiss the latest resume checkpoint", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("reading", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        trainingMode: "training",
        timeLimitSeconds: "1200",
        session: {
          session_id: "reading-resume-1",
          skill: "reading",
          task_type: "foundation",
          training_mode: "training",
          mode: "core_training",
          status: "in_progress",
          created_at: "2026-04-05T08:00:00.000Z",
          updated_at: "2026-04-05T08:10:00.000Z",
          questions: []
        },
        answers: {},
        timerText: "running / elapsed 120s / remain 1080s",
        timerRecovered: true,
        evidenceCount: 1,
        updatedAt: "2026-04-05T08:10:00.000Z"
      })
    );

    renderHomeWithStudyLoop();

    await waitFor(() => {
      expect(screen.getByText("上次中断恢复")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("home.dismissResumeCheckpoint"));

    await waitFor(() => {
      expect(screen.queryByText("上次中断恢复")).toBeNull();
    });
    expect(
      mockedSecureStore.__getMockItem(buildScopedStorageKey("reading", "draft", "v1", defaultSession.userId))
    ).toBeNull();
  });

  test("home screen can dismiss all resume checkpoints", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("writing", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        taskType: "task2",
        prompt: "Resume prompt",
        essay: "Resume essay",
        rewriteEssay: "Resume rewrite",
        evaluationId: "resume-eval-2",
        comparisonDelta: null,
        selectedTemplateId: "",
        templateInsertionMode: "append",
        templatePreservedOriginal: false,
        templateAdoptionText: "-",
        updatedAt: "2026-04-05T08:20:00.000Z"
      })
    );
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("listening", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        taskType: "core_training",
        session: null,
        answers: {},
        playbackRate: "1",
        segmentIndex: "0",
        positionSeconds: "0",
        replayWrongOnly: false,
        queueCount: 0,
        lastPlaybackSnapshot: null,
        updatedAt: "2026-04-05T08:10:00.000Z"
      })
    );

    renderHomeWithStudyLoop();

    await waitFor(() => {
      expect(screen.getByTestId("home.dismissAllResumeCheckpoints")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("home.dismissAllResumeCheckpoints"));

    await waitFor(() => {
      expect(screen.queryByText("上次中断恢复")).toBeNull();
    });
    expect(
      mockedSecureStore.__getMockItem(buildScopedStorageKey("writing", "draft", "v1", defaultSession.userId))
    ).toBeNull();
    expect(
      mockedSecureStore.__getMockItem(buildScopedStorageKey("listening", "draft", "v1", defaultSession.userId))
    ).toBeNull();
  });

  test("login screen shows instance summary and risk warnings", () => {
    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        session: null,
        instanceConfig: {
          apiBaseUrl: "http://api.example.com:8787",
          wsBaseUrl: "ws://ws.example.com:8788"
        }
      })
    );

    render(<LoginScreen />);

    expect(screen.getByText("登录移动端工作台")).toBeTruthy();
    expect(screen.getByText("当前正在使用本地覆盖实例")).toBeTruthy();
    expect(screen.getByText("http://api.example.com:8787")).toBeTruthy();
    expect(screen.getByText("ws://ws.example.com:8788")).toBeTruthy();
    expect(screen.getByText((content) => content.includes("API 与 WS 指向不同 host/port"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("外网地址仍使用 HTTP / WS"))).toBeTruthy();
  });

  test("register screen shows instance summary and risk warnings", async () => {
    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        session: null,
        instanceConfig: {
          apiBaseUrl: "http://api.example.com:8787",
          wsBaseUrl: "ws://ws.example.com:8788"
        }
      })
    );

    renderRegisterScreen();

    await waitFor(() => {
      expect(screen.getByText("先把账号创建出来")).toBeTruthy();
    });
    expect(screen.getByText("当前正在使用本地覆盖实例")).toBeTruthy();
    expect(screen.getByText("http://api.example.com:8787")).toBeTruthy();
    expect(screen.getByText("ws://ws.example.com:8788")).toBeTruthy();
    expect(screen.getByText((content) => content.includes("API 与 WS 指向不同 host/port"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("外网地址仍使用 HTTP / WS"))).toBeTruthy();
  });

  test("onboarding screen shows current instance summary", () => {
    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        instanceConfig: {
          apiBaseUrl: "http://192.168.0.20:8787",
          wsBaseUrl: "ws://192.168.0.20:8787"
        }
      })
    );

    render(<OnboardingScreen />);

    expect(screen.getByText("先把目标与约束写进系统")).toBeTruthy();
    expect(screen.getByText("当前正在使用本地覆盖实例")).toBeTruthy();
    expect(screen.getByText("http://192.168.0.20:8787")).toBeTruthy();
    expect(screen.getByText("ws://192.168.0.20:8787")).toBeTruthy();
  });

  test("onboarding screen can prefetch the first diagnostic question after submit", async () => {
    const submitOnboarding = vi.fn().mockResolvedValue({
      assessment_id: "onboarding-assessment-1",
      plan_id: "onboarding-plan-1",
      status: "processing"
    });
    const fetchOnboardingStatus = vi.fn().mockResolvedValue({
      assessment_id: "onboarding-assessment-1",
      plan_id: "onboarding-plan-1",
      status: "completed",
      updated_at: "2026-04-05T00:00:00.000Z",
      answered_count: 0,
      total_questions: 12,
      elapsed_seconds: 0
    });
    const fetchDiagnosticQuestions = vi.fn().mockResolvedValue({
      assessment_id: "onboarding-assessment-1",
      status: "in_progress",
      answered_count: 0,
      total_questions: 12,
      elapsed_seconds: 0,
      current_question_index: 0,
      questions: [
        {
          question_id: "diagnostic-q-1",
          skill: "speaking",
          prompt: "Describe a speaking habit you want to improve."
        }
      ]
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          submitOnboarding,
          fetchOnboardingStatus,
          fetchDiagnosticQuestions
        }
      })
    );

    render(<OnboardingScreen />);

    fireEvent.change(screen.getByTestId("onboarding.targetExamDate"), {
      target: { value: "2026-04-20" }
    });
    fireEvent.click(screen.getByTestId("onboarding.submit"));

    await waitFor(() => {
      expect(submitOnboarding).toHaveBeenCalledTimes(1);
      expect(fetchOnboardingStatus).toHaveBeenCalledTimes(1);
      expect(fetchDiagnosticQuestions).toHaveBeenCalledTimes(1);
      expect(screen.getByText("进入第一题")).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("assessment_id: onboarding-assessment-1"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("first_question_id: diagnostic-q-1"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("diagnostic_progress: 0/12"))).toBeTruthy();
    expect(
      screen.getByText((content) =>
        content.includes("first_question_prompt: Describe a speaking habit you want to improve.")
      )
    ).toBeTruthy();

    fireEvent.click(screen.getByTestId("onboarding.continueDiagnostic"));

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/diagnostic",
      params: {
        assessmentId: "onboarding-assessment-1"
      }
    });
  });

  test("onboarding screen keeps submit success when status refresh fails", async () => {
    const submitOnboarding = vi.fn().mockResolvedValue({
      assessment_id: "onboarding-assessment-status-fail-1",
      plan_id: "onboarding-plan-status-fail-1",
      status: "processing"
    });
    const fetchOnboardingStatus = vi.fn().mockRejectedValue(new Error("状态服务暂时不可用"));
    const fetchDiagnosticQuestions = vi.fn().mockResolvedValue({
      assessment_id: "onboarding-assessment-status-fail-1",
      status: "in_progress",
      answered_count: 0,
      total_questions: 12,
      elapsed_seconds: 0,
      current_question_index: 0,
      questions: [
        {
          question_id: "diagnostic-q-status-fail-1",
          skill: "reading",
          prompt: "Read the passage and answer question 1."
        }
      ]
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          submitOnboarding,
          fetchOnboardingStatus,
          fetchDiagnosticQuestions
        }
      })
    );

    render(<OnboardingScreen />);

    fireEvent.change(screen.getByTestId("onboarding.targetExamDate"), {
      target: { value: "2026-04-21" }
    });
    fireEvent.click(screen.getByTestId("onboarding.submit"));

    await waitFor(() => {
      expect(submitOnboarding).toHaveBeenCalledTimes(1);
      expect(fetchOnboardingStatus).toHaveBeenCalledTimes(1);
      expect(fetchDiagnosticQuestions).toHaveBeenCalledTimes(1);
      expect(screen.getByText((content) => content.includes("status: processing"))).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("目标已提交，诊断状态刷新失败"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("assessment_id: onboarding-assessment-status-fail-1"))).toBeTruthy();
    expect(screen.getByText("进入第一题")).toBeTruthy();
    expect(screen.queryByText((content) => content.includes("status: failed"))).toBeNull();

    fireEvent.click(screen.getByTestId("onboarding.continueDiagnostic"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/diagnostic",
      params: {
        assessmentId: "onboarding-assessment-status-fail-1"
      }
    });
  });

  test("instance screen validates health before saving configuration", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/health");
      expect(init?.method).toBe("GET");

      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      });
    });
    const saveInstanceConfig = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);
    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        instanceConfig: null,
        defaultInstanceConfig: null,
        saveInstanceConfig
      })
    );

    render(<InstanceConfigScreen />);

    fireEvent.change(screen.getByTestId("instance.apiBaseUrl"), {
      target: { value: "http://127.0.0.1:8787" }
    });
    fireEvent.change(screen.getByTestId("instance.wsBaseUrl"), {
      target: { value: "" }
    });
    fireEvent.click(screen.getByTestId("instance.save"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(saveInstanceConfig).toHaveBeenCalledWith({
        apiBaseUrl: "http://127.0.0.1:8787",
        wsBaseUrl: "ws://127.0.0.1:8787"
      });
      expect(router.replace).toHaveBeenCalledWith("/");
    });
    expect(screen.getByText((content) => content.includes("预检状态: 已通过"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("最近结果: /health=ok"))).toBeTruthy();
  });

  test("instance screen shows source labels and can fill default draft", async () => {
    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        instanceConfig: {
          apiBaseUrl: "http://192.168.0.20:8787",
          wsBaseUrl: "ws://192.168.0.20:8787"
        }
      })
    );

    render(<InstanceConfigScreen />);

    expect(screen.getByText("当前正在使用本地覆盖实例")).toBeTruthy();
    expect(screen.getByText((content) => content.includes("预置 API: http://127.0.0.1:8787"))).toBeTruthy();

    fireEvent.click(screen.getByTestId("instance.applyDefaultDraft"));

    expect(screen.getByDisplayValue("http://127.0.0.1:8787")).toBeTruthy();
    expect(screen.getByDisplayValue("ws://127.0.0.1:8787")).toBeTruthy();
    expect(screen.getByText((content) => content.includes("预检状态: 未验证"))).toBeTruthy();
  });

  test("instance screen can restore default instance with validation", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/health");
      expect(init?.method).toBe("GET");

      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      });
    });
    const saveInstanceConfig = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);
    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        instanceConfig: {
          apiBaseUrl: "http://192.168.0.20:8787",
          wsBaseUrl: "ws://192.168.0.20:8787"
        },
        saveInstanceConfig
      })
    );

    render(<InstanceConfigScreen />);

    fireEvent.click(screen.getByTestId("instance.restoreDefault"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(saveInstanceConfig).toHaveBeenCalledWith({
        apiBaseUrl: "http://127.0.0.1:8787",
        wsBaseUrl: "ws://127.0.0.1:8787"
      });
      expect(router.replace).toHaveBeenCalledWith("/");
    });
    expect(screen.getByText((content) => content.includes("预检状态: 预置实例已通过"))).toBeTruthy();
  });

  test("instance screen blocks saving when health validation fails", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Network request failed");
    });
    const saveInstanceConfig = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);
    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        instanceConfig: null,
        defaultInstanceConfig: null,
        saveInstanceConfig
      })
    );

    render(<InstanceConfigScreen />);

    fireEvent.change(screen.getByTestId("instance.apiBaseUrl"), {
      target: { value: "http://127.0.0.1:8787" }
    });
    fireEvent.click(screen.getByTestId("instance.save"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(saveInstanceConfig).not.toHaveBeenCalled();
    });
    expect(screen.getByText((content) => content.includes("Network request failed"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("预检状态: 验证失败"))).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalledWith("/");
  });

  test("instance screen shows loopback and host mismatch warnings", async () => {
    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        instanceConfig: null,
        defaultInstanceConfig: null
      })
    );

    render(<InstanceConfigScreen />);

    fireEvent.change(screen.getByTestId("instance.apiBaseUrl"), {
      target: { value: "http://127.0.0.1:8787" }
    });
    fireEvent.change(screen.getByTestId("instance.wsBaseUrl"), {
      target: { value: "ws://192.168.0.50:8788" }
    });

    expect(screen.getByText("风险提示")).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes("localhost/127.0.0.1 回环地址"))
    ).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes("API 与 WS 指向不同 host/port"))
    ).toBeTruthy();
  });

  test("instance screen shows insecure public endpoint warning", async () => {
    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        instanceConfig: null,
        defaultInstanceConfig: null
      })
    );

    render(<InstanceConfigScreen />);

    fireEvent.change(screen.getByTestId("instance.apiBaseUrl"), {
      target: { value: "http://api.example.com:8787" }
    });

    expect(screen.getByText("风险提示")).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes("HTTP / WS"))
    ).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes("HTTPS / WSS"))
    ).toBeTruthy();
  });

  test("mock exam screen renders report and export controls", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());

    render(<MockExamScreen />);

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("checkpoint_status: 已启用自动保存"))).toBeTruthy();
    });
    expect(screen.getByText("模考与报告已进入移动端")).toBeTruthy();
    expect(screen.getByText("创建模考")).toBeTruthy();
    expect(screen.getByText("导出结果")).toBeTruthy();
  });

  test("mock exam screen restores local checkpoint snapshot", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("mock-exam", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        exam: {
          exam_id: "mock-restored-1",
          status: "in_progress",
          time_limit_seconds: 7200,
          elapsed_seconds: 900,
          remaining_seconds: 6300,
          current_skill: "reading",
          sections: [],
          created_at: "2026-03-31T00:00:00.000Z",
          updated_at: "2026-03-31T00:15:00.000Z"
        },
        report: {
          report_id: "report-restored-1",
          exam_id: "mock-restored-1",
          total_estimated_band: 6.5,
          skill_band_estimates: {
            listening: 6.5,
            speaking: 6,
            reading: 6.5,
            writing: 6
          },
          error_distribution: {
            listening: 3,
            speaking: 2,
            reading: 4,
            writing: 3
          },
          next_actions: ["补强阅读限时节奏"],
          plan_writeback: {
            applied: false,
            undo_available: false,
            reasons: [],
            changed_tasks: []
          },
          generated_at: "2026-03-31T00:20:00.000Z",
          created_at: "2026-03-31T00:20:00.000Z",
          updated_at: "2026-03-31T00:20:00.000Z"
        },
        timeLimitSeconds: "7200",
        skill: "reading",
        answeredCount: "18",
        listeningBand: "6.5",
        speakingBand: "6",
        readingBand: "6.5",
        writingBand: "6",
        exportPreview: "restored preview",
        exportFilename: "restored-report.json",
        updatedAt: "2026-03-31T12:34:56.000Z"
      })
    );

    render(<MockExamScreen />);

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("checkpoint_status: 已恢复"))).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("exam_id: mock-restored-1"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("filename: restored-report.json"))).toBeTruthy();
  });

  test("mock exam screen records study loop activity after report submission", async () => {
    const createMockExam = vi.fn().mockResolvedValue({
      exam_id: "mock-2",
      status: "in_progress",
      time_limit_seconds: 7200,
      elapsed_seconds: 0,
      remaining_seconds: 7200,
      current_skill: "reading",
      sections: [],
      created_at: "2026-04-04T12:00:00.000Z",
      updated_at: "2026-04-04T12:00:00.000Z"
    });
    const submitMockExam = vi.fn().mockResolvedValue({
      exam: {
        exam_id: "mock-2",
        status: "submitted",
        time_limit_seconds: 7200,
        elapsed_seconds: 3600,
        remaining_seconds: 0,
        current_skill: "writing",
        sections: [],
        report_id: "mock-report-2",
        submitted_at: "2026-04-04T13:00:00.000Z",
        created_at: "2026-04-04T12:00:00.000Z",
        updated_at: "2026-04-04T13:00:00.000Z"
      },
      report: {
        report_id: "mock-report-2",
        exam_id: "mock-2",
        total_estimated_band: 6.5,
        skill_band_estimates: {
          listening: 6.5,
          speaking: 6,
          reading: 6.5,
          writing: 6
        },
        error_distribution: {
          listening: 3,
          speaking: 2,
          reading: 4,
          writing: 3
        },
        next_actions: ["补强阅读限时节奏"],
        plan_writeback: {
          applied: true,
          undo_available: true,
          reasons: ["阅读耗时偏高"],
          changed_tasks: [
            {
              task_id: "task-1",
              target_minutes_before: 45,
              completion_criteria_before: "完成 1 次阅读训练",
              target_minutes_after: 60,
              completion_criteria_after: "完成 1 次阅读训练并记录耗时"
            }
          ]
        },
        generated_at: "2026-04-04T13:00:00.000Z",
        created_at: "2026-04-04T13:00:00.000Z",
        updated_at: "2026-04-04T13:00:00.000Z"
      }
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createMockExam,
          submitMockExam
        }
      })
    );

    renderMockExamWithStudyLoop();

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("checkpoint_status: 已启用自动保存"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("mockExam.create"));

    await waitFor(() => {
      expect(createMockExam).toHaveBeenCalledTimes(1);
      expect(screen.getByText((content) => content.includes("exam_id: mock-2"))).toBeTruthy();
    });

    fireEvent.click(screen.getByText("提交整场模考"));

    await waitFor(() => {
      expect(submitMockExam).toHaveBeenCalledTimes(1);
      expect(screen.getByText((content) => content.includes("overall: 6.5"))).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("next_action: 先回看学习计划"))).toBeTruthy();

    fireEvent.click(screen.getByTestId("mockExam.studyLoopNext.primary"));

    expect(router.push).toHaveBeenCalledWith("/plan");

    await waitFor(() => {
      const stored = JSON.parse(
        String(mockedSecureStore.__getMockItem(buildScopedStorageKey("study-loop", "activities", "v1", defaultSession.userId)))
      );
      expect(stored.activities[0]).toMatchObject({
        skill: "mock_exam",
        source: "mock_exam_report",
        title: "模考报告已生成",
        route: "/mock-exam",
        planPending: true,
        progressPending: true
      });
      expect(stored.activities[0].summary).toContain("模考 overall 6.5");
      expect(stored.activities[0].summary).toContain("L6.5/S6/R6.5/W6");
    });
  });

  test("mock exam screen surfaces sync failures and allows retry", async () => {
    const createMockExam = vi
      .fn()
      .mockRejectedValueOnce(new Error("模考服务暂时不可用"))
      .mockResolvedValueOnce({
        exam_id: "mock-retry-1",
        status: "in_progress",
        time_limit_seconds: 7200,
        elapsed_seconds: 0,
        remaining_seconds: 7200,
        current_skill: "reading",
        sections: [],
        created_at: "2026-04-04T12:00:00.000Z",
        updated_at: "2026-04-04T12:00:00.000Z"
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createMockExam
        }
      })
    );

    render(<MockExamScreen />);

    fireEvent.click(screen.getByTestId("mockExam.create"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 创建模考失败")).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("server_sync_result: 模考服务暂时不可用"))).toBeTruthy();

    fireEvent.click(screen.getByTestId("mockExam.retryLastFailedAction"));

    await waitFor(() => {
      expect(createMockExam).toHaveBeenCalledTimes(2);
      expect(screen.getByText((content) => content.includes("exam_id: mock-retry-1"))).toBeTruthy();
      expect(screen.getByText("server_sync_status: 模考创建成功，当前科目=reading")).toBeTruthy();
    });
  });

  test("reading screen restores local checkpoint snapshot", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("reading", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        trainingMode: "exam",
        timeLimitSeconds: "1500",
        session: {
          session_id: "reading-restored-1",
          skill: "reading",
          task_type: "core_training",
          training_mode: "exam",
          mode: "core_training",
          status: "in_progress",
          created_at: "2026-03-31T00:00:00.000Z",
          updated_at: "2026-03-31T00:10:00.000Z",
          timer: {
            status: "running",
            limit_seconds: 1500,
            elapsed_seconds: 300,
            remaining_seconds: 1200
          },
          questions: [
            {
              question_id: "reading-q-1",
              type: "multiple_choice",
              prompt: "Restored reading question",
              options: ["A", "B", "C"]
            }
          ]
        },
        answers: {
          "reading-q-1": "B"
        },
        timerText: "running / elapsed 300s / remain 1200s",
        timerRecovered: true,
        evidenceCount: 1,
        updatedAt: "2026-03-31T12:34:56.000Z"
      })
    );

    render(<ReadingScreen />);

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("checkpoint_status: 已恢复"))).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("session_id: reading-restored-1"))).toBeTruthy();
    expect(screen.getByDisplayValue("B")).toBeTruthy();
  });

  test("reading screen surfaces sync failures and allows retry", async () => {
    const createPracticeSession = vi
      .fn()
      .mockRejectedValueOnce(new Error("阅读服务暂时不可用"))
      .mockResolvedValueOnce({
        session_id: "reading-retry-1",
        skill: "reading",
        task_type: "core_training",
        training_mode: "training",
        mode: "core_training",
        status: "in_progress",
        created_at: "2026-04-04T00:00:00.000Z",
        updated_at: "2026-04-04T00:00:00.000Z",
        questions: [
          {
            question_id: "reading-retry-q-1",
            type: "multiple_choice",
            prompt: "Retry reading question",
            options: ["A", "B", "C"]
          }
        ]
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createPracticeSession
        }
      })
    );

    render(<ReadingScreen />);

    fireEvent.click(screen.getByText("创建训练"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 创建训练失败")).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("server_sync_result: 阅读服务暂时不可用"))).toBeTruthy();

    fireEvent.click(screen.getByTestId("reading.retryLastFailedAction"));

    await waitFor(() => {
      expect(createPracticeSession).toHaveBeenCalledTimes(2);
      expect(screen.getByText((content) => content.includes("session_id: reading-retry-1"))).toBeTruthy();
      expect(screen.getByText("server_sync_status: 已创建阅读训练，题量 1")).toBeTruthy();
    });
  });

  test("reading screen records study loop activity after submission", async () => {
    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createPracticeSession: vi.fn().mockResolvedValue({
            session_id: "reading-live-1",
            skill: "reading",
            task_type: "core_training",
            training_mode: "training",
            mode: "core_training",
            status: "in_progress",
            created_at: "2026-04-04T00:00:00.000Z",
            updated_at: "2026-04-04T00:00:00.000Z",
            questions: [
              {
                question_id: "reading-q-1",
                type: "multiple_choice",
                prompt: "Find the correct heading",
                options: ["A", "B", "C"]
              }
            ]
          }),
          submitPracticeSession: vi.fn().mockResolvedValue({
            session_id: "reading-live-1",
            skill: "reading",
            task_type: "core_training",
            training_mode: "training",
            mode: "core_training",
            status: "completed",
            created_at: "2026-04-04T00:00:00.000Z",
            updated_at: "2026-04-04T00:10:00.000Z",
            questions: [
              {
                question_id: "reading-q-1",
                type: "multiple_choice",
                prompt: "Find the correct heading",
                options: ["A", "B", "C"]
              }
            ],
            submission: {
              submission_id: "reading-submission-1",
              score_breakdown: {
                correct_count: 0,
                total_questions: 1,
                accuracy: 0,
                mode: "training",
                elapsed_seconds: 150
              },
              question_results: [
                {
                  question_id: "reading-q-1",
                  is_correct: false,
                  user_answer: "B",
                  correct_answer: "A",
                  explanation: "Paragraph 2 states the key transition.",
                  error_tags: ["detail_miss"],
                  improvement_actions: ["回看定位句"],
                  evidence: {
                    paragraph: 2,
                    sentence: "The passage explains the main transition in paragraph 2."
                  }
                }
              ]
            }
          })
        }
      })
    );

    renderReadingWithStudyLoop();

    fireEvent.click(screen.getByText("创建训练"));

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("session_id: reading-live-1"))).toBeTruthy();
    });

    fireEvent.change(screen.getByDisplayValue(""), {
      target: { value: "B" }
    });
    fireEvent.click(screen.getByText("提交答案"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 提交完成，正确 0/1")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("next_action: 先回看学习计划"))).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("reading.studyLoopNext.primary"));
    expect(router.push).toHaveBeenCalledWith("/plan");

    await waitFor(() => {
      const stored = JSON.parse(
        String(mockedSecureStore.__getMockItem(buildScopedStorageKey("study-loop", "activities", "v1", defaultSession.userId)))
      );
      expect(stored.activities[0]).toMatchObject({
        skill: "reading",
        source: "practice_submission",
        title: "阅读训练已提交",
        route: "/reading",
        planPending: true,
        progressPending: true
      });
      expect(stored.activities[0].summary).toContain("阅读提交 0/1");
      expect(stored.activities[0].summary).toContain("accuracy 0%");
    });
  });

  test("reading screen can sync exam mode and drive timer controls", async () => {
    const createPracticeSession = vi.fn().mockResolvedValue({
      session_id: "reading-timer-1",
      skill: "reading",
      task_type: "core_training",
      training_mode: "training",
      mode: "core_training",
      status: "in_progress",
      created_at: "2026-04-05T06:00:00.000Z",
      updated_at: "2026-04-05T06:00:00.000Z",
      timer: {
        status: "running",
        limit_seconds: 1200,
        elapsed_seconds: 0,
        remaining_seconds: 1200
      },
      questions: [
        {
          question_id: "reading-timer-q-1",
          type: "multiple_choice",
          prompt: "Find the matching heading",
          options: ["A", "B", "C"]
        }
      ]
    });
    const switchReadingMode = vi.fn().mockResolvedValue({
      session_id: "reading-timer-1",
      skill: "reading",
      task_type: "core_training",
      training_mode: "exam",
      mode: "core_training",
      status: "in_progress",
      created_at: "2026-04-05T06:00:00.000Z",
      updated_at: "2026-04-05T06:01:00.000Z",
      recovered: false,
      timer: {
        status: "running",
        limit_seconds: 1200,
        elapsed_seconds: 30,
        remaining_seconds: 1170
      },
      questions: [
        {
          question_id: "reading-timer-q-1",
          type: "multiple_choice",
          prompt: "Find the matching heading",
          options: ["A", "B", "C"]
        }
      ]
    });
    const getReadingTimer = vi.fn().mockResolvedValue({
      recovered: false,
      timer: {
        status: "running",
        limit_seconds: 1200,
        elapsed_seconds: 60,
        remaining_seconds: 1140
      }
    });
    const pauseReadingTimer = vi.fn().mockResolvedValue({
      timer: {
        status: "paused",
        limit_seconds: 1200,
        elapsed_seconds: 75,
        remaining_seconds: 1125
      }
    });
    const resumeReadingTimer = vi.fn().mockResolvedValue({
      timer: {
        status: "running",
        limit_seconds: 1200,
        elapsed_seconds: 90,
        remaining_seconds: 1110
      }
    });
    const recoverReadingTimer = vi.fn().mockResolvedValue({
      recovered: true,
      timer: {
        status: "running",
        limit_seconds: 1200,
        elapsed_seconds: 105,
        remaining_seconds: 1095
      }
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createPracticeSession,
          switchReadingMode,
          getReadingTimer,
          pauseReadingTimer,
          resumeReadingTimer,
          recoverReadingTimer
        }
      })
    );

    render(<ReadingScreen />);

    fireEvent.click(screen.getByText("创建训练"));

    await waitFor(() => {
      expect(createPracticeSession).toHaveBeenCalledTimes(1);
      expect(screen.getByText((content) => content.includes("session_id: reading-timer-1"))).toBeTruthy();
    });

    fireEvent.click(screen.getByText("考试模式"));
    fireEvent.click(screen.getByText("同步所选模式"));

    await waitFor(() => {
      expect(switchReadingMode).toHaveBeenCalledWith(
        "access-token",
        "reading-timer-1",
        expect.objectContaining({
          training_mode: "exam",
          time_limit_seconds: 1200
        })
      );
      expect(screen.getByText((content) => content.includes("training_mode: exam"))).toBeTruthy();
      expect(screen.getByText("server_sync_status: 已切换到考试模式")).toBeTruthy();
    });

    fireEvent.click(screen.getAllByText("拉取计时状态")[0]);

    await waitFor(() => {
      expect(getReadingTimer).toHaveBeenCalledWith("access-token", "reading-timer-1");
      expect(screen.getByText("running / elapsed 60s / remain 1140s")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("暂停计时"));

    await waitFor(() => {
      expect(pauseReadingTimer).toHaveBeenCalledWith("access-token", "reading-timer-1");
      expect(screen.getByText("paused / elapsed 75s / remain 1125s")).toBeTruthy();
      expect(screen.getByText("server_sync_status: 计时已暂停")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("恢复计时"));

    await waitFor(() => {
      expect(resumeReadingTimer).toHaveBeenCalledWith("access-token", "reading-timer-1");
      expect(screen.getByText("running / elapsed 90s / remain 1110s")).toBeTruthy();
      expect(screen.getByText("server_sync_status: 计时已恢复")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("异常恢复"));

    await waitFor(() => {
      expect(recoverReadingTimer).toHaveBeenCalledWith("access-token", "reading-timer-1");
      expect(screen.getByText("running / elapsed 105s / remain 1095s")).toBeTruthy();
      expect(screen.getByText("server_sync_status: 计时器恢复完成")).toBeTruthy();
      expect(screen.getByText("recovered: true")).toBeTruthy();
    });
  });

  test("reading screen can retry a failed timer refresh", async () => {
    const createPracticeSession = vi.fn().mockResolvedValue({
      session_id: "reading-retry-timer-1",
      skill: "reading",
      task_type: "core_training",
      training_mode: "training",
      mode: "core_training",
      status: "in_progress",
      created_at: "2026-04-05T09:00:00.000Z",
      updated_at: "2026-04-05T09:00:00.000Z",
      timer: {
        status: "running",
        limit_seconds: 1200,
        elapsed_seconds: 0,
        remaining_seconds: 1200
      },
      questions: [
        {
          question_id: "reading-retry-timer-q-1",
          type: "multiple_choice",
          prompt: "Match the heading",
          options: ["A", "B", "C"]
        }
      ]
    });
    const getReadingTimer = vi
      .fn()
      .mockRejectedValueOnce(new Error("计时器服务暂时不可用"))
      .mockResolvedValueOnce({
        recovered: false,
        timer: {
          status: "running",
          limit_seconds: 1200,
          elapsed_seconds: 45,
          remaining_seconds: 1155
        }
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createPracticeSession,
          getReadingTimer
        }
      })
    );

    render(<ReadingScreen />);

    fireEvent.click(screen.getByText("创建训练"));

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("session_id: reading-retry-timer-1"))).toBeTruthy();
    });

    fireEvent.click(screen.getAllByText("拉取计时状态")[0]);

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 拉取计时失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 计时器服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("reading.retryLastFailedAction"));

    await waitFor(() => {
      expect(getReadingTimer).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 已拉取计时器状态")).toBeTruthy();
      expect(screen.getByText("running / elapsed 45s / remain 1155s")).toBeTruthy();
    });
  });

  test("reading screen can retry failed pause, resume and recover timer actions", async () => {
    const createPracticeSession = vi.fn().mockResolvedValue({
      session_id: "reading-retry-controls-1",
      skill: "reading",
      task_type: "core_training",
      training_mode: "exam",
      mode: "core_training",
      status: "in_progress",
      created_at: "2026-04-05T13:00:00.000Z",
      updated_at: "2026-04-05T13:00:00.000Z",
      timer: {
        status: "running",
        limit_seconds: 1200,
        elapsed_seconds: 120,
        remaining_seconds: 1080
      },
      questions: [
        {
          question_id: "reading-retry-controls-q-1",
          type: "multiple_choice",
          prompt: "Match the heading",
          options: ["A", "B", "C"]
        }
      ]
    });
    const pauseReadingTimer = vi
      .fn()
      .mockRejectedValueOnce(new Error("暂停服务暂时不可用"))
      .mockResolvedValueOnce({
        timer: {
          status: "paused",
          limit_seconds: 1200,
          elapsed_seconds: 135,
          remaining_seconds: 1065
        }
      });
    const resumeReadingTimer = vi
      .fn()
      .mockRejectedValueOnce(new Error("恢复服务暂时不可用"))
      .mockResolvedValueOnce({
        timer: {
          status: "running",
          limit_seconds: 1200,
          elapsed_seconds: 150,
          remaining_seconds: 1050
        }
      });
    const recoverReadingTimer = vi
      .fn()
      .mockRejectedValueOnce(new Error("异常恢复服务暂时不可用"))
      .mockResolvedValueOnce({
        recovered: true,
        timer: {
          status: "running",
          limit_seconds: 1200,
          elapsed_seconds: 165,
          remaining_seconds: 1035
        }
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createPracticeSession,
          pauseReadingTimer,
          resumeReadingTimer,
          recoverReadingTimer
        }
      })
    );

    render(<ReadingScreen />);

    fireEvent.click(screen.getByText("创建训练"));

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("session_id: reading-retry-controls-1"))).toBeTruthy();
    });

    fireEvent.click(screen.getByText("暂停计时"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 暂停计时失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 暂停服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("reading.retryLastFailedAction"));

    await waitFor(() => {
      expect(pauseReadingTimer).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 计时已暂停")).toBeTruthy();
      expect(screen.getByText("paused / elapsed 135s / remain 1065s")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("恢复计时"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 恢复计时失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 恢复服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("reading.retryLastFailedAction"));

    await waitFor(() => {
      expect(resumeReadingTimer).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 计时已恢复")).toBeTruthy();
      expect(screen.getByText("running / elapsed 150s / remain 1050s")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("异常恢复"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 异常恢复失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 异常恢复服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("reading.retryLastFailedAction"));

    await waitFor(() => {
      expect(recoverReadingTimer).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 计时器恢复完成")).toBeTruthy();
      expect(screen.getByText("running / elapsed 165s / remain 1035s")).toBeTruthy();
      expect(screen.getByText("recovered: true")).toBeTruthy();
    });
  });

  test("listening screen records study loop activity after submission", async () => {
    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createPracticeSession: vi.fn().mockResolvedValue({
            session_id: "listening-live-1",
            skill: "listening",
            task_type: "core_training",
            training_mode: "training",
            mode: "core_training",
            status: "in_progress",
            created_at: "2026-04-04T00:00:00.000Z",
            updated_at: "2026-04-04T00:00:00.000Z",
            questions: [
              {
                question_id: "listening-q-1",
                type: "multiple_choice",
                prompt: "Pick the right answer",
                options: ["A", "B", "C"]
              }
            ]
          }),
          submitPracticeSession: vi.fn().mockResolvedValue({
            session_id: "listening-live-1",
            skill: "listening",
            task_type: "core_training",
            training_mode: "training",
            mode: "core_training",
            status: "completed",
            created_at: "2026-04-04T00:00:00.000Z",
            updated_at: "2026-04-04T00:10:00.000Z",
            questions: [
              {
                question_id: "listening-q-1",
                type: "multiple_choice",
                prompt: "Pick the right answer",
                options: ["A", "B", "C"]
              }
            ],
            submission: {
              submission_id: "submission-1",
              score_breakdown: {
                correct_count: 1,
                total_questions: 1,
                accuracy: 1,
                mode: "training",
                elapsed_seconds: 90
              },
              question_results: [
                {
                  question_id: "listening-q-1",
                  is_correct: true,
                  user_answer: "A",
                  correct_answer: "A",
                  explanation: "Looks good",
                  error_tags: [],
                  improvement_actions: []
                }
              ]
            }
          })
        }
      })
    );

    renderListeningWithStudyLoop();

    fireEvent.click(screen.getByText("创建训练"));

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("session_id: listening-live-1"))).toBeTruthy();
    });

    fireEvent.change(screen.getByDisplayValue(""), {
      target: { value: "A" }
    });
    fireEvent.click(screen.getByText("提交答案"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 提交完成，正确 1/1")).toBeTruthy();
      expect(screen.getByText("next_action: 先回看学习计划")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("listening.studyLoopNext.primary"));
    expect(router.push).toHaveBeenCalledWith("/plan");
    await waitFor(() => {
      const stored = JSON.parse(
        String(mockedSecureStore.__getMockItem(buildScopedStorageKey("study-loop", "activities", "v1", defaultSession.userId)))
      );
      expect(stored.activities[0]).toMatchObject({
        skill: "listening",
        source: "practice_submission",
        planPending: true,
        progressPending: true
      });
    });
  });

  test("listening screen restores local checkpoint snapshot", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("listening", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        taskType: "dictation",
        session: {
          session_id: "listening-restored-1",
          skill: "listening",
          task_type: "dictation",
          training_mode: "training",
          mode: "core_training",
          status: "in_progress",
          created_at: "2026-03-31T00:00:00.000Z",
          updated_at: "2026-03-31T00:10:00.000Z",
          questions: [
            {
              question_id: "listening-q-1",
              type: "dictation_sentence",
              prompt: "Restored listening question",
              audio_segment_index: 0
            }
          ]
        },
        answers: {
          "listening-q-1": "restored listening answer"
        },
        playbackRate: "1.25",
        segmentIndex: "2",
        positionSeconds: "18",
        replayWrongOnly: true,
        queueCount: 2,
        lastPlaybackSnapshot: {
          playback_rate: 1.25,
          segment_index: 2,
          position_seconds: 18,
          replay_wrong_only: true,
          last_replayed_question_id: "listening-q-1",
          last_recovered_at: "2026-03-31T00:12:00.000Z",
          recovered: true
        },
        updatedAt: "2026-03-31T12:34:56.000Z"
      })
    );

    render(<ListeningScreen />);

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("checkpoint_status: 已恢复"))).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("session_id: listening-restored-1"))).toBeTruthy();
    expect(screen.getByDisplayValue("restored listening answer")).toBeTruthy();
  });

  test("listening screen surfaces sync failures and allows retry", async () => {
    const createPracticeSession = vi
      .fn()
      .mockRejectedValueOnce(new Error("听力服务暂时不可用"))
      .mockResolvedValueOnce({
        session_id: "listening-retry-1",
        skill: "listening",
        task_type: "core_training",
        training_mode: "training",
        mode: "core_training",
        status: "in_progress",
        created_at: "2026-04-04T00:00:00.000Z",
        updated_at: "2026-04-04T00:00:00.000Z",
        questions: [
          {
            question_id: "listening-retry-q-1",
            type: "multiple_choice",
            prompt: "Retry listening question",
            options: ["A", "B", "C"]
          }
        ]
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createPracticeSession
        }
      })
    );

    render(<ListeningScreen />);

    fireEvent.click(screen.getByText("创建训练"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 创建训练失败")).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("server_sync_result: 听力服务暂时不可用"))).toBeTruthy();

    fireEvent.click(screen.getByTestId("listening.retryLastFailedAction"));

    await waitFor(() => {
      expect(createPracticeSession).toHaveBeenCalledTimes(2);
      expect(screen.getByText((content) => content.includes("session_id: listening-retry-1"))).toBeTruthy();
      expect(screen.getByText("server_sync_status: 已创建听力训练，题量 1")).toBeTruthy();
    });
  });

  test("listening screen can save and load playback state", async () => {
    const createPracticeSession = vi.fn().mockResolvedValue({
      session_id: "listening-playback-1",
      skill: "listening",
      task_type: "core_training",
      training_mode: "training",
      mode: "core_training",
      status: "in_progress",
      created_at: "2026-04-05T00:00:00.000Z",
      updated_at: "2026-04-05T00:00:00.000Z",
      questions: [
        {
          question_id: "listening-playback-q-1",
          type: "multiple_choice",
          prompt: "Playback listening question",
          options: ["A", "B", "C"]
        }
      ]
    });
    const updatePlaybackState = vi.fn().mockResolvedValue({
      playback_rate: 1.25,
      segment_index: 3,
      position_seconds: 42,
      replay_wrong_only: true,
      last_replayed_question_id: "listening-playback-q-1",
      last_recovered_at: "2026-04-05T08:30:00.000Z",
      recovered: true
    });
    const getPlaybackState = vi.fn().mockResolvedValue({
      playback_rate: 0.9,
      segment_index: 4,
      position_seconds: 55,
      replay_wrong_only: false,
      last_replayed_question_id: "listening-playback-q-1",
      last_recovered_at: "2026-04-05T08:35:00.000Z",
      recovered: false
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createPracticeSession,
          updatePlaybackState,
          getPlaybackState
        }
      })
    );

    render(<ListeningScreen />);

    fireEvent.click(screen.getByText("创建训练"));

    await waitFor(() => {
      expect(createPracticeSession).toHaveBeenCalledTimes(1);
      expect(screen.getByText((content) => content.includes("session_id: listening-playback-1"))).toBeTruthy();
    });

    fireEvent.change(screen.getByDisplayValue("1"), {
      target: { value: "1.4" }
    });
    const zeroInputs = screen.getAllByDisplayValue("0");
    fireEvent.change(zeroInputs[0], {
      target: { value: "3" }
    });
    fireEvent.change(zeroInputs[1], {
      target: { value: "42" }
    });
    fireEvent.click(screen.getByText("仅重听错题: 关"));
    fireEvent.click(screen.getByText("保存播放状态"));

    await waitFor(() => {
      expect(updatePlaybackState).toHaveBeenCalledWith("access-token", "listening-playback-1", {
        playback_rate: 1.4,
        segment_index: 3,
        position_seconds: 42,
        replay_wrong_only: true
      });
      expect(screen.getByText("server_sync_status: 播放状态已恢复到安全值")).toBeTruthy();
      expect(screen.getByDisplayValue("1.25")).toBeTruthy();
      expect(screen.getByDisplayValue("3")).toBeTruthy();
      expect(screen.getByDisplayValue("42")).toBeTruthy();
    });

    expect(screen.getByText("仅重听错题: 开")).toBeTruthy();
    expect(screen.getByText((content) => content.includes("last_replayed_question_id: listening-playback-q-1"))).toBeTruthy();

    fireEvent.click(screen.getAllByText("加载播放状态")[1]);

    await waitFor(() => {
      expect(getPlaybackState).toHaveBeenCalledWith("access-token", "listening-playback-1");
      expect(screen.getByText("server_sync_status: 已加载播放状态")).toBeTruthy();
      expect(screen.getByDisplayValue("0.9")).toBeTruthy();
      expect(screen.getByDisplayValue("4")).toBeTruthy();
      expect(screen.getByDisplayValue("55")).toBeTruthy();
    });

    expect(screen.getByText("仅重听错题: 关")).toBeTruthy();
    expect(screen.getByText((content) => content.includes("last_replayed_question_id: listening-playback-q-1"))).toBeTruthy();
  });

  test("listening screen can retry failed playback restore and retry queue sync", async () => {
    const createPracticeSession = vi.fn().mockResolvedValue({
      session_id: "listening-retry-actions-1",
      skill: "listening",
      task_type: "core_training",
      training_mode: "training",
      mode: "core_training",
      status: "in_progress",
      created_at: "2026-04-05T00:00:00.000Z",
      updated_at: "2026-04-05T00:00:00.000Z",
      questions: [
        {
          question_id: "listening-retry-actions-q-1",
          type: "multiple_choice",
          prompt: "Retry listening action question",
          options: ["A", "B", "C"]
        }
      ]
    });
    const submitPracticeSession = vi.fn().mockResolvedValue({
      session_id: "listening-retry-actions-1",
      skill: "listening",
      task_type: "core_training",
      training_mode: "training",
      mode: "core_training",
      status: "completed",
      created_at: "2026-04-05T00:00:00.000Z",
      updated_at: "2026-04-05T00:12:00.000Z",
      questions: [
        {
          question_id: "listening-retry-actions-q-1",
          type: "multiple_choice",
          prompt: "Retry listening action question",
          options: ["A", "B", "C"]
        }
      ],
      submission: {
        submission_id: "listening-retry-actions-submission-1",
        score_breakdown: {
          correct_count: 1,
          total_questions: 1,
          accuracy: 1,
          mode: "training",
          elapsed_seconds: 60
        },
        question_results: [
          {
            question_id: "listening-retry-actions-q-1",
            is_correct: true,
            user_answer: "B",
            correct_answer: "B",
            explanation: "Looks good",
            error_tags: [],
            improvement_actions: []
          }
        ]
      }
    });
    const getPlaybackState = vi
      .fn()
      .mockRejectedValueOnce(new Error("播放恢复服务暂时不可用"))
      .mockResolvedValueOnce({
        playback_rate: 1.1,
        segment_index: 1,
        position_seconds: 18,
        replay_wrong_only: true,
        last_replayed_question_id: "listening-retry-actions-q-1",
        last_recovered_at: "2026-04-05T08:40:00.000Z",
        recovered: true
      });
    const addRetryQueue = vi
      .fn()
      .mockRejectedValueOnce(new Error("重练队列服务暂时不可用"))
      .mockResolvedValueOnce({
        items: [{ queue_item_id: "retry-1" }, { queue_item_id: "retry-2" }]
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createPracticeSession,
          submitPracticeSession,
          getPlaybackState,
          addRetryQueue
        }
      })
    );

    render(<ListeningScreen />);

    fireEvent.click(screen.getByText("创建训练"));

    await waitFor(() => {
      expect(createPracticeSession).toHaveBeenCalledTimes(1);
      expect(screen.getByText((content) => content.includes("session_id: listening-retry-actions-1"))).toBeTruthy();
    });

    fireEvent.click(screen.getAllByText("加载播放状态")[1]);

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 加载播放状态失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 播放恢复服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("listening.retryLastFailedAction"));

    await waitFor(() => {
      expect(getPlaybackState).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 已加载并恢复播放状态")).toBeTruthy();
      expect(screen.getByDisplayValue("1.1")).toBeTruthy();
      expect(screen.getByDisplayValue("1")).toBeTruthy();
      expect(screen.getByDisplayValue("18")).toBeTruthy();
    });

    fireEvent.change(screen.getByDisplayValue(""), {
      target: { value: "B" }
    });
    fireEvent.click(screen.getByText("提交答案"));

    await waitFor(() => {
      expect(submitPracticeSession).toHaveBeenCalledTimes(1);
      expect(screen.getByText("server_sync_status: 提交完成，正确 1/1")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("加入重练队列"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 加入重练队列失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 重练队列服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("listening.retryLastFailedAction"));

    await waitFor(() => {
      expect(addRetryQueue).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 已加入重练队列 2 题")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("retry_queue_count: 2"))).toBeTruthy();
    });
  });

  test("listening screen refreshes playback state after app returns to foreground", async () => {
    const createPracticeSession = vi.fn().mockResolvedValue({
      session_id: "listening-foreground-1",
      skill: "listening",
      task_type: "core_training",
      training_mode: "training",
      mode: "core_training",
      status: "in_progress",
      created_at: "2026-04-05T00:00:00.000Z",
      updated_at: "2026-04-05T00:00:00.000Z",
      questions: [
        {
          question_id: "listening-foreground-q-1",
          type: "multiple_choice",
          prompt: "Foreground listening question",
          options: ["A", "B", "C"]
        }
      ]
    });
    const getPlaybackState = vi.fn().mockResolvedValue({
      playback_rate: 1.15,
      segment_index: 2,
      position_seconds: 27,
      replay_wrong_only: true,
      last_replayed_question_id: "listening-foreground-q-1",
      last_recovered_at: "2026-04-05T09:30:00.000Z",
      recovered: false
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createPracticeSession,
          getPlaybackState
        }
      })
    );

    render(<ListeningScreen />);

    fireEvent.click(screen.getByText("创建训练"));

    await waitFor(() => {
      expect(createPracticeSession).toHaveBeenCalledTimes(1);
      expect(screen.getByText((content) => content.includes("session_id: listening-foreground-1"))).toBeTruthy();
    });

    await act(async () => {
      mockedAppState.__emitMockStateChange("background");
      mockedAppState.__emitMockStateChange("active");
    });

    await waitFor(() => {
      expect(getPlaybackState).toHaveBeenCalledTimes(1);
      expect(screen.getByText("server_sync_status: 已加载播放状态")).toBeTruthy();
      expect(screen.getByDisplayValue("1.15")).toBeTruthy();
      expect(screen.getByDisplayValue("2")).toBeTruthy();
      expect(screen.getByDisplayValue("27")).toBeTruthy();
    });

    expect(screen.getByText("仅重听错题: 开")).toBeTruthy();
    expect(screen.getByText((content) => content.includes("last_replayed_question_id: listening-foreground-q-1"))).toBeTruthy();
  });

  test("listening screen can clear restored local checkpoint state", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("listening", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        taskType: "dictation",
        session: {
          session_id: "listening-clear-1",
          skill: "listening",
          task_type: "dictation",
          training_mode: "training",
          mode: "core_training",
          status: "in_progress",
          created_at: "2026-04-05T00:00:00.000Z",
          updated_at: "2026-04-05T00:05:00.000Z",
          questions: [
            {
              question_id: "listening-clear-q-1",
              type: "dictation_sentence",
              prompt: "Listening checkpoint to clear"
            }
          ]
        },
        answers: {
          "listening-clear-q-1": "clear me"
        },
        playbackRate: "1.2",
        segmentIndex: "5",
        positionSeconds: "32",
        replayWrongOnly: true,
        queueCount: 3,
        lastPlaybackSnapshot: {
          playback_rate: 1.2,
          segment_index: 5,
          position_seconds: 32,
          replay_wrong_only: true,
          last_replayed_question_id: "listening-clear-q-1",
          last_recovered_at: "2026-04-05T00:06:00.000Z",
          recovered: false
        },
        updatedAt: "2026-04-05T09:45:00.000Z"
      })
    );

    render(<ListeningScreen />);

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("session_id: listening-clear-1"))).toBeTruthy();
      expect(screen.getByDisplayValue("clear me")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("清空本地会话"));

    await waitFor(() => {
      expect(screen.getByText("checkpoint_status: 本地会话已清空")).toBeTruthy();
      expect(screen.getByText("server_sync_status: 已清空本地听力会话")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("session_id: -"))).toBeTruthy();
      expect(screen.getByText((content) => content.includes("retry_queue_count: 0"))).toBeTruthy();
    });

    expect(screen.queryByDisplayValue("clear me")).toBeNull();
    expect(
      mockedSecureStore.__getMockItem(buildScopedStorageKey("listening", "draft", "v1", defaultSession.userId))
    ).toBeNull();
  });

  test("diagnostic screen restores local checkpoint snapshot", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("diagnostic", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        assessmentId: "diag-restored-1",
        questionId: "diagnostic-q-1",
        questionPrompt: "Restored diagnostic question",
        answer: "restored diagnostic answer",
        status: "in_progress",
        elapsedSeconds: 180,
        progressText: "2/12",
        skillBandText: "-",
        planId: null,
        updatedAt: "2026-03-31T12:34:56.000Z"
      })
    );

    render(<DiagnosticScreen />);

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("checkpoint_status: 已恢复"))).toBeTruthy();
    });
    expect(screen.getByDisplayValue("diag-restored-1")).toBeTruthy();
    expect(screen.getByDisplayValue("restored diagnostic answer")).toBeTruthy();
    expect(screen.getByText("Restored diagnostic question")).toBeTruthy();
  });

  test("diagnostic screen surfaces sync failures and allows retry", async () => {
    const fetchDiagnosticQuestions = vi
      .fn()
      .mockRejectedValueOnce(new Error("诊断服务暂时不可用"))
      .mockResolvedValueOnce({
        assessment_id: "diag-retry-1",
        status: "in_progress",
        answered_count: 2,
        total_questions: 8,
        elapsed_seconds: 120,
        current_question_index: 2,
        questions: [
          {
            question_id: "diagnostic-q-3",
            skill: "writing",
            prompt: "Retry diagnostic question"
          }
        ]
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          fetchDiagnosticQuestions
        }
      })
    );

    render(<DiagnosticScreen />);

    fireEvent.change(screen.getByTestId("diagnostic.assessmentId"), {
      target: { value: "diag-retry-1" }
    });
    fireEvent.click(screen.getByTestId("diagnostic.loadQuestions"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 拉取题目失败")).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("server_sync_result: 诊断服务暂时不可用"))).toBeTruthy();

    fireEvent.click(screen.getByTestId("diagnostic.retryLastFailedAction"));

    await waitFor(() => {
      expect(fetchDiagnosticQuestions).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 题目已同步")).toBeTruthy();
    });
    expect(screen.getByText("Retry diagnostic question")).toBeTruthy();
  });

  test("diagnostic screen guards sync actions until assessment id and question are ready", async () => {
    const fetchDiagnosticQuestions = vi.fn();
    const submitDiagnosticAnswer = vi.fn();
    const pauseDiagnostic = vi.fn();
    const resumeDiagnostic = vi.fn();
    const completeDiagnostic = vi.fn();

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          fetchDiagnosticQuestions,
          submitDiagnosticAnswer,
          pauseDiagnostic,
          resumeDiagnostic,
          completeDiagnostic
        }
      })
    );

    render(<DiagnosticScreen />);

    fireEvent.click(screen.getByTestId("diagnostic.loadQuestions"));

    await waitFor(() => {
      expect(screen.getByText("请先填写 assessment_id")).toBeTruthy();
    });
    expect(fetchDiagnosticQuestions).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("暂停"));
    fireEvent.click(screen.getByText("恢复"));
    fireEvent.click(screen.getByText("完成诊断"));

    expect(pauseDiagnostic).not.toHaveBeenCalled();
    expect(resumeDiagnostic).not.toHaveBeenCalled();
    expect(completeDiagnostic).not.toHaveBeenCalled();
    expect(screen.getByText("请先填写 assessment_id")).toBeTruthy();

    fireEvent.change(screen.getByTestId("diagnostic.assessmentId"), {
      target: { value: "diag-guard-1" }
    });
    fireEvent.click(screen.getByText("提交答案"));

    await waitFor(() => {
      expect(screen.getByText("请先加载题目")).toBeTruthy();
    });
    expect(submitDiagnosticAnswer).not.toHaveBeenCalled();
  });

  test("diagnostic screen submits an answer and refreshes the next question", async () => {
    const fetchDiagnosticQuestions = vi
      .fn()
      .mockResolvedValueOnce({
        assessment_id: "diag-submit-1",
        status: "in_progress",
        answered_count: 0,
        total_questions: 8,
        elapsed_seconds: 120,
        current_question_index: 0,
        questions: [
          {
            question_id: "diagnostic-submit-q-1",
            skill: "reading",
            prompt: "Submit diagnostic question"
          }
        ]
      })
      .mockResolvedValueOnce({
        assessment_id: "diag-submit-1",
        status: "in_progress",
        answered_count: 1,
        total_questions: 8,
        elapsed_seconds: 135,
        current_question_index: 1,
        questions: [
          {
            question_id: "diagnostic-submit-q-2",
            skill: "writing",
            prompt: "Next diagnostic question"
          }
        ]
      });
    const submitDiagnosticAnswer = vi.fn().mockResolvedValue({
      assessment_id: "diag-submit-1",
      answered_count: 1,
      total_questions: 8,
      current_question_index: 1,
      status: "in_progress"
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          fetchDiagnosticQuestions,
          submitDiagnosticAnswer
        }
      })
    );

    render(<DiagnosticScreen />);

    fireEvent.change(screen.getByTestId("diagnostic.assessmentId"), {
      target: { value: "diag-submit-1" }
    });
    fireEvent.click(screen.getByTestId("diagnostic.loadQuestions"));

    await waitFor(() => {
      expect(fetchDiagnosticQuestions).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Submit diagnostic question")).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("输入本题回答"), {
      target: { value: "diagnostic answer" }
    });
    fireEvent.click(screen.getByText("提交答案"));

    await waitFor(() => {
      expect(submitDiagnosticAnswer).toHaveBeenCalledWith(
        "access-token",
        "diag-submit-1",
        "diagnostic-submit-q-1",
        "diagnostic answer"
      );
      expect(fetchDiagnosticQuestions).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Next diagnostic question")).toBeTruthy();
      expect(screen.getByText("question_id: diagnostic-submit-q-2")).toBeTruthy();
      expect(screen.getByText("progress: 1/8")).toBeTruthy();
    });
  });

  test("diagnostic screen can retry failed answer submission", async () => {
    const fetchDiagnosticQuestions = vi
      .fn()
      .mockResolvedValueOnce({
        assessment_id: "diag-submit-retry-1",
        status: "in_progress",
        answered_count: 0,
        total_questions: 6,
        elapsed_seconds: 90,
        current_question_index: 0,
        questions: [
          {
            question_id: "diagnostic-submit-retry-q-1",
            skill: "speaking",
            prompt: "Retry answer diagnostic question"
          }
        ]
      })
      .mockResolvedValueOnce({
        assessment_id: "diag-submit-retry-1",
        status: "in_progress",
        answered_count: 1,
        total_questions: 6,
        elapsed_seconds: 105,
        current_question_index: 1,
        questions: [
          {
            question_id: "diagnostic-submit-retry-q-2",
            skill: "listening",
            prompt: "Retry answer diagnostic question next"
          }
        ]
      });
    const submitDiagnosticAnswer = vi
      .fn()
      .mockRejectedValueOnce(new Error("诊断答题服务暂时不可用"))
      .mockResolvedValueOnce({
        assessment_id: "diag-submit-retry-1",
        answered_count: 1,
        total_questions: 6,
        current_question_index: 1,
        status: "in_progress"
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          fetchDiagnosticQuestions,
          submitDiagnosticAnswer
        }
      })
    );

    render(<DiagnosticScreen />);

    fireEvent.change(screen.getByTestId("diagnostic.assessmentId"), {
      target: { value: "diag-submit-retry-1" }
    });
    fireEvent.click(screen.getByTestId("diagnostic.loadQuestions"));

    await waitFor(() => {
      expect(fetchDiagnosticQuestions).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Retry answer diagnostic question")).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("输入本题回答"), {
      target: { value: "retry diagnostic answer" }
    });
    fireEvent.click(screen.getByText("提交答案"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 提交答案失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 诊断答题服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("diagnostic.retryLastFailedAction"));

    await waitFor(() => {
      expect(submitDiagnosticAnswer).toHaveBeenCalledTimes(2);
      expect(fetchDiagnosticQuestions).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Retry answer diagnostic question next")).toBeTruthy();
      expect(screen.getByText("question_id: diagnostic-submit-retry-q-2")).toBeTruthy();
      expect(screen.getByText("progress: 1/6")).toBeTruthy();
    });
  });

  test("diagnostic screen can retry failed pause, resume and complete actions", async () => {
    const pauseDiagnostic = vi
      .fn()
      .mockRejectedValueOnce(new Error("诊断暂停服务暂时不可用"))
      .mockResolvedValueOnce({
        assessment_id: "diag-retry-actions-1",
        status: "paused",
        elapsed_seconds: 180
      });
    const resumeDiagnostic = vi
      .fn()
      .mockRejectedValueOnce(new Error("诊断恢复服务暂时不可用"))
      .mockResolvedValueOnce({
        assessment_id: "diag-retry-actions-1",
        status: "in_progress",
        elapsed_seconds: 195
      });
    const completeDiagnostic = vi
      .fn()
      .mockRejectedValueOnce(new Error("诊断完成服务暂时不可用"))
      .mockResolvedValueOnce({
        assessment_id: "diag-retry-actions-1",
        plan_id: "plan-retry-actions-1",
        status: "completed",
        elapsed_seconds: 720,
        skill_bands: {
          listening: 6,
          speaking: 5.5,
          reading: 6.5,
          writing: 6
        }
      });
    const fetchDiagnosticQuestions = vi.fn().mockResolvedValue({
      assessment_id: "diag-retry-actions-1",
      status: "in_progress",
      answered_count: 3,
      total_questions: 8,
      elapsed_seconds: 195,
      current_question_index: 3,
      questions: [
        {
          question_id: "diagnostic-resume-q-4",
          skill: "speaking",
          prompt: "Resumed diagnostic question"
        }
      ]
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          pauseDiagnostic,
          resumeDiagnostic,
          completeDiagnostic,
          fetchDiagnosticQuestions
        }
      })
    );

    renderDiagnosticWithStudyLoop();

    fireEvent.change(screen.getByTestId("diagnostic.assessmentId"), {
      target: { value: "diag-retry-actions-1" }
    });

    fireEvent.click(screen.getByText("暂停"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 暂停诊断失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 诊断暂停服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("diagnostic.retryLastFailedAction"));

    await waitFor(() => {
      expect(pauseDiagnostic).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 暂停状态已同步")).toBeTruthy();
      expect(screen.getByText("status: paused")).toBeTruthy();
      expect(screen.getByText("elapsed_seconds: 180")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("恢复"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 恢复诊断失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 诊断恢复服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("diagnostic.retryLastFailedAction"));

    await waitFor(() => {
      expect(resumeDiagnostic).toHaveBeenCalledTimes(2);
      expect(fetchDiagnosticQuestions).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Resumed diagnostic question")).toBeTruthy();
      expect(screen.getByText("question_id: diagnostic-resume-q-4")).toBeTruthy();
      expect(screen.getByText("progress: 3/8")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("完成诊断"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 完成诊断失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 诊断完成服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("diagnostic.retryLastFailedAction"));

    await waitFor(() => {
      expect(completeDiagnostic).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 诊断已完成")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("plan_id: plan-retry-actions-1"))).toBeTruthy();
      expect(screen.getByText((content) => content.includes("skill_bands: L6/S5.5/R6.5/W6"))).toBeTruthy();
    });
  });

  test("diagnostic screen refreshes questions after app returns to foreground", async () => {
    const fetchDiagnosticQuestions = vi
      .fn()
      .mockResolvedValueOnce({
        assessment_id: "diag-foreground-1",
        status: "in_progress",
        answered_count: 1,
        total_questions: 8,
        elapsed_seconds: 150,
        current_question_index: 1,
        questions: [
          {
            question_id: "diagnostic-foreground-q-2",
            skill: "reading",
            prompt: "Foreground diagnostic current question"
          }
        ]
      })
      .mockResolvedValueOnce({
        assessment_id: "diag-foreground-1",
        status: "in_progress",
        answered_count: 2,
        total_questions: 8,
        elapsed_seconds: 195,
        current_question_index: 2,
        questions: [
          {
            question_id: "diagnostic-foreground-q-3",
            skill: "writing",
            prompt: "Foreground diagnostic refreshed question"
          }
        ]
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          fetchDiagnosticQuestions
        }
      })
    );

    render(<DiagnosticScreen />);

    fireEvent.change(screen.getByTestId("diagnostic.assessmentId"), {
      target: { value: "diag-foreground-1" }
    });
    fireEvent.click(screen.getByTestId("diagnostic.loadQuestions"));

    await waitFor(() => {
      expect(fetchDiagnosticQuestions).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Foreground diagnostic current question")).toBeTruthy();
      expect(screen.getByText("progress: 1/8")).toBeTruthy();
    });

    await act(async () => {
      mockedAppState.__emitMockStateChange("background");
      mockedAppState.__emitMockStateChange("active");
    });

    await waitFor(() => {
      expect(fetchDiagnosticQuestions).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Foreground diagnostic refreshed question")).toBeTruthy();
      expect(screen.getByText("question_id: diagnostic-foreground-q-3")).toBeTruthy();
      expect(screen.getByText("progress: 2/8")).toBeTruthy();
      expect(screen.getByText("elapsed_seconds: 195")).toBeTruthy();
    });
  });

  test("diagnostic screen can bootstrap from route params and ignore local checkpoint snapshot", async () => {
    const fetchDiagnosticQuestions = vi.fn().mockResolvedValue({
      assessment_id: "diag-route-param-1",
      status: "in_progress",
      answered_count: 0,
      total_questions: 10,
      elapsed_seconds: 30,
      current_question_index: 0,
      questions: [
        {
          question_id: "diagnostic-route-param-q-1",
          skill: "listening",
          prompt: "Route param diagnostic question"
        }
      ]
    });

    mockedUseLocalSearchParams.mockReturnValue({
      assessmentId: "diag-route-param-1"
    });
    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          fetchDiagnosticQuestions
        }
      })
    );
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("diagnostic", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        assessmentId: "diag-local-ignored-1",
        questionId: "diagnostic-local-ignored-q-1",
        questionPrompt: "Local diagnostic checkpoint should be ignored",
        answer: "stale local answer",
        status: "paused",
        elapsedSeconds: 999,
        progressText: "9/9",
        skillBandText: "L9/S9/R9/W9",
        planId: "plan-local-ignored-1",
        updatedAt: "2026-04-04T12:34:56.000Z"
      })
    );

    render(<DiagnosticScreen />);

    await waitFor(() => {
      expect(fetchDiagnosticQuestions).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Route param diagnostic question")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("checkpoint_status: assessment_id 由路由参数接管"))).toBeTruthy();
    });

    expect(screen.getByDisplayValue("diag-route-param-1")).toBeTruthy();
    expect(screen.getByText("question_id: diagnostic-route-param-q-1")).toBeTruthy();
    expect(screen.queryByText("Local diagnostic checkpoint should be ignored")).toBeNull();
    expect(screen.queryByDisplayValue("stale local answer")).toBeNull();
  });

  test("diagnostic screen can clear restored local checkpoint state", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("diagnostic", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        assessmentId: "diag-clear-1",
        questionId: "diagnostic-clear-q-1",
        questionPrompt: "Diagnostic checkpoint to clear",
        answer: "clear diagnostic answer",
        status: "paused",
        elapsedSeconds: 240,
        progressText: "4/12",
        skillBandText: "L6/S5.5/R6/W5.5",
        planId: "plan-clear-1",
        updatedAt: "2026-04-05T10:20:00.000Z"
      })
    );

    render(<DiagnosticScreen />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("diag-clear-1")).toBeTruthy();
      expect(screen.getByText("Diagnostic checkpoint to clear")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("清空本地中间态"));

    await waitFor(() => {
      expect(screen.getByText("checkpoint_status: 本地中间态已清空")).toBeTruthy();
      expect(screen.getByText("question_id: -")).toBeTruthy();
      expect(screen.getByText("status: 未开始")).toBeTruthy();
      expect(screen.getByText("progress: -")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("plan_id: -"))).toBeTruthy();
    });

    expect(screen.queryByText("Diagnostic checkpoint to clear")).toBeNull();
    expect(screen.queryByDisplayValue("diag-clear-1")).toBeNull();
    expect(screen.queryByDisplayValue("clear diagnostic answer")).toBeNull();
    expect(
      mockedSecureStore.__getMockItem(buildScopedStorageKey("diagnostic", "draft", "v1", defaultSession.userId))
    ).toBeNull();
  });

  test("diagnostic screen records study loop activity after completion", async () => {
    const completeDiagnostic = vi.fn().mockResolvedValue({
      assessment_id: "diag-complete-1",
      plan_id: "plan-from-diagnostic-1",
      status: "completed",
      elapsed_seconds: 540,
      skill_bands: {
        listening: 6,
        speaking: 5.5,
        reading: 6.5,
        writing: 6
      }
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          completeDiagnostic
        }
      })
    );

    renderDiagnosticWithStudyLoop();

    fireEvent.change(screen.getByTestId("diagnostic.assessmentId"), {
      target: { value: "diag-complete-1" }
    });
    fireEvent.click(screen.getByText("完成诊断"));

    await waitFor(() => {
      expect(completeDiagnostic).toHaveBeenCalledTimes(1);
      expect(screen.getByText("server_sync_status: 诊断已完成")).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("plan_id: plan-from-diagnostic-1"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("skill_bands: L6/S5.5/R6.5/W6"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("next_action: 先回看学习计划"))).toBeTruthy();

    fireEvent.click(screen.getByTestId("diagnostic.studyLoopNext.primary"));

    expect(router.push).toHaveBeenCalledWith("/plan");

    await waitFor(() => {
      const stored = JSON.parse(
        String(mockedSecureStore.__getMockItem(buildScopedStorageKey("study-loop", "activities", "v1", defaultSession.userId)))
      );
      expect(stored.activities[0]).toMatchObject({
        skill: "diagnostic",
        source: "diagnostic_completion",
        title: "首次诊断已完成",
        route: "/plan",
        planPending: true,
        progressPending: false
      });
      expect(stored.activities[0].summary).toContain("诊断生成计划 plan-from-diagnostic-1");
      expect(stored.activities[0].summary).toContain("L6/S5.5/R6.5/W6");
    });
  });

  test("diagnostic screen can jump to the generated plan next actionable task after completion", async () => {
    const completeDiagnostic = vi.fn().mockResolvedValue({
      assessment_id: "diag-complete-route-1",
      plan_id: "plan-from-diagnostic-route-1",
      status: "completed",
      elapsed_seconds: 600,
      skill_bands: {
        listening: 6,
        speaking: 6.5,
        reading: 6,
        writing: 5.5
      }
    });
    const fetchActivePlan = vi.fn().mockResolvedValue({
      plan_id: "plan-from-diagnostic-route-1",
      status: "active",
      horizon_weeks: 8,
      version: 6,
      created_at: "2026-04-05T00:00:00.000Z",
      updated_at: "2026-04-05T00:00:00.000Z",
      adjustment_history: [],
      weeks: [
        {
          week_id: "week-1",
          week_no: 1,
          goals: ["先稳定口语表达"],
          tasks: [
            {
              task_id: "task-reading-done-1",
              skill: "reading",
              task_type: "foundation",
              title: "已完成阅读热身",
              target_minutes: 20,
              completion_criteria: "完成 1 次阅读训练",
              day_of_week: 1,
              status: "done"
            },
            {
              task_id: "task-speaking-1",
              skill: "speaking",
              task_type: "foundation",
              title: "首周口语表达打底",
              target_minutes: 40,
              completion_criteria: "完成 1 次口语训练",
              day_of_week: 2,
              status: "todo"
            }
          ]
        }
      ]
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          completeDiagnostic,
          fetchActivePlan
        }
      })
    );

    renderDiagnosticWithStudyLoop();

    fireEvent.change(screen.getByTestId("diagnostic.assessmentId"), {
      target: { value: "diag-complete-route-1" }
    });
    fireEvent.click(screen.getByText("完成诊断"));

    await waitFor(() => {
      expect(completeDiagnostic).toHaveBeenCalledTimes(1);
      expect(fetchActivePlan).toHaveBeenCalledTimes(1);
      expect(screen.getByText("进入口语训练")).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("next_task: 首周口语表达打底"))).toBeTruthy();

    fireEvent.click(screen.getByTestId("diagnostic.nextLearningAction"));

    expect(router.push).toHaveBeenCalledWith("/speaking");
  });

  test("plan screen surfaces sync failures and allows retry", async () => {
    const fetchActivePlan = vi
      .fn()
      .mockRejectedValueOnce(new Error("计划服务暂时不可用"))
      .mockResolvedValueOnce({
        plan_id: "plan-1",
        status: "active",
        horizon_weeks: 8,
        version: 3,
        created_at: "2026-03-28T00:00:00.000Z",
        updated_at: "2026-03-28T00:00:00.000Z",
        adjustment_history: [
          {
            adjustment_id: "adj-1",
            source_type: "practice_session",
            source_id: "session-1",
            skill: "speaking",
            reason: "最近一次模拟表现偏弱，口语任务增加 20 分钟。",
            score: 0.5,
            created_at: "2026-03-28T00:00:00.000Z",
            changed_tasks: [
              {
                task_id: "task-1",
                skill: "speaking",
                before_target_minutes: 45,
                after_target_minutes: 65,
                before_completion_criteria: "完成 1 次独立口语练习",
                after_completion_criteria: "完成 1 次独立口语练习"
              }
            ]
          }
        ],
        weeks: [
          {
            week_id: "week-1",
            week_no: 1,
            goals: ["稳定首周口语输出"],
            tasks: [
              {
                task_id: "task-1",
                skill: "speaking",
                task_type: "foundation",
                title: "首周口语打底",
                target_minutes: 45,
                completion_criteria: "完成 1 次独立口语练习",
                day_of_week: 1,
                status: "todo"
              }
            ]
          }
        ]
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          fetchActivePlan
        }
      })
    );

    render(<PlanScreen />);

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 拉取计划失败")).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("server_sync_result: 计划服务暂时不可用"))).toBeTruthy();

    fireEvent.click(screen.getByTestId("plan.retryLastFailedAction"));

    await waitFor(() => {
      expect(fetchActivePlan).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 计划已加载")).toBeTruthy();
    });
    expect(screen.getByText("首周口语打底")).toBeTruthy();
    expect(screen.getByText((content) => content.includes("plan_id: plan-1"))).toBeTruthy();
  });

  test("plan screen consumes pending study loop refreshes after successful load", async () => {
    const fetchActivePlan = vi.fn().mockResolvedValue({
      plan_id: "plan-2",
      status: "active",
      horizon_weeks: 8,
      version: 4,
      created_at: "2026-04-04T00:00:00.000Z",
      updated_at: "2026-04-04T00:00:00.000Z",
      adjustment_history: [],
      weeks: [
        {
          week_id: "week-1",
          week_no: 1,
          goals: ["先稳定阅读节奏"],
          tasks: [
            {
              task_id: "task-1",
              skill: "reading",
              task_type: "foundation",
              title: "首周阅读节奏训练",
              target_minutes: 50,
              completion_criteria: "完成 1 次阅读训练",
              day_of_week: 1,
              status: "todo"
            }
          ]
        }
      ]
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          fetchActivePlan
        }
      })
    );
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("study-loop", "activities", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        activities: [
          {
            id: "loop-plan-1",
            skill: "reading",
            source: "practice_submission",
            title: "阅读训练已提交",
            summary: "阅读提交 7/10，accuracy 70%",
            route: "/reading",
            planPending: true,
            progressPending: true,
            createdAt: "2026-04-04T12:00:00.000Z",
            updatedAt: "2026-04-04T12:00:00.000Z"
          }
        ]
      })
    );

    renderPlanWithStudyLoop();

    await waitFor(() => {
      expect(
        screen.getByText((content) => content.includes("server_sync_status: 已按最近 1 条训练结果刷新计划"))
      ).toBeTruthy();
    });
    expect(fetchActivePlan).toHaveBeenCalledTimes(1);
    expect(screen.getByText("计划待刷新 0")).toBeTruthy();
    expect(screen.getByText("进度待刷新 1")).toBeTruthy();
    expect(screen.getByText((content) => content.includes("next_action: 继续同步学习进度"))).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes("next_action_detail: 阅读结果已产出，下一步核对进度统计。"))
    ).toBeTruthy();
    expect(screen.getByText("前往学习进度")).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes("action_hint: 计划侧已消化，下一步去进度页核对服务端统计。"))
    ).toBeTruthy();

    fireEvent.click(screen.getByTestId("plan.followUpAction"));

    expect(router.push).toHaveBeenCalledWith("/progress");

    await waitFor(() => {
      const stored = JSON.parse(
        String(mockedSecureStore.__getMockItem(buildScopedStorageKey("study-loop", "activities", "v1", defaultSession.userId)))
      );
      expect(stored.activities[0]).toMatchObject({
        planPending: false,
        progressPending: true
      });
    });
  });

  test("plan screen refreshes after app returns to foreground", async () => {
    const fetchActivePlan = vi
      .fn()
      .mockResolvedValueOnce({
        plan_id: "plan-foreground-1",
        status: "active",
        horizon_weeks: 8,
        version: 5,
        created_at: "2026-04-04T00:00:00.000Z",
        updated_at: "2026-04-04T00:00:00.000Z",
        adjustment_history: [],
        weeks: [
          {
            week_id: "week-1",
            week_no: 1,
            goals: ["先稳定阅读节奏"],
            tasks: [
              {
                task_id: "task-foreground-1",
                skill: "reading",
                task_type: "foundation",
                title: "首周阅读节奏训练",
                target_minutes: 50,
                completion_criteria: "完成 1 次阅读训练",
                day_of_week: 1,
                status: "todo"
              }
            ]
          }
        ]
      })
      .mockResolvedValueOnce({
        plan_id: "plan-foreground-1",
        status: "active",
        horizon_weeks: 8,
        version: 6,
        created_at: "2026-04-04T00:00:00.000Z",
        updated_at: "2026-04-05T00:00:00.000Z",
        adjustment_history: [],
        weeks: [
          {
            week_id: "week-1",
            week_no: 1,
            goals: ["转入口语主线"],
            tasks: [
              {
                task_id: "task-foreground-2",
                skill: "speaking",
                task_type: "foundation",
                title: "首周口语表达打底",
                target_minutes: 60,
                completion_criteria: "完成 1 次口语训练",
                day_of_week: 1,
                status: "todo"
              }
            ]
          }
        ]
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          fetchActivePlan
        }
      })
    );

    renderPlanWithStudyLoop();

    await waitFor(() => {
      expect(screen.getByText("首周阅读节奏训练")).toBeTruthy();
    });
    expect(fetchActivePlan).toHaveBeenCalledTimes(1);

    await act(async () => {
      mockedAppState.__emitMockStateChange("background");
      mockedAppState.__emitMockStateChange("active");
    });

    await waitFor(() => {
      expect(fetchActivePlan).toHaveBeenCalledTimes(2);
      expect(screen.getByText("首周口语表达打底")).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("version: 6"))).toBeTruthy();
    expect(screen.getByText("进入口语训练")).toBeTruthy();
  });

  test("plan screen can jump to the next actionable task training route", async () => {
    const fetchActivePlan = vi.fn().mockResolvedValue({
      plan_id: "plan-route-1",
      status: "active",
      horizon_weeks: 8,
      version: 5,
      created_at: "2026-04-04T00:00:00.000Z",
      updated_at: "2026-04-04T00:00:00.000Z",
      adjustment_history: [],
      weeks: [
        {
          week_id: "week-1",
          week_no: 1,
          goals: ["先稳定阅读节奏"],
          tasks: [
            {
              task_id: "task-route-done-1",
              skill: "speaking",
              task_type: "foundation",
              title: "已完成口语热身",
              target_minutes: 20,
              completion_criteria: "完成 1 次口语训练",
              day_of_week: 1,
              status: "done"
            },
            {
              task_id: "task-route-1",
              skill: "reading",
              task_type: "foundation",
              title: "首周阅读节奏训练",
              target_minutes: 50,
              completion_criteria: "完成 1 次阅读训练",
              day_of_week: 2,
              status: "todo"
            }
          ]
        }
      ]
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          fetchActivePlan
        }
      })
    );

    renderPlanWithStudyLoop();

    await waitFor(() => {
      expect(screen.getByText("首周阅读节奏训练")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("plan.openFirstTask"));

    expect(router.push).toHaveBeenCalledWith("/reading");
  });

  test("plan screen routes diagnostic follow-up back to the first task once plan refresh is consumed", async () => {
    const fetchActivePlan = vi.fn().mockResolvedValue({
      plan_id: "plan-from-diagnostic-followup-1",
      status: "active",
      horizon_weeks: 8,
      version: 5,
      created_at: "2026-04-05T00:00:00.000Z",
      updated_at: "2026-04-05T00:00:00.000Z",
      adjustment_history: [],
      weeks: [
        {
          week_id: "week-1",
          week_no: 1,
          goals: ["先稳定口语表达"],
          tasks: [
            {
              task_id: "task-speaking-followup-1",
              skill: "speaking",
              task_type: "foundation",
              title: "首周口语表达打底",
              target_minutes: 40,
              completion_criteria: "完成 1 次口语训练",
              day_of_week: 1,
              status: "todo"
            }
          ]
        }
      ]
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          fetchActivePlan
        }
      })
    );
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("study-loop", "activities", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        activities: [
          {
            id: "loop-diagnostic-followup-1",
            skill: "diagnostic",
            source: "diagnostic_completion",
            title: "首次诊断已完成",
            summary: "诊断生成计划 plan-from-diagnostic-followup-1，L6/S6/R6/W5.5",
            route: "/plan",
            planPending: false,
            progressPending: false,
            createdAt: "2026-04-05T08:00:00.000Z",
            updatedAt: "2026-04-05T08:00:00.000Z"
          }
        ]
      })
    );

    renderPlanWithStudyLoop();

    await waitFor(() => {
      expect(fetchActivePlan).toHaveBeenCalledTimes(1);
      expect(screen.getByText("首周口语表达打底")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("next_action: 继续最近训练"))).toBeTruthy();
    });

    expect(screen.getByText((content) => content.includes("action_hint: 计划侧已消化，可回到最近训练。"))).toBeTruthy();
    expect(screen.getAllByText("进入口语训练").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("plan.followUpAction"));

    expect(router.push).toHaveBeenCalledWith("/speaking");
  });

  test("plan screen can retry failed task adjustment and adjustment history loading", async () => {
    const fetchActivePlan = vi.fn().mockResolvedValue({
      plan_id: "plan-adjust-1",
      status: "active",
      horizon_weeks: 8,
      version: 6,
      created_at: "2026-04-05T00:00:00.000Z",
      updated_at: "2026-04-05T00:00:00.000Z",
      adjustment_history: [
        {
          adjustment_id: "adj-initial-1",
          source_type: "practice_session",
          source_id: "session-initial-1",
          skill: "reading",
          reason: "先保持当前阅读负荷",
          score: 0.7,
          created_at: "2026-04-05T00:00:00.000Z",
          changed_tasks: []
        }
      ],
      weeks: [
        {
          week_id: "week-1",
          week_no: 1,
          goals: ["先稳定阅读节奏"],
          tasks: [
            {
              task_id: "task-adjust-1",
              skill: "reading",
              task_type: "foundation",
              title: "首周阅读节奏训练",
              target_minutes: 50,
              completion_criteria: "完成 1 次阅读训练",
              day_of_week: 1,
              status: "todo"
            }
          ]
        }
      ]
    });
    const adjustPlanTask = vi
      .fn()
      .mockRejectedValueOnce(new Error("计划调整服务暂时不可用"))
      .mockResolvedValueOnce({
        plan_id: "plan-adjust-1",
        status: "active",
        horizon_weeks: 8,
        version: 7,
        created_at: "2026-04-05T00:00:00.000Z",
        updated_at: "2026-04-05T01:00:00.000Z",
        adjustment_history: [
          {
            adjustment_id: "adj-adjusted-1",
            source_type: "manual",
            source_id: "manual-adjust-1",
            skill: "reading",
            reason: "阅读分钟数已上调到 70 分钟",
            score: 0.8,
            created_at: "2026-04-05T01:00:00.000Z",
            changed_tasks: []
          }
        ],
        weeks: [
          {
            week_id: "week-1",
            week_no: 1,
            goals: ["先稳定阅读节奏"],
            tasks: [
              {
                task_id: "task-adjust-1",
                skill: "reading",
                task_type: "foundation",
                title: "首周阅读节奏训练",
                target_minutes: 70,
                completion_criteria: "完成 1 次阅读训练",
                day_of_week: 1,
                status: "todo"
              }
            ]
          }
        ]
      });
    const getPlanAdjustmentHistory = vi
      .fn()
      .mockRejectedValueOnce(new Error("历史服务暂时不可用"))
      .mockResolvedValueOnce({
        total: 3,
        page: 1,
        page_size: 20,
        items: [
          {
            adjustment_id: "adj-history-3",
            source_type: "manual",
            source_id: "manual-adjust-3",
            skill: "reading",
            reason: "最近三次调整后，阅读任务时长提高到 70 分钟",
            score: 0.85,
            created_at: "2026-04-05T02:00:00.000Z",
            changed_tasks: []
          }
        ]
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          fetchActivePlan,
          adjustPlanTask,
          getPlanAdjustmentHistory
        }
      })
    );

    renderPlanWithStudyLoop();

    await waitFor(() => {
      expect(fetchActivePlan).toHaveBeenCalledTimes(1);
      expect(screen.getByText((content) => content.includes("plan_id: plan-adjust-1"))).toBeTruthy();
    });

    fireEvent.change(screen.getByDisplayValue("50"), {
      target: { value: "70" }
    });
    fireEvent.click(screen.getByText("更新任务时长"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 更新任务失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 计划调整服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("plan.retryLastFailedAction"));

    await waitFor(() => {
      expect(adjustPlanTask).toHaveBeenCalledTimes(2);
      expect(adjustPlanTask).toHaveBeenCalledWith("access-token", "plan-adjust-1", "task-adjust-1", {
        target_minutes: 70
      });
      expect(screen.getByText("server_sync_status: 计划已更新，version=7")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("version: 7"))).toBeTruthy();
      expect(screen.getByText((content) => content.includes("70 分钟 · 完成 1 次阅读训练"))).toBeTruthy();
    });

    fireEvent.click(screen.getByText("加载历史"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 加载历史失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 历史服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("plan.retryLastFailedAction"));

    await waitFor(() => {
      expect(getPlanAdjustmentHistory).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 已加载计划变更历史")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("adjustment_count: 3"))).toBeTruthy();
      expect(screen.getByText((content) => content.includes("reason: 最近三次调整后，阅读任务时长提高到 70 分钟"))).toBeTruthy();
    });
  });

  test("progress screen consumes pending study loop refreshes after successful load", async () => {
    const getProgress = vi.fn().mockResolvedValue({
      listening_completed: 3,
      speaking_completed: 2,
      reading_completed: 4,
      writing_completed: 1,
      total_study_minutes: 240,
      streak_days: 6,
      server_version: 9,
      updated_at: "2026-04-04T12:30:00.000Z",
      last_synced_device_id: "mobile-ios"
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          getProgress
        }
      })
    );
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("study-loop", "activities", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        activities: [
          {
            id: "loop-progress-1",
            skill: "writing",
            source: "writing_evaluation",
            title: "写作批改已完成",
            summary: "写作批改 overall 6.5，TR6/CC6.5/LR6.5/GRA7",
            route: "/writing",
            planPending: false,
            progressPending: true,
            createdAt: "2026-04-04T12:00:00.000Z",
            updatedAt: "2026-04-04T12:00:00.000Z"
          }
        ]
      })
    );

    renderProgressWithStudyLoop();

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 已按最近 1 条训练结果刷新进度")).toBeTruthy();
    });
    expect(getProgress).toHaveBeenCalledTimes(1);
    expect(screen.getByText("计划待刷新 0")).toBeTruthy();
    expect(screen.getByText("进度待刷新 0")).toBeTruthy();
    expect(screen.getByText((content) => content.includes("next_action: 继续最近训练"))).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes("next_action_detail: 最近完成了写作，可以回到原页面继续。"))
    ).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes("action_hint: 进度侧已消化，可回到最近训练继续推进。"))
    ).toBeTruthy();
    expect(screen.getByText("回到写作训练")).toBeTruthy();
    fireEvent.click(screen.getByTestId("progress.followUpAction"));
    expect(router.push).toHaveBeenCalledWith("/writing");
    await waitFor(() => {
      const stored = JSON.parse(
        String(mockedSecureStore.__getMockItem(buildScopedStorageKey("study-loop", "activities", "v1", defaultSession.userId)))
      );
      expect(stored.activities[0]).toMatchObject({
        planPending: false,
        progressPending: false
      });
    });
  });

  test("progress screen routes completed diagnostic follow-up back to plan with matching label", async () => {
    const getProgress = vi.fn().mockResolvedValue({
      listening_completed: 3,
      speaking_completed: 3,
      reading_completed: 3,
      writing_completed: 3,
      total_study_minutes: 210,
      streak_days: 6,
      server_version: 11,
      updated_at: "2026-04-05T10:00:00.000Z",
      last_synced_device_id: "mobile-ios"
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          getProgress
        }
      })
    );
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("study-loop", "activities", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        activities: [
          {
            id: "loop-progress-diagnostic-1",
            skill: "diagnostic",
            source: "diagnostic_completion",
            title: "首次诊断已完成",
            summary: "诊断生成计划 plan-progress-followup-1，L6/S6/R6/W5.5",
            route: "/plan",
            planPending: false,
            progressPending: false,
            createdAt: "2026-04-05T09:50:00.000Z",
            updatedAt: "2026-04-05T09:50:00.000Z"
          }
        ]
      })
    );

    renderProgressWithStudyLoop();

    await waitFor(() => {
      expect(getProgress).toHaveBeenCalledTimes(1);
      expect(screen.getByText((content) => content.includes("next_action: 继续最近训练"))).toBeTruthy();
    });

    expect(screen.getByText((content) => content.includes("action_hint: 进度侧已消化，下一步回计划页查看任务调整。"))).toBeTruthy();
    expect(screen.getByTestId("progress.followUpAction")).toBeTruthy();
    expect(screen.queryByText("回到诊断训练")).toBeNull();

    fireEvent.click(screen.getByTestId("progress.followUpAction"));

    expect(router.push).toHaveBeenCalledWith("/plan");
  });

  test("progress screen keeps follow-up route aligned with plan-oriented next action", async () => {
    const getProgress = vi.fn().mockResolvedValue({
      listening_completed: 2,
      speaking_completed: 2,
      reading_completed: 2,
      writing_completed: 2,
      total_study_minutes: 180,
      streak_days: 5,
      server_version: 12,
      updated_at: "2026-04-05T11:00:00.000Z",
      last_synced_device_id: "mobile-ios"
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          getProgress
        }
      })
    );
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("study-loop", "activities", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        activities: [
          {
            id: "loop-progress-plan-focused-1",
            skill: "writing",
            source: "writing_evaluation",
            title: "写作批改已完成",
            summary: "写作结果待计划侧消化",
            route: "/writing",
            planPending: true,
            progressPending: false,
            createdAt: "2026-04-05T10:50:00.000Z",
            updatedAt: "2026-04-05T10:50:00.000Z"
          }
        ]
      })
    );

    renderProgressWithStudyLoop();

    await waitFor(() => {
      expect(getProgress).toHaveBeenCalledTimes(1);
      expect(screen.getByText((content) => content.includes("next_action: 先回看学习计划"))).toBeTruthy();
    });

    expect(screen.getByText((content) => content.includes("action_hint: 进度侧已消化，下一步回计划页查看任务调整。"))).toBeTruthy();
    expect(screen.getByText("回到学习计划")).toBeTruthy();

    fireEvent.click(screen.getByTestId("progress.followUpAction"));
    expect(router.push).toHaveBeenCalledWith("/plan");
  });

  test("progress screen surfaces sync failures and allows retry", async () => {
    const getProgress = vi
      .fn()
      .mockRejectedValueOnce(new Error("进度服务暂时不可用"))
      .mockResolvedValueOnce({
        listening_completed: 3,
        speaking_completed: 2,
        reading_completed: 4,
        writing_completed: 1,
        total_study_minutes: 240,
        streak_days: 6,
        server_version: 9,
        updated_at: "2026-04-04T12:30:00.000Z",
        last_synced_device_id: "mobile-ios"
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          getProgress
        }
      })
    );

    renderProgressWithStudyLoop();

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 刷新进度失败")).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("server_sync_result: 进度服务暂时不可用"))).toBeTruthy();

    fireEvent.click(screen.getByTestId("progress.retryLastFailedAction"));

    await waitFor(() => {
      expect(getProgress).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 已加载服务端进度")).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("server_version: 9"))).toBeTruthy();
  });

  test("progress screen refreshes after app returns to foreground", async () => {
    const getProgress = vi
      .fn()
      .mockResolvedValueOnce({
        listening_completed: 3,
        speaking_completed: 2,
        reading_completed: 4,
        writing_completed: 1,
        total_study_minutes: 240,
        streak_days: 6,
        server_version: 9,
        updated_at: "2026-04-04T12:30:00.000Z",
        last_synced_device_id: "mobile-ios"
      })
      .mockResolvedValueOnce({
        listening_completed: 4,
        speaking_completed: 2,
        reading_completed: 4,
        writing_completed: 2,
        total_study_minutes: 300,
        streak_days: 7,
        server_version: 10,
        updated_at: "2026-04-05T09:00:00.000Z",
        last_synced_device_id: "mobile-ios"
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          getProgress
        }
      })
    );

    renderProgressWithStudyLoop();

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("server_version: 9"))).toBeTruthy();
    });
    expect(getProgress).toHaveBeenCalledTimes(1);

    await act(async () => {
      mockedAppState.__emitMockStateChange("background");
      mockedAppState.__emitMockStateChange("active");
    });

    await waitFor(() => {
      expect(getProgress).toHaveBeenCalledTimes(2);
      expect(screen.getByText((content) => content.includes("server_version: 10"))).toBeTruthy();
    });
    expect(screen.getByDisplayValue("300")).toBeTruthy();
    expect(screen.getByDisplayValue("7")).toBeTruthy();
  });

  test("progress screen keeps training follow-up after a clean sync", async () => {
    const getProgress = vi.fn().mockResolvedValue({
      listening_completed: 1,
      speaking_completed: 2,
      reading_completed: 3,
      writing_completed: 4,
      total_study_minutes: 120,
      streak_days: 5,
      server_version: 8,
      updated_at: "2026-04-04T12:30:00.000Z",
      last_synced_device_id: "mobile-ios"
    });
    const syncProgress = vi.fn().mockResolvedValue({
      listening_completed: 2,
      speaking_completed: 2,
      reading_completed: 3,
      writing_completed: 4,
      total_study_minutes: 180,
      streak_days: 6,
      server_version: 9,
      updated_at: "2026-04-05T09:30:00.000Z",
      last_synced_device_id: "mobile-ios",
      stale_request: false,
      conflict_count: 0
    });
    const getProgressConflicts = vi.fn().mockResolvedValue({
      items: []
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          getProgress,
          syncProgress,
          getProgressConflicts
        }
      })
    );
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("study-loop", "activities", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        activities: [
          {
            id: "loop-progress-clean-sync-1",
            skill: "listening",
            source: "practice_submission",
            title: "听力训练已提交",
            summary: "听力提交 8/10，accuracy 80%",
            route: "/listening",
            planPending: false,
            progressPending: true,
            createdAt: "2026-04-05T09:00:00.000Z",
            updatedAt: "2026-04-05T09:00:00.000Z"
          }
        ]
      })
    );

    renderProgressWithStudyLoop();

    await waitFor(() => {
      expect(getProgress).toHaveBeenCalledTimes(1);
      expect(screen.getByDisplayValue("120")).toBeTruthy();
    });

    fireEvent.click(screen.getAllByText("同步进度")[0]);

    await waitFor(() => {
      expect(syncProgress).toHaveBeenCalledTimes(1);
      expect(getProgressConflicts).toHaveBeenCalledTimes(1);
      expect(screen.getByText("server_sync_status: 同步成功")).toBeTruthy();
    });

    expect(screen.getByText((content) => content.includes("next_action: 继续最近训练"))).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes("next_action_detail: 最近完成了听力，可以回到原页面继续。"))
    ).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes("action_hint: 进度侧已消化，可回到最近训练继续推进。"))
    ).toBeTruthy();
    expect(screen.getByText("回到听力训练")).toBeTruthy();

    fireEvent.click(screen.getByTestId("progress.followUpAction"));

    expect(router.push).toHaveBeenCalledWith("/listening");

    await waitFor(() => {
      const stored = JSON.parse(
        String(mockedSecureStore.__getMockItem(buildScopedStorageKey("study-loop", "activities", "v1", defaultSession.userId)))
      );
      expect(stored.activities[0]).toMatchObject({
        planPending: false,
        progressPending: false
      });
    });
  });

  test("progress screen syncs server snapshot back into editable fields and consumes pending refreshes", async () => {
    const getProgress = vi.fn().mockResolvedValue({
      listening_completed: 1,
      speaking_completed: 2,
      reading_completed: 3,
      writing_completed: 4,
      total_study_minutes: 120,
      streak_days: 5,
      server_version: 8,
      updated_at: "2026-04-04T12:30:00.000Z",
      last_synced_device_id: "mobile-ios"
    });
    const syncProgress = vi.fn().mockResolvedValue({
      listening_completed: 4,
      speaking_completed: 3,
      reading_completed: 5,
      writing_completed: 6,
      total_study_minutes: 300,
      streak_days: 7,
      server_version: 9,
      updated_at: "2026-04-05T09:30:00.000Z",
      last_synced_device_id: "mobile-ios",
      stale_request: true,
      conflict_count: 2
    });
    const getProgressConflicts = vi.fn().mockResolvedValue({
      items: [
        {
          id: "conflict-1",
          field: "total_study_minutes",
          incoming_value: 999,
          server_value: 300,
          client_updated_at: "2026-04-05T09:20:00.000Z",
          server_updated_at: "2026-04-05T09:25:00.000Z"
        },
        {
          id: "conflict-2",
          field: "streak_days",
          incoming_value: 12,
          server_value: 7,
          client_updated_at: "2026-04-05T09:20:00.000Z",
          server_updated_at: "2026-04-05T09:25:00.000Z"
        }
      ]
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          getProgress,
          syncProgress,
          getProgressConflicts
        }
      })
    );
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("study-loop", "activities", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        activities: [
          {
            id: "loop-progress-sync-1",
            skill: "listening",
            source: "practice_submission",
            title: "听力训练已提交",
            summary: "听力提交 8/10，accuracy 80%",
            route: "/listening",
            planPending: false,
            progressPending: true,
            createdAt: "2026-04-05T09:00:00.000Z",
            updatedAt: "2026-04-05T09:00:00.000Z"
          }
        ]
      })
    );

    renderProgressWithStudyLoop();

    await waitFor(() => {
      expect(getProgress).toHaveBeenCalledTimes(1);
      expect(screen.getByDisplayValue("120")).toBeTruthy();
    });

    fireEvent.change(screen.getByDisplayValue("120"), {
      target: { value: "999" }
    });
    fireEvent.change(screen.getByDisplayValue("5"), {
      target: { value: "12" }
    });
    fireEvent.click(screen.getAllByText("同步进度")[0]);

    await waitFor(() => {
      expect(syncProgress).toHaveBeenCalledTimes(1);
      expect(syncProgress).toHaveBeenCalledWith(
        "access-token",
        expect.objectContaining({
          device_id: expect.stringMatching(/^mobile-/),
          progress: expect.objectContaining({
            total_study_minutes: 999,
            streak_days: 12
          })
        })
      );
      expect(getProgressConflicts).toHaveBeenCalledTimes(1);
      expect(screen.getByText("server_sync_status: 同步请求为旧版本，已回退服务端数据")).toBeTruthy();
      expect(screen.getByDisplayValue("300")).toBeTruthy();
      expect(screen.getByDisplayValue("7")).toBeTruthy();
      expect(screen.getByDisplayValue("4")).toBeTruthy();
      expect(screen.getByText("conflicts 2")).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("next_action: 先回看学习计划"))).toBeTruthy();
    expect(
      screen.getByText((content) =>
        content.includes("next_action_detail: 服务端进度已覆盖本地修改，下一步先回计划页核对当前任务。")
      )
    ).toBeTruthy();
    expect(
      screen.getByText((content) =>
        content.includes("action_hint: 服务端进度已覆盖本地修改，下一步先回计划页核对当前任务。")
      )
    ).toBeTruthy();
    expect(screen.getByTestId("progress.followUpAction")).toBeTruthy();
    expect(screen.getByText((content) => content.includes("conflict_summary_count: 2"))).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes("conflict_1: 总学习分钟数 本地 999 / 服务端 300"))
    ).toBeTruthy();
    expect(
      screen.getByText((content) =>
        content.includes("conflict_1_suggestion: 累计分钟冲突通常来自跨端重复同步，先回计划页确认最近训练是否已消化。")
      )
    ).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes("conflict_2: 连续学习天数 本地 12 / 服务端 7"))
    ).toBeTruthy();
    expect(
      screen.getByText((content) =>
        content.includes("conflict_2_suggestion: 连续天数冲突通常来自跨端打卡顺序差异，先回计划页确认当前主线。")
      )
    ).toBeTruthy();
    expect(screen.getByText("回看学习计划")).toBeTruthy();

    fireEvent.click(screen.getByTestId("progress.followUpAction"));

    expect(router.push).toHaveBeenCalledWith("/plan");

    await waitFor(() => {
      const stored = JSON.parse(
        String(mockedSecureStore.__getMockItem(buildScopedStorageKey("study-loop", "activities", "v1", defaultSession.userId)))
      );
      expect(stored.activities[0]).toMatchObject({
        planPending: false,
        progressPending: false
      });
    });
  });

  test("progress screen can retry failed conflict history loading", async () => {
    const getProgress = vi.fn().mockResolvedValue({
      listening_completed: 2,
      speaking_completed: 2,
      reading_completed: 2,
      writing_completed: 2,
      total_study_minutes: 180,
      streak_days: 4,
      server_version: 6,
      updated_at: "2026-04-04T08:00:00.000Z",
      last_synced_device_id: "mobile-ios"
    });
    const getProgressConflicts = vi
      .fn()
      .mockRejectedValueOnce(new Error("冲突历史服务暂时不可用"))
      .mockResolvedValueOnce({
        items: [
          {
            id: "conflict-history-1",
            field: "reading_completed",
            incoming_value: 5,
            server_value: 2,
            client_updated_at: "2026-04-05T08:00:00.000Z",
            server_updated_at: "2026-04-05T08:05:00.000Z"
          }
        ]
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          getProgress,
          getProgressConflicts
        }
      })
    );

    renderProgressWithStudyLoop();

    await waitFor(() => {
      expect(getProgress).toHaveBeenCalledTimes(1);
      expect(screen.getByText((content) => content.includes("server_version: 6"))).toBeTruthy();
    });

    fireEvent.click(screen.getByText("加载冲突历史"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 加载冲突失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 冲突历史服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("progress.retryLastFailedAction"));

    await waitFor(() => {
      expect(getProgressConflicts).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 已加载冲突历史")).toBeTruthy();
      expect(screen.getByText("conflicts 1")).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("conflict_summary_count: 1"))).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes("conflict_1: 阅读完成数 本地 5 / 服务端 2"))
    ).toBeTruthy();
    expect(
      screen.getByText((content) =>
        content.includes("conflict_1_suggestion: 优先检查最近一次阅读提交是否重复写回。")
      )
    ).toBeTruthy();
    expect(screen.getByText("核对阅读训练")).toBeTruthy();

    fireEvent.click(screen.getByTestId("progress.conflictFollowUpAction"));

    expect(router.push).toHaveBeenCalledWith("/reading");
  });

  test("account screen loads profile and export/delete controls", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());

    renderAccountScreen();

    expect(screen.getByText("账户中心已进入移动端")).toBeTruthy();
    expect(screen.getByText((content) => content.includes("user-1"))).toBeTruthy();
    expect(screen.getByText("account_ready")).toBeTruthy();
    expect(screen.getByText("未加载")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("notification_permission: 已授权"))).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("remote_device_status: 当前设备未登记"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("app_version: 1.0.0-test"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("native_build: 1"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("ws_base_url: ws://127.0.0.1:8787"))).toBeTruthy();
    expect(screen.getByText("导出并分享")).toBeTruthy();
    expect(screen.getByText("立即删除")).toBeTruthy();
  });

  test("account screen can share runtime diagnostics", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());

    renderAccountScreen();

    fireEvent.click(screen.getByTestId("account.shareRuntimeDiagnostics"));

    await waitFor(() => {
      expect(mockedShare.share).toHaveBeenCalledTimes(1);
    });
    expect(mockedShare.share).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "IELTS Mobile runtime diagnostics",
        message: expect.stringContaining("app_version: 1.0.0-test")
      })
    );
    expect(mockedShare.share).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("ws_base_url: ws://127.0.0.1:8787")
      })
    );
    expect(screen.getByText("已分享构建诊断")).toBeTruthy();
  });

  test("account screen can schedule local reminder notification", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());

    renderAccountScreen();

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("notification_permission: 已授权"))).toBeTruthy();
    });

    fireEvent.click(screen.getByText("刷新提醒建议"));

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("reminder_id: rem-1"))).toBeTruthy();
    });

    fireEvent.click(screen.getByText("安排本地提醒"));

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("local_reminder: 已安排"))).toBeTruthy();
    });

    const scheduled = mockedNotifications.__getMockScheduledNotifications();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.content.title).toBe("IELTS 学习提醒");
    expect(scheduled[0]?.content.data?.deepLink).toBe("/plan");
  });

  test("account screen offers a system settings shortcut after notification permission is denied", async () => {
    mockedNotifications.__setMockNotificationPermission({
      granted: false,
      canAskAgain: false,
      status: "denied",
      ios: {
        status: 1
      }
    });
    mockedUseAppSession.mockReturnValue(createSessionContext());

    renderAccountScreen();

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("notification_permission: 已拒绝"))).toBeTruthy();
    });
    expect(screen.getByText("打开系统通知设置")).toBeTruthy();

    fireEvent.click(screen.getByTestId("account.reminderOpenSettings"));

    await waitFor(() => {
      expect(mockedLinking.openSettings).toHaveBeenCalledTimes(1);
      expect(screen.getByText("已打开系统设置")).toBeTruthy();
    });
  });

  test("account screen can sync and revoke remote reminder device", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(buildScopedStorageKey("installation", "id", "v1"), JSON.stringify("installation-ios-1"));
    mockedNotifications.__setMockDevicePushToken({
      type: "ios",
      data: "native-token-abcdef1234567890"
    });

    renderAccountScreen();

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("remote_installation_id: installation-ios-1"))).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("remote_device_counts: 0/0"))).toBeTruthy();

    fireEvent.click(screen.getByText("同步远程设备"));

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("remote_device_status: granted"))).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("remote_provider: apns"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("remote_token_preview: native...7890"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("remote_environment: development"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("remote_device_counts: 1/1"))).toBeTruthy();

    fireEvent.click(screen.getByText("撤销远程设备"));

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("remote_device_status: 当前设备未登记"))).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("remote_device_counts: 0/0"))).toBeTruthy();
  });

  test("account screen shows the latest remote delivery attempt for current device", async () => {
    mockedSecureStore.__setMockItem(buildScopedStorageKey("installation", "id", "v1"), JSON.stringify("installation-ios-1"));
    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        reminderDevices: [
          {
            installation_id: "installation-ios-1",
            platform: "ios",
            permission_status: "granted",
            push_provider: "apns",
            push_token_preview: "native...7890",
            environment: "production",
            delivery_ready: true,
            created_at: "2026-04-02T00:00:00.000Z",
            updated_at: "2026-04-02T00:00:00.000Z",
            last_delivery_attempt: {
              attempt_id: "attempt-1",
              reminder_id: "rem-1",
              status: "failed",
              push_provider: "apns",
              failure_code: "RATE_LIMITED",
              failure_message: "APNS: 429: TooManyRequests",
              retry_count: 2,
              created_at: "2026-04-02T01:00:00.000Z",
              updated_at: "2026-04-02T01:00:00.000Z"
            }
          }
        ]
      })
    );

    renderAccountScreen();

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("remote_last_delivery_status: failed"))).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("remote_last_delivery_failure_code: RATE_LIMITED"))).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes("remote_last_delivery_failure_message: APNS: 429: TooManyRequests"))
    ).toBeTruthy();
    expect(screen.getByText((content) => content.includes("remote_last_delivery_retry_count: 2"))).toBeTruthy();
  });

  test("account screen can update minor guardian state for existing users", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());

    renderAccountScreen();

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("minor_guardian_age_band: 未设置"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("account.minorGuardianMinor"));

    await waitFor(() => {
      expect(screen.getByText("未成年人使用提示")).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("minor_guardian_notice: 待确认"))).toBeTruthy();

    fireEvent.click(screen.getByTestId("minorGuardian.acknowledge"));

    await waitFor(() => {
      expect(screen.queryByText("未成年人使用提示")).toBeNull();
    });
    expect(screen.getByText((content) => content.includes("minor_guardian_notice: 已确认"))).toBeTruthy();

    fireEvent.click(screen.getByTestId("account.minorGuardianAdult"));

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("minor_guardian_age_band: 已满 18 周岁"))).toBeTruthy();
    });
    expect(
      JSON.parse(String(mockedSecureStore.__getMockItem(buildScopedStorageKey("minor_guardian"))))
    ).toMatchObject({
      ageBand: "adult",
      source: "account"
    });
  });

  test("account screen can submit minor guardian support request", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());

    renderAccountScreen();

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("support_request_count: 0"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("account.guardianSupportTopicDataDeletion"));
    fireEvent.click(screen.getByTestId("account.guardianSupportChannelEmail"));
    fireEvent.change(screen.getByTestId("account.guardianSupportContactValue"), {
      target: { value: "guardian@example.com" }
    });
    fireEvent.change(screen.getByTestId("account.guardianSupportMessage"), {
      target: { value: "请协助说明监护人如何导出并删除学习数据。" }
    });
    fireEvent.click(screen.getByTestId("account.guardianSupportSubmit"));

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("support_request_count: 1"))).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("support_request_latest_topic: 删除数据"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("support_request_latest_status: 待处理"))).toBeTruthy();
    expect(screen.getByText("已提交监护人联络申请")).toBeTruthy();
  });

  test("account screen can disable reminder preference and clear local reminder", async () => {
    const getReminderPreference = vi.fn().mockResolvedValue({
      subscribed: true,
      active_hour_utc: 12,
      updated_at: "2026-04-05T00:00:00.000Z"
    });
    const getReminderRecommendation = vi.fn().mockResolvedValue({
      subscribed: true,
      active_hour_utc: 12,
      reminder_id: "rem-disable-1",
      scheduled_at: "2026-04-05T12:00:00.000Z",
      reason: "今日任务仍未完成",
      deep_link: "/plan"
    });
    const updateReminderPreference = vi.fn().mockResolvedValue({
      subscribed: false,
      active_hour_utc: 12,
      updated_at: "2026-04-05T01:00:00.000Z"
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          getReminderPreference,
          getReminderRecommendation,
          updateReminderPreference
        }
      })
    );

    renderAccountScreen();

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("notification_permission: 已授权"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("account.reminderRefresh"));

    await waitFor(() => {
      expect(getReminderPreference).toHaveBeenCalledTimes(1);
      expect(getReminderRecommendation).toHaveBeenCalledTimes(1);
      expect(screen.getByText((content) => content.includes("reminder_id: rem-disable-1"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("account.reminderScheduleLocal"));

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("local_reminder: 已安排"))).toBeTruthy();
    });
    expect(mockedNotifications.__getMockScheduledNotifications()).toHaveLength(1);

    fireEvent.click(screen.getByText("切为关闭"));
    fireEvent.click(screen.getByTestId("account.reminderSave"));

    await waitFor(() => {
      expect(updateReminderPreference).toHaveBeenCalledTimes(1);
      expect(screen.getByText("提醒已关闭，已清空本地提醒")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("local_reminder: 未安排本地提醒"))).toBeTruthy();
    });
    expect(mockedNotifications.__getMockScheduledNotifications()).toHaveLength(0);
  });

  test("account screen can click reminder and refresh the stored deep link", async () => {
    const getReminderPreference = vi.fn().mockResolvedValue({
      subscribed: true,
      active_hour_utc: 12,
      updated_at: "2026-04-05T00:00:00.000Z"
    });
    const getReminderRecommendation = vi.fn().mockResolvedValue({
      subscribed: true,
      active_hour_utc: 12,
      reminder_id: "rem-click-1",
      scheduled_at: "2026-04-05T12:00:00.000Z",
      reason: "继续完成今天的学习计划",
      deep_link: "/plan"
    });
    const clickReminder = vi.fn().mockResolvedValue({
      reminder_id: "rem-click-1",
      deep_link: "/progress",
      plan_id: "plan-1",
      task_id: "task-1",
      clicked_at: "2026-04-05T12:05:00.000Z"
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          getReminderPreference,
          getReminderRecommendation,
          clickReminder
        }
      })
    );

    renderAccountScreen();

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("notification_permission: 已授权"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("account.reminderRefresh"));

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("reminder_id: rem-click-1"))).toBeTruthy();
      expect(screen.getByText((content) => content.includes("deep_link: /plan"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("account.reminderClick"));

    await waitFor(() => {
      expect(clickReminder).toHaveBeenCalledWith("access-token", "rem-click-1");
      expect(screen.getByText((content) => content.includes("deep_link: /progress"))).toBeTruthy();
      expect(screen.getByText("已记录提醒点击")).toBeTruthy();
    });
  });

  test("account screen can refresh local and remote reminder states", async () => {
    const installationId = "installation-ios-refresh-1";
    const listReminderDevices = vi
      .fn()
      .mockResolvedValueOnce({
        total_count: 0,
        deliverable_count: 0,
        items: []
      })
      .mockResolvedValueOnce({
        total_count: 1,
        deliverable_count: 1,
        items: [
          {
            installation_id: installationId,
            platform: "ios",
            permission_status: "granted",
            push_provider: "apns",
            push_token_preview: "native...7890",
            environment: "production",
            delivery_ready: true,
            created_at: "2026-04-05T00:00:00.000Z",
            updated_at: "2026-04-05T00:10:00.000Z"
          }
        ]
      });

    mockedSecureStore.__setMockItem(buildScopedStorageKey("installation", "id", "v1"), JSON.stringify(installationId));
    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          listReminderDevices
        }
      })
    );

    renderAccountScreen();

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("remote_installation_id: installation-ios-refresh-1"))).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("local_reminder: 未安排本地提醒"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("remote_device_status: 当前设备未登记"))).toBeTruthy();

    await mockedNotifications.scheduleNotificationAsync({
      content: {
        title: "IELTS 学习提醒",
        body: "打开进度页继续任务",
        data: {
          kind: "study-reminder",
          deepLink: "/progress",
          reminderId: "rem-refresh-1",
          scheduledAt: "2026-04-06T08:00:00.000Z"
        }
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date("2026-04-06T08:00:00.000Z")
      }
    });

    fireEvent.click(screen.getByTestId("account.reminderRefreshLocalState"));

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("local_reminder: 已安排"))).toBeTruthy();
      expect(screen.getByText((content) => content.includes("local_target: /progress"))).toBeTruthy();
      expect(screen.getByText((content) => content.includes("local_reminder_id: rem-refresh-1"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("account.reminderRefreshRemoteState"));

    await waitFor(() => {
      expect(listReminderDevices).toHaveBeenCalledTimes(2);
      expect(screen.getByText((content) => content.includes("remote_device_status: granted"))).toBeTruthy();
      expect(screen.getByText((content) => content.includes("remote_provider: apns"))).toBeTruthy();
      expect(screen.getByText((content) => content.includes("remote_environment: production"))).toBeTruthy();
      expect(screen.getByText((content) => content.includes("remote_device_counts: 1/1"))).toBeTruthy();
    });
  });

  test("account screen can refresh minor guardian support request status", async () => {
    const listMinorGuardianSupportRequests = vi
      .fn()
      .mockResolvedValueOnce({
        total_count: 0,
        items: []
      })
      .mockResolvedValueOnce({
        total_count: 1,
        items: [
          {
            request_id: "guardian-support-2",
            topic: "usage_concern",
            contact_channel: "email",
            contact_value: "guardian@example.com",
            message: "希望了解未成年人使用策略。",
            status: "contacted",
            created_at: "2026-04-05T05:00:00.000Z",
            updated_at: "2026-04-05T05:30:00.000Z"
          }
        ]
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          listMinorGuardianSupportRequests
        }
      })
    );

    renderAccountScreen();

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("support_request_count: 0"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("account.guardianSupportRefresh"));

    await waitFor(() => {
      expect(listMinorGuardianSupportRequests).toHaveBeenCalledTimes(2);
      expect(screen.getByText((content) => content.includes("support_request_count: 1"))).toBeTruthy();
      expect(screen.getByText((content) => content.includes("support_request_latest_topic: 使用疑虑"))).toBeTruthy();
      expect(screen.getByText((content) => content.includes("support_request_latest_status: 已联系"))).toBeTruthy();
    });
  });

  test("account screen can request deletion", async () => {
    const requestDeletion = vi.fn().mockResolvedValue({
      user_id: defaultSession.userId,
      status: "pending_deletion",
      deletion_requested_at: "2026-04-05T02:00:00.000Z"
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          requestDeletion
        }
      })
    );

    renderAccountScreen();

    await waitFor(() => {
      expect(screen.getByText("account_ready")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("account.requestDeletion"));

    await waitFor(() => {
      expect(requestDeletion).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("account.requestDeletionSuccess")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("deletion_requested_at: 2026-04-05T02:00:00.000Z"))).toBeTruthy();
    });
  });

  test("account screen can delete account and show completion summary", async () => {
    const deleteAccount = vi.fn().mockResolvedValue({
      user_id: defaultSession.userId,
      status: "deleted",
      deleted_at: "2026-04-05T03:00:00.000Z",
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
    });
    const sessionContext = createSessionContext({
      apiClient: {
        deleteAccount
      }
    });
    const logout = vi.fn().mockResolvedValue(undefined);

    mockedUseAppSession.mockReturnValue({
      ...sessionContext,
      logout
    } as ReturnType<typeof useAppSession>);

    renderAccountScreen();

    await waitFor(() => {
      expect(screen.getByText("account_ready")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("account.deleteNow"));

    await waitFor(() => {
      expect(deleteAccount).toHaveBeenCalledTimes(1);
      expect(logout).toHaveBeenCalledTimes(1);
      expect(screen.getByText("账号删除已完成")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("deleted_at: 2026-04-05T03:00:00.000Z"))).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("revoked_sessions: 2"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("removed_mock_exam_reports: 1"))).toBeTruthy();
  });

  test("account deleted summary provides login and instance exit routes", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());

    renderAccountScreen();

    await waitFor(() => {
      expect(screen.getByText("account_ready")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("account.deleteNow"));

    await waitFor(() => {
      expect(screen.getByText("账号删除已完成")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("account.deleted.backLogin"));
    fireEvent.click(screen.getByTestId("account.deleted.switchInstance"));

    expect(router.replace).toHaveBeenCalledWith("/login");
    expect(router.replace).toHaveBeenCalledWith("/instance");
  });

  test("speaking screen renders permission gate and live controls", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());

    render(<SpeakingScreen />);

    expect(screen.getByText("实时口语已进入移动端")).toBeTruthy();
    expect(screen.getByText("麦克风权限")).toBeTruthy();
    expect(screen.getByText("授权麦克风")).toBeTruthy();
    expect(screen.getByText("连接实时会话")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("已授权")).toBeTruthy();
    });
  });

  test("speaking screen offers a system settings shortcut after microphone permission is denied", async () => {
    vi.mocked(Audio.getRecordingPermissionsAsync).mockResolvedValueOnce({
      status: "denied" as Awaited<ReturnType<typeof Audio.getRecordingPermissionsAsync>>["status"],
      granted: false,
      canAskAgain: false,
      expires: "never"
    } as Awaited<ReturnType<typeof Audio.getRecordingPermissionsAsync>>);
    mockedUseAppSession.mockReturnValue(createSessionContext());

    render(<SpeakingScreen />);

    await waitFor(() => {
      expect(screen.getByText("已拒绝")).toBeTruthy();
    });
    expect(screen.getByText("打开系统麦克风设置")).toBeTruthy();

    fireEvent.click(screen.getByTestId("speaking.microphoneOpenSettings"));

    await waitFor(() => {
      expect(mockedLinking.openSettings).toHaveBeenCalledTimes(1);
      expect(screen.getAllByText("已打开系统设置").length).toBeGreaterThan(0);
    });
  });

  test("speaking screen surfaces sync failures and allows retry", async () => {
    const createSpeakingSession = vi
      .fn()
      .mockRejectedValueOnce(new Error("口语服务暂时不可用"))
      .mockResolvedValueOnce({
        session_id: "speaking-retry-1",
        status: "created",
        task_type: "core_training",
        resume_token: "resume-speaking-retry-1",
        current_part: 1,
        topic: "Describe a recent IELTS preparation experience.",
        turns: 0,
        created_at: "2026-04-04T00:00:00.000Z",
        updated_at: "2026-04-04T00:00:00.000Z"
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createSpeakingSession
        }
      })
    );

    render(<SpeakingScreen />);

    fireEvent.click(screen.getByText("创建口语会话"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 创建会话失败")).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("server_sync_result: 口语服务暂时不可用"))).toBeTruthy();

    fireEvent.click(screen.getByTestId("speaking.retryLastFailedAction"));

    await waitFor(() => {
      expect(createSpeakingSession).toHaveBeenCalledTimes(2);
      expect(screen.getByText((content) => content.includes("session_id: speaking-retry-1"))).toBeTruthy();
      expect(screen.getByText("server_sync_status: 已创建实时口语会话")).toBeTruthy();
    });
  });

  test("speaking screen restores local checkpoint snapshot", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("speaking", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        taskType: "role_play",
        scenarioType: "job_interview",
        topic: "Describe a job interview that challenged you.",
        transcript: "I prepared examples before the interview.",
        sessionState: {
          session_id: "speaking-restored-1",
          status: "disconnected",
          task_type: "role_play",
          scenario_type: "job_interview",
          resume_token: "resume-speaking-1",
          resume_until: "2026-03-31T12:50:00.000Z",
          current_part: 2,
          topic: "Describe a job interview that challenged you.",
          turns: 6,
          created_at: "2026-03-31T12:00:00.000Z",
          updated_at: "2026-03-31T12:10:00.000Z"
        },
        resumeToken: "resume-speaking-1",
        scenarioItems: [
          {
            scenario_type: "job_interview",
            title: "求职面试",
            opening_prompt: "Tell me about a time you solved a difficult problem.",
            npc_role: "Interviewer"
          }
        ],
        currentPart: 2,
        scoreText: "F6 / L6 / G6 / P6",
        suggestions: ["Use more specific examples"],
        latencyMs: 320,
        traceCount: 4,
        recentEvents: ["session_resume", "score_update"],
        comparisonText: "ΔF0.5 ΔL0.5 ΔG0.5 ΔP0.5",
        heatmapText: "top_word=problem(2) / top_phoneme=p(3)",
        replaySegmentCount: 2,
        pronunciationTasks: [
          {
            taskId: "task-1",
            title: "Practice /p/",
            description: "Focus on plosive release.",
            phoneme: "p",
            status: "todo",
            linkedTurnNos: [2]
          }
        ],
        trackedTaskText: "task-1:todo",
        reconnectIntent: false,
        updatedAt: "2026-03-31T12:34:56.000Z"
      })
    );

    render(<SpeakingScreen />);

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("checkpoint_status: 已恢复"))).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("session_id: speaking-restored-1"))).toBeTruthy();
    expect(screen.getByDisplayValue("Describe a job interview that challenged you.")).toBeTruthy();
    expect(screen.getByDisplayValue("I prepared examples before the interview.")).toBeTruthy();
  });

  test("speaking screen records study loop activity after session end", async () => {
    const createSpeakingSession = vi.fn().mockResolvedValue({
      session_id: "speaking-live-1",
      status: "created",
      task_type: "core_training",
      resume_token: "resume-speaking-live-1",
      resume_until: "2026-04-05T10:30:00.000Z",
      current_part: 1,
      topic: "Describe a recent IELTS preparation experience.",
      turns: 0,
      created_at: "2026-04-05T10:00:00.000Z",
      updated_at: "2026-04-05T10:00:00.000Z"
    });
    const endSpeakingSession = vi.fn().mockResolvedValue({
      session_id: "speaking-live-1",
      status: "ended",
      resume_until: "2026-04-05T10:30:00.000Z",
      turns: 6,
      summary: {
        fluency: 6.5,
        lexical: 6,
        grammar: 6,
        pronunciation: 6.5,
        turns: 6
      },
      created_at: "2026-04-05T10:00:00.000Z",
      updated_at: "2026-04-05T10:12:00.000Z",
      ended_at: "2026-04-05T10:12:00.000Z"
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createSpeakingSession,
          endSpeakingSession
        }
      })
    );

    renderSpeakingWithStudyLoop();

    await waitFor(() => {
      expect(screen.getByText("已授权")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("创建口语会话"));

    await waitFor(() => {
      expect(createSpeakingSession).toHaveBeenCalledTimes(1);
      expect(screen.getByText((content) => content.includes("session_id: speaking-live-1"))).toBeTruthy();
    });

    fireEvent.click(screen.getByText("结束会话"));

    await waitFor(() => {
      expect(endSpeakingSession).toHaveBeenCalledTimes(1);
      expect(screen.getByText("server_sync_status: 会话结束")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("next_action: 先回看学习计划"))).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("speaking.studyLoopNext.primary"));
    expect(router.push).toHaveBeenCalledWith("/plan");

    await waitFor(() => {
      const stored = JSON.parse(
        String(mockedSecureStore.__getMockItem(buildScopedStorageKey("study-loop", "activities", "v1", defaultSession.userId)))
      );
      expect(stored.activities[0]).toMatchObject({
        skill: "speaking",
        source: "speaking_session_end",
        title: "口语会话已完成",
        route: "/speaking",
        planPending: true,
        progressPending: true
      });
      expect(stored.activities[0].summary).toContain("口语完成 F6.5 / L6 / G6 / P6.5");
      expect(stored.activities[0].summary).toContain("turns 6");
    });
  });

  test("speaking screen loads pronunciation feedback and tracks the first task", async () => {
    const createSpeakingSession = vi.fn().mockResolvedValue({
      session_id: "speaking-feedback-1",
      status: "created",
      task_type: "core_training",
      resume_token: "resume-speaking-feedback-1",
      resume_until: "2026-04-05T11:30:00.000Z",
      current_part: 1,
      topic: "Describe a speaking habit you want to improve.",
      turns: 0,
      created_at: "2026-04-05T11:00:00.000Z",
      updated_at: "2026-04-05T11:00:00.000Z"
    });
    const getSpeakingPronunciationFeedback = vi.fn().mockResolvedValue({
      turns: [
        {
          turn_no: 1,
          part_no: 1,
          word_issues: [
            {
              word: "practice",
              position: 1,
              phoneme: "/r/",
              severity: "high",
              issue_tag: "sample",
              suggestion: "Stress the ending consonant.",
              replay_segment_id: "turn-1-seg-1"
            }
          ],
          phoneme_issues: [
            {
              phoneme: "/r/",
              issue_tag: "r_coloring_inconsistent",
              suggestion: "Stabilize the tongue shape.",
              severity: "high",
              count: 3,
              example_words: ["practice"]
            }
          ],
          replay_segments: [
            {
              segment_id: "turn-1-seg-1",
              turn_no: 1,
              start_ms: 0,
              end_ms: 900,
              reference_text: "practice",
              user_text: "practice",
              reference_audio_url: "https://ref.example/practice",
              user_audio_url: "https://user.example/practice"
            },
            {
              segment_id: "turn-1-seg-2",
              turn_no: 1,
              start_ms: 901,
              end_ms: 1600,
              reference_text: "regularly",
              user_text: "regularly",
              reference_audio_url: "https://ref.example/regularly",
              user_audio_url: "https://user.example/regularly"
            }
          ]
        }
      ],
      hotspot_words: [
        {
          word: "practice",
          count: 2,
          max_severity: "high"
        }
      ],
      hotspot_phonemes: [
        {
          phoneme: "/r/",
          issue_tag: "r_coloring_inconsistent",
          suggestion: "Stabilize the tongue shape.",
          severity: "high",
          count: 3,
          example_words: ["practice"]
        }
      ],
      tasks: [
        {
          task_id: "pron-r",
          title: "纠音任务 /r/",
          description: "Focus on the /r/ sound in practice.",
          phoneme: "/r/",
          status: "todo",
          linked_turn_nos: [1]
        }
      ]
    });
    const trackSpeakingPronunciationTask = vi.fn().mockResolvedValue({
      task_id: "pron-r",
      status: "done",
      linked_turn_nos: [1]
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createSpeakingSession,
          getSpeakingPronunciationFeedback,
          trackSpeakingPronunciationTask
        }
      })
    );

    render(<SpeakingScreen />);

    await waitFor(() => {
      expect(screen.getByText("已授权")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("创建口语会话"));

    await waitFor(() => {
      expect(createSpeakingSession).toHaveBeenCalledTimes(1);
      expect(screen.getByText((content) => content.includes("session_id: speaking-feedback-1"))).toBeTruthy();
    });

    fireEvent.click(screen.getByText("拉取发音热力图"));

    await waitFor(() => {
      expect(getSpeakingPronunciationFeedback).toHaveBeenCalledWith("access-token", "speaking-feedback-1");
      expect(
        screen.getByText((content) => content.includes("pronunciation_heatmap: top_word=practice(2) / top_phoneme=/r/(3)"))
      ).toBeTruthy();
      expect(screen.getByText("replay_segment_count: 2")).toBeTruthy();
      expect(screen.getByText("pronunciation_task_count: 1")).toBeTruthy();
      expect(screen.getByText("纠音任务 /r/ · todo")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("标记首个纠音任务完成"));

    await waitFor(() => {
      expect(trackSpeakingPronunciationTask).toHaveBeenCalledWith(
        "access-token",
        "speaking-feedback-1",
        "pron-r",
        "done"
      );
      expect(screen.getByText("tracked_task: pron-r:done")).toBeTruthy();
      expect(screen.getByText("纠音任务 /r/ · done")).toBeTruthy();
    });
  });

  test("speaking screen can switch part, create a retry session, and load comparison plus events", async () => {
    const createSpeakingSession = vi.fn().mockResolvedValue({
      session_id: "speaking-core-1",
      status: "created",
      task_type: "core_training",
      resume_token: "resume-speaking-core-1",
      resume_until: "2026-04-05T12:30:00.000Z",
      current_part: 1,
      topic: "Describe a recent IELTS preparation experience.",
      turns: 0,
      created_at: "2026-04-05T12:00:00.000Z",
      updated_at: "2026-04-05T12:00:00.000Z"
    });
    const switchSpeakingPart = vi.fn().mockResolvedValue({
      session_id: "speaking-core-1",
      current_part: 3,
      status: "created",
      updated_at: "2026-04-05T12:01:00.000Z"
    });
    const createSpeakingRetrySession = vi.fn().mockResolvedValue({
      session_id: "speaking-retry-2",
      status: "created",
      task_type: "core_training",
      resume_token: "resume-speaking-retry-2",
      resume_until: "2026-04-05T12:45:00.000Z",
      source_session_id: "speaking-core-1",
      current_part: 1,
      topic: "Describe a recent IELTS preparation experience.",
      turns: 0,
      created_at: "2026-04-05T12:02:00.000Z",
      updated_at: "2026-04-05T12:02:00.000Z"
    });
    const getSpeakingComparison = vi.fn().mockResolvedValue({
      source_session_id: "speaking-core-1",
      retry_session_id: "speaking-retry-2",
      source_scores: {
        fluency: 5.5,
        lexical: 5.5,
        grammar: 5.5,
        pronunciation: 5.5
      },
      retry_scores: {
        fluency: 6,
        lexical: 6,
        grammar: 5.5,
        pronunciation: 5.8
      },
      delta: {
        fluency: 0.5,
        lexical: 0.5,
        grammar: 0,
        pronunciation: 0.3
      },
      next_actions: ["continue drilling"]
    });
    const getSpeakingSessionEvents = vi.fn().mockResolvedValue({
      items: [{ type: "session_created" }, { type: "part_switch" }, { type: "session_end" }]
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createSpeakingSession,
          switchSpeakingPart,
          createSpeakingRetrySession,
          getSpeakingComparison,
          getSpeakingSessionEvents
        }
      })
    );

    render(<SpeakingScreen />);

    await waitFor(() => {
      expect(screen.getByText("已授权")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("创建口语会话"));

    await waitFor(() => {
      expect(createSpeakingSession).toHaveBeenCalledTimes(1);
      expect(screen.getByText((content) => content.includes("session_id: speaking-core-1"))).toBeTruthy();
    });

    fireEvent.click(screen.getByText("切到 Part3"));

    await waitFor(() => {
      expect(switchSpeakingPart).toHaveBeenCalledWith("access-token", "speaking-core-1", 3);
      expect(screen.getByText("current_part: 3")).toBeTruthy();
      expect(screen.getByText("server_sync_status: 已切换到 Part 3")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("同题再答"));

    await waitFor(() => {
      expect(createSpeakingRetrySession).toHaveBeenCalledWith("access-token", "speaking-core-1");
      expect(screen.getByText((content) => content.includes("session_id: speaking-retry-2"))).toBeTruthy();
      expect(screen.getByText((content) => content.includes("source_session_id: speaking-core-1"))).toBeTruthy();
    });

    fireEvent.click(screen.getByText("拉取前后对比"));

    await waitFor(() => {
      expect(getSpeakingComparison).toHaveBeenCalledWith("access-token", "speaking-retry-2");
      expect(screen.getByText("comparison: ΔF0.5 ΔL0.5 ΔG0 ΔP0.3")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("拉取会话日志"));

    await waitFor(() => {
      expect(getSpeakingSessionEvents).toHaveBeenCalledWith("access-token", "speaking-retry-2");
      expect(screen.getByText("event_trace_count: 3")).toBeTruthy();
      expect(
        screen.getByText((content) => content.includes("recent_events: session_created , part_switch , session_end"))
      ).toBeTruthy();
    });
  });

  test("speaking screen retries switch part with the original target part", async () => {
    const createSpeakingSession = vi.fn().mockResolvedValue({
      session_id: "speaking-switch-retry-1",
      status: "created",
      task_type: "core_training",
      resume_token: "resume-speaking-switch-retry-1",
      resume_until: "2026-04-05T13:00:00.000Z",
      current_part: 1,
      topic: "Describe a recent IELTS preparation experience.",
      turns: 0,
      created_at: "2026-04-05T12:30:00.000Z",
      updated_at: "2026-04-05T12:30:00.000Z"
    });
    const switchSpeakingPart = vi
      .fn()
      .mockRejectedValueOnce(new Error("Part 切换服务暂时不可用"))
      .mockResolvedValueOnce({
        session_id: "speaking-switch-retry-1",
        current_part: 3,
        status: "created",
        updated_at: "2026-04-05T12:31:00.000Z"
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createSpeakingSession,
          switchSpeakingPart
        }
      })
    );

    render(<SpeakingScreen />);

    await waitFor(() => {
      expect(screen.getByText("已授权")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("创建口语会话"));
    await waitFor(() => {
      expect(createSpeakingSession).toHaveBeenCalledTimes(1);
      expect(screen.getByText((content) => content.includes("session_id: speaking-switch-retry-1"))).toBeTruthy();
    });

    fireEvent.click(screen.getByText("切到 Part3"));
    await waitFor(() => {
      expect(switchSpeakingPart).toHaveBeenCalledTimes(1);
      expect(screen.getByText("server_sync_status: 切换 Part失败")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("speaking.retryLastFailedAction"));
    await waitFor(() => {
      expect(switchSpeakingPart).toHaveBeenCalledTimes(2);
      expect(switchSpeakingPart).toHaveBeenNthCalledWith(1, "access-token", "speaking-switch-retry-1", 3);
      expect(switchSpeakingPart).toHaveBeenNthCalledWith(2, "access-token", "speaking-switch-retry-1", 3);
      expect(screen.getByText("current_part: 3")).toBeTruthy();
      expect(screen.getByText("server_sync_status: 已切换到 Part 3")).toBeTruthy();
    });
  });

  test("writing screen restores local draft snapshot", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("writing", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        taskType: "task1",
        prompt: "Restored prompt",
        essay: "Restored essay body",
        rewriteEssay: "Restored rewrite essay",
        evaluationId: "writing-eval-1",
        comparisonDelta: {
          tr: 0.5,
          cc: 0.5,
          lr: 0.5,
          gra: 0.5,
          overall: 0.5
        },
        selectedTemplateId: "template-1",
        templateInsertionMode: "prepend",
        templatePreservedOriginal: true,
        templateAdoptionText: "total=3, top=template-1, rate=0.8",
        updatedAt: "2026-03-31T12:34:56.000Z"
      })
    );

    render(<WritingScreen />);

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("draft_status: 已恢复"))).toBeTruthy();
    });
    expect(screen.getByDisplayValue("Restored prompt")).toBeTruthy();
    expect(screen.getByDisplayValue("Restored essay body")).toBeTruthy();
    expect(screen.getByDisplayValue("Restored rewrite essay")).toBeTruthy();
    expect(screen.getByDisplayValue("writing-eval-1")).toBeTruthy();
  });

  test("writing screen records study loop activity after rewrite evaluation", async () => {
    const rewriteWriting = vi.fn().mockResolvedValue({
      evaluation: {
        evaluation_id: "writing-rewrite-eval-2",
        task_type: "task2",
        prompt: "Some people think students should learn practical skills at school.",
        essay: "Improved rewrite essay",
        scores: {
          tr: 6.5,
          cc: 6.5,
          lr: 6.5,
          gra: 6.5,
          overall: 6.5
        },
        suggestions: [],
        latency_ms: 820,
        fallback_triggered: false,
        created_at: "2026-04-04T14:00:00.000Z",
        updated_at: "2026-04-04T14:00:00.000Z"
      },
      comparison: {
        source_evaluation_id: "writing-eval-2",
        rewrite_evaluation_id: "writing-rewrite-eval-2",
        source_scores: {
          tr: 6,
          cc: 6,
          lr: 6,
          gra: 6,
          overall: 6
        },
        rewrite_scores: {
          tr: 6.5,
          cc: 6.5,
          lr: 6.5,
          gra: 6.5,
          overall: 6.5
        },
        delta: {
          tr: 0.5,
          cc: 0.5,
          lr: 0.5,
          gra: 0.5,
          overall: 0.5
        },
        next_actions: ["继续压缩论证冗余句"]
      },
      archive: {
        archive_id: "writing-archive-2",
        task_type: "task2",
        source_evaluation_id: "writing-eval-2",
        rewrite_evaluation_id: "writing-rewrite-eval-2",
        delta_overall: 0.5,
        created_at: "2026-04-04T14:00:00.000Z"
      }
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          rewriteWriting
        }
      })
    );
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("writing", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        taskType: "task2",
        prompt: "Some people think students should learn practical skills at school.",
        essay: "Original essay body",
        rewriteEssay: "Improved rewrite essay",
        evaluationId: "writing-eval-2",
        comparisonDelta: null,
        selectedTemplateId: "",
        templateInsertionMode: "append",
        templatePreservedOriginal: false,
        templateAdoptionText: "-",
        updatedAt: "2026-04-04T13:55:00.000Z"
      })
    );

    renderWritingWithStudyLoop();

    await waitFor(() => {
      expect(screen.getByDisplayValue("writing-eval-2")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("改写复评"));

    await waitFor(() => {
      expect(rewriteWriting).toHaveBeenCalledTimes(1);
      expect(screen.getByText("server_sync_status: 改写复评完成")).toBeTruthy();
      expect(screen.getByText("next_action: 先回看学习计划")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("writing.studyLoopNext.primary"));
    expect(router.push).toHaveBeenCalledWith("/plan");

    await waitFor(() => {
      const stored = JSON.parse(
        String(mockedSecureStore.__getMockItem(buildScopedStorageKey("study-loop", "activities", "v1", defaultSession.userId)))
      );
      expect(stored.activities[0]).toMatchObject({
        skill: "writing",
        source: "writing_rewrite",
        title: "写作改写复评已完成",
        route: "/writing",
        planPending: true,
        progressPending: true
      });
      expect(stored.activities[0].summary).toContain("写作改写 overall 6.5");
      expect(stored.activities[0].summary).toContain("ΔOverall0.5");
    });
  });

  test("writing screen surfaces sync failures and allows retry", async () => {
    const evaluateWriting = vi
      .fn()
      .mockRejectedValueOnce(new Error("写作评估服务暂时不可用"))
      .mockResolvedValueOnce({
        evaluation_id: "writing-eval-retry-1",
        task_type: "task2",
        prompt: "Some people think students should learn practical skills at school.",
        essay:
          "I strongly agree with this statement because practical skills can help students adapt to real life more effectively.",
        scores: {
          tr: 6.5,
          cc: 6.5,
          lr: 6.5,
          gra: 6.5,
          overall: 6.5
        },
        suggestions: [],
        latency_ms: 780,
        fallback_triggered: false,
        created_at: "2026-04-04T14:00:00.000Z",
        updated_at: "2026-04-04T14:00:00.000Z"
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          evaluateWriting
        }
      })
    );

    renderWritingWithStudyLoop();

    fireEvent.click(screen.getByText("提交写作批改"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 写作批改失败")).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("server_sync_result: 写作评估服务暂时不可用"))).toBeTruthy();

    fireEvent.click(screen.getByTestId("writing.retryLastFailedAction"));

    await waitFor(() => {
      expect(evaluateWriting).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 写作批改完成，overall=6.5")).toBeTruthy();
    });
    expect(screen.getByDisplayValue("writing-eval-retry-1")).toBeTruthy();
  });

  test("writing screen can load templates, insert one, refresh adoption, reload evaluation and archives", async () => {
    const evaluateWriting = vi.fn().mockResolvedValue({
      evaluation_id: "writing-eval-template-1",
      task_type: "task2",
      prompt: "Some people think students should learn practical skills at school.",
      essay: "Original essay body with template support.",
      scores: {
        tr: 6,
        cc: 6,
        lr: 6,
        gra: 5.5,
        overall: 6
      },
      suggestions: [
        {
          suggestion_id: "suggestion-1",
          issue: "Examples are too general",
          evidence_sentence: "Students need practical skills.",
          recommendation: "Use a specific classroom example.",
          revised_sample: "For example, budgeting projects can connect school learning to daily life."
        }
      ],
      latency_ms: 640,
      fallback_triggered: false,
      created_at: "2026-04-05T07:00:00.000Z",
      updated_at: "2026-04-05T07:00:00.000Z"
    });
    const getWritingEvaluation = vi.fn().mockResolvedValue({
      evaluation_id: "writing-eval-template-1",
      task_type: "task2",
      prompt: "Some people think students should learn practical skills at school.",
      essay: "Original essay body with template support.",
      scores: {
        tr: 6,
        cc: 6,
        lr: 6,
        gra: 5.5,
        overall: 6
      },
      suggestions: [
        {
          suggestion_id: "suggestion-1",
          issue: "Examples are too general",
          evidence_sentence: "Students need practical skills.",
          recommendation: "Use a specific classroom example.",
          revised_sample: "For example, budgeting projects can connect school learning to daily life."
        }
      ],
      latency_ms: 640,
      fallback_triggered: false,
      created_at: "2026-04-05T07:00:00.000Z",
      updated_at: "2026-04-05T07:05:00.000Z"
    });
    const getWritingArchives = vi.fn().mockResolvedValue({
      items: [
        {
          archive_id: "writing-archive-template-1",
          task_type: "task2",
          source_evaluation_id: "writing-eval-template-1",
          rewrite_evaluation_id: "writing-eval-template-2",
          delta_overall: 0.5,
          created_at: "2026-04-05T07:10:00.000Z"
        }
      ]
    });
    const getWritingTemplates = vi.fn().mockResolvedValue({
      items: [
        {
          template_id: "task2-balanced-opinion",
          task_type: "task2",
          title: "平衡观点论证模板",
          argument_framework: "立场-让步-论证-结论",
          scenario_tag: "opinion",
          usage_tips: ["先明确立场", "再补一组让步论证"],
          sections: [
            {
              section_id: "intro",
              title: "引言",
              content: "People have different views on this issue."
            }
          ],
          usage_count: 2,
          adoption_rate: 0.5
        }
      ]
    });
    const insertWritingTemplate = vi.fn().mockResolvedValue({
      template: {
        template_id: "task2-balanced-opinion",
        task_type: "task2",
        title: "平衡观点论证模板",
        argument_framework: "立场-让步-论证-结论",
        scenario_tag: "opinion",
        usage_tips: ["先明确立场", "再补一组让步论证"],
        sections: []
      },
      merged_essay: "Original essay body with template support.\n\n[模板框架]\n(1) 引言: ...",
      preserved_original: true,
      usage: {
        usage_id: "template-usage-1",
        template_id: "task2-balanced-opinion",
        inserted_at: "2026-04-05T07:02:00.000Z",
        original_essay_length: 80,
        merged_essay_length: 120
      }
    });
    const getWritingTemplateAdoption = vi.fn().mockResolvedValue({
      total_insertions: 3,
      items: [
        {
          template_id: "task2-balanced-opinion",
          title: "平衡观点论证模板",
          task_type: "task2",
          usage_count: 2,
          adoption_rate: 0.67
        }
      ]
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          evaluateWriting,
          getWritingEvaluation,
          getWritingArchives,
          getWritingTemplates,
          insertWritingTemplate,
          getWritingTemplateAdoption
        }
      })
    );

    render(<WritingScreen />);

    fireEvent.click(screen.getByText("加载模板"));

    await waitFor(() => {
      expect(getWritingTemplates).toHaveBeenCalledWith(
        "access-token",
        expect.objectContaining({
          task_type: "task2"
        })
      );
      expect(screen.getByText("template_count: 1")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("selected_template: 平衡观点论证模板"))).toBeTruthy();
    });

    fireEvent.click(screen.getByText("插入模板框架"));

    await waitFor(() => {
      expect(insertWritingTemplate).toHaveBeenCalledWith(
        "access-token",
        "task2-balanced-opinion",
        expect.objectContaining({
          insertion_mode: "append"
        })
      );
      expect(
        screen.getByDisplayValue((value) => {
          const text = String(value);
          return text.includes("Original essay body with template support.") && text.includes("[模板框架]");
        })
      ).toBeTruthy();
      expect(screen.getByText("template_preserved_original: true")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("查看采纳率"));

    await waitFor(() => {
      expect(getWritingTemplateAdoption).toHaveBeenCalledTimes(1);
      expect(screen.getByText("template_adoption: total=3, top=task2-balanced-opinion, rate=0.67")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("提交写作批改"));

    await waitFor(() => {
      expect(evaluateWriting).toHaveBeenCalledTimes(1);
      expect(screen.getByText("server_sync_status: 写作批改完成，overall=6")).toBeTruthy();
      expect(screen.getByDisplayValue("writing-eval-template-1")).toBeTruthy();
      expect(screen.getByText("suggestion_count: 1")).toBeTruthy();
    });

    fireEvent.click(screen.getAllByText("加载批改结果")[0]);

    await waitFor(() => {
      expect(getWritingEvaluation).toHaveBeenCalledWith("access-token", "writing-eval-template-1");
      expect(screen.getByText("server_sync_status: 已加载写作评估结果")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("加载改写档案"));

    await waitFor(() => {
      expect(getWritingArchives).toHaveBeenCalledTimes(1);
      expect(screen.getByText("archive_count: 1")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("writing-archive-template-1 · Δoverall 0.5"))).toBeTruthy();
    });
  });

  test("writing screen can retry a failed template insertion", async () => {
    const getWritingTemplates = vi.fn().mockResolvedValue({
      items: [
        {
          template_id: "task2-balanced-opinion",
          task_type: "task2",
          title: "平衡观点论证模板",
          argument_framework: "立场-让步-论证-结论",
          scenario_tag: "opinion",
          usage_tips: ["先明确立场"],
          sections: [],
          usage_count: 2,
          adoption_rate: 0.5
        }
      ]
    });
    const insertWritingTemplate = vi
      .fn()
      .mockRejectedValueOnce(new Error("模板合并服务暂时不可用"))
      .mockResolvedValueOnce({
        template: {
          template_id: "task2-balanced-opinion",
          task_type: "task2",
          title: "平衡观点论证模板",
          argument_framework: "立场-让步-论证-结论",
          scenario_tag: "opinion",
          usage_tips: ["先明确立场"],
          sections: []
        },
        merged_essay: "Retry essay body\n\n[模板框架]\n(1) 引言: ...",
        preserved_original: true,
        usage: {
          usage_id: "template-usage-retry-1",
          template_id: "task2-balanced-opinion",
          inserted_at: "2026-04-05T09:15:00.000Z",
          original_essay_length: 40,
          merged_essay_length: 72
        }
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          getWritingTemplates,
          insertWritingTemplate
        }
      })
    );

    render(<WritingScreen />);

    fireEvent.change(screen.getByPlaceholderText("输入作文正文"), {
      target: { value: "Retry essay body" }
    });
    fireEvent.click(screen.getByText("加载模板"));

    await waitFor(() => {
      expect(screen.getByText("template_count: 1")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("插入模板框架"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 插入模板失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 模板合并服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("writing.retryLastFailedAction"));

    await waitFor(() => {
      expect(insertWritingTemplate).toHaveBeenCalledTimes(2);
      expect(
        screen.getByDisplayValue((value) => {
          const text = String(value);
          return text.includes("Retry essay body") && text.includes("[模板框架]");
        })
      ).toBeTruthy();
      expect(screen.getByText("server_sync_status: 模板已插入：平衡观点论证模板")).toBeTruthy();
      expect(screen.getByText("template_preserved_original: true")).toBeTruthy();
    });
  });

  test("writing screen can retry failed template load, adoption load, archive load and evaluation reload", async () => {
    const getWritingTemplates = vi
      .fn()
      .mockRejectedValueOnce(new Error("模板列表服务暂时不可用"))
      .mockResolvedValueOnce({
        items: [
          {
            template_id: "task2-balanced-opinion",
            task_type: "task2",
            title: "平衡观点论证模板",
            argument_framework: "立场-让步-论证-结论",
            scenario_tag: "opinion",
            usage_tips: ["先明确立场"],
            sections: [],
            usage_count: 2,
            adoption_rate: 0.5
          }
        ]
      });
    const getWritingTemplateAdoption = vi
      .fn()
      .mockRejectedValueOnce(new Error("模板采纳率服务暂时不可用"))
      .mockResolvedValueOnce({
        total_insertions: 4,
        items: [
          {
            template_id: "task2-balanced-opinion",
            title: "平衡观点论证模板",
            task_type: "task2",
            usage_count: 3,
            adoption_rate: 0.75
          }
        ]
      });
    const getWritingArchives = vi
      .fn()
      .mockRejectedValueOnce(new Error("改写档案服务暂时不可用"))
      .mockResolvedValueOnce({
        items: [
          {
            archive_id: "writing-archive-retry-2",
            task_type: "task2",
            source_evaluation_id: "writing-eval-retry-reload-1",
            rewrite_evaluation_id: "writing-eval-retry-reload-2",
            delta_overall: 0.5,
            created_at: "2026-04-05T11:20:00.000Z"
          }
        ]
      });
    const getWritingEvaluation = vi
      .fn()
      .mockRejectedValueOnce(new Error("评估结果服务暂时不可用"))
      .mockResolvedValueOnce({
        evaluation_id: "writing-eval-retry-reload-1",
        task_type: "task2",
        prompt: "Some people think students should learn practical skills at school.",
        essay: "Reloaded writing essay body.",
        scores: {
          tr: 6,
          cc: 6,
          lr: 6,
          gra: 6,
          overall: 6
        },
        suggestions: [
          {
            suggestion_id: "writing-reload-s-1",
            issue: "Need a more specific example",
            evidence_sentence: "Practical skills help students.",
            recommendation: "Add one school-life scenario.",
            revised_sample: "For instance, budgeting tasks can connect school with daily decisions."
          }
        ],
        latency_ms: 620,
        fallback_triggered: false,
        created_at: "2026-04-05T11:00:00.000Z",
        updated_at: "2026-04-05T11:25:00.000Z"
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          getWritingTemplates,
          getWritingTemplateAdoption,
          getWritingArchives,
          getWritingEvaluation
        }
      })
    );
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("writing", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        taskType: "task2",
        prompt: "Some people think students should learn practical skills at school.",
        essay: "Reloaded writing essay body.",
        rewriteEssay: "Reloaded rewrite essay body.",
        evaluationId: "writing-eval-retry-reload-1",
        comparisonDelta: null,
        selectedTemplateId: "",
        templateInsertionMode: "append",
        templatePreservedOriginal: false,
        templateAdoptionText: "-",
        updatedAt: "2026-04-05T10:55:00.000Z"
      })
    );

    render(<WritingScreen />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("writing-eval-retry-reload-1")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("加载模板"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 加载模板失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 模板列表服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("writing.retryLastFailedAction"));

    await waitFor(() => {
      expect(getWritingTemplates).toHaveBeenCalledTimes(2);
      expect(screen.getByText("template_count: 1")).toBeTruthy();
      expect(screen.getByText("server_sync_status: 已加载写作模板库")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("查看采纳率"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 加载采纳率失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 模板采纳率服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("writing.retryLastFailedAction"));

    await waitFor(() => {
      expect(getWritingTemplateAdoption).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 已加载模板采纳率")).toBeTruthy();
      expect(screen.getByText("template_adoption: total=4, top=task2-balanced-opinion, rate=0.75")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("加载改写档案"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 加载档案失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 改写档案服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("writing.retryLastFailedAction"));

    await waitFor(() => {
      expect(getWritingArchives).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 已加载改写档案")).toBeTruthy();
      expect(screen.getByText("archive_count: 1")).toBeTruthy();
    });

    fireEvent.click(screen.getAllByText("加载批改结果")[0]);

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 加载评估失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 评估结果服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("writing.retryLastFailedAction"));

    await waitFor(() => {
      expect(getWritingEvaluation).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 已加载写作评估结果")).toBeTruthy();
      expect(screen.getByText("overall: 6")).toBeTruthy();
      expect(screen.getByText("suggestion_count: 1")).toBeTruthy();
    });
  });

  test("mock exam screen can save progress, recover, load report, undo writeback and export report", async () => {
    const createMockExam = vi.fn().mockResolvedValue({
      exam_id: "mock-flow-1",
      status: "in_progress",
      time_limit_seconds: 7200,
      elapsed_seconds: 0,
      remaining_seconds: 7200,
      current_skill: "reading",
      sections: [],
      created_at: "2026-04-05T08:00:00.000Z",
      updated_at: "2026-04-05T08:00:00.000Z"
    });
    const saveMockExamProgress = vi
      .fn()
      .mockResolvedValueOnce({
        exam_id: "mock-flow-1",
        status: "in_progress",
        time_limit_seconds: 7200,
        elapsed_seconds: 900,
        remaining_seconds: 6300,
        current_skill: "reading",
        sections: [
          {
            skill: "reading",
            answered_count: 20,
            status: "in_progress",
            last_checkpoint_at: "2026-04-05T08:15:00.000Z"
          }
        ],
        created_at: "2026-04-05T08:00:00.000Z",
        updated_at: "2026-04-05T08:15:00.000Z"
      })
      .mockResolvedValueOnce({
        exam_id: "mock-flow-1",
        status: "in_progress",
        time_limit_seconds: 7200,
        elapsed_seconds: 1200,
        remaining_seconds: 6000,
        current_skill: "reading",
        sections: [
          {
            skill: "reading",
            answered_count: 20,
            status: "completed",
            last_checkpoint_at: "2026-04-05T08:20:00.000Z"
          }
        ],
        created_at: "2026-04-05T08:00:00.000Z",
        updated_at: "2026-04-05T08:20:00.000Z"
      });
    const recoverMockExam = vi.fn().mockResolvedValue({
      exam_id: "mock-flow-1",
      status: "in_progress",
      time_limit_seconds: 7200,
      elapsed_seconds: 1200,
      remaining_seconds: 6000,
      current_skill: "reading",
      recovered: true,
      sections: [
        {
          skill: "reading",
          answered_count: 20,
          status: "completed",
          last_checkpoint_at: "2026-04-05T08:20:00.000Z"
        }
      ],
      created_at: "2026-04-05T08:00:00.000Z",
      updated_at: "2026-04-05T08:21:00.000Z"
    });
    const getMockExamReport = vi.fn().mockResolvedValue({
      report_id: "mock-report-flow-1",
      exam_id: "mock-flow-1",
      total_estimated_band: 6.5,
      skill_band_estimates: {
        listening: 6.5,
        speaking: 6,
        reading: 6.5,
        writing: 6
      },
      error_distribution: {
        listening: 3,
        speaking: 2,
        reading: 4,
        writing: 3
      },
      next_actions: ["补强阅读限时节奏"],
      plan_writeback: {
        applied: true,
        undo_available: true,
        reasons: ["阅读耗时偏高"],
        changed_tasks: [
          {
            task_id: "task-reading-1",
            target_minutes_before: 45,
            completion_criteria_before: "完成 1 次阅读训练",
            target_minutes_after: 60,
            completion_criteria_after: "完成 1 次阅读训练并记录耗时"
          }
        ]
      },
      generated_at: "2026-04-05T08:30:00.000Z",
      created_at: "2026-04-05T08:30:00.000Z",
      updated_at: "2026-04-05T08:30:00.000Z"
    });
    const undoMockExamWriteback = vi.fn().mockResolvedValue({
      report_id: "mock-report-flow-1",
      exam_id: "mock-flow-1",
      total_estimated_band: 6.5,
      skill_band_estimates: {
        listening: 6.5,
        speaking: 6,
        reading: 6.5,
        writing: 6
      },
      error_distribution: {
        listening: 3,
        speaking: 2,
        reading: 4,
        writing: 3
      },
      next_actions: ["补强阅读限时节奏"],
      plan_writeback: {
        applied: false,
        undo_available: false,
        reasons: [],
        changed_tasks: []
      },
      generated_at: "2026-04-05T08:31:00.000Z",
      created_at: "2026-04-05T08:30:00.000Z",
      updated_at: "2026-04-05T08:31:00.000Z"
    });
    const exportMockExamReport = vi.fn().mockResolvedValue({
      filename: "mock-report-flow-1.json",
      content: "{\"report_id\":\"mock-report-flow-1\"}"
    });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createMockExam,
          saveMockExamProgress,
          recoverMockExam,
          getMockExamReport,
          undoMockExamWriteback,
          exportMockExamReport
        }
      })
    );

    render(<MockExamScreen />);

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("checkpoint_status: 已启用自动保存"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("mockExam.create"));

    await waitFor(() => {
      expect(createMockExam).toHaveBeenCalledTimes(1);
      expect(screen.getByText((content) => content.includes("exam_id: mock-flow-1"))).toBeTruthy();
    });

    fireEvent.click(screen.getByText("保存进度"));

    await waitFor(() => {
      expect(saveMockExamProgress).toHaveBeenNthCalledWith(
        1,
        "access-token",
        "mock-flow-1",
        expect.objectContaining({
          skill: "reading",
          answered_count: 20,
          completed: false
        })
      );
      expect(screen.getByText("server_sync_status: 已保存 reading 进度")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("reading · in_progress"))).toBeTruthy();
    });

    fireEvent.click(screen.getByText("提交当前科目"));

    await waitFor(() => {
      expect(saveMockExamProgress).toHaveBeenNthCalledWith(
        2,
        "access-token",
        "mock-flow-1",
        expect.objectContaining({
          skill: "reading",
          answered_count: 20,
          completed: true
        })
      );
      expect(screen.getByText("server_sync_status: 已提交 reading 科目")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("reading · completed"))).toBeTruthy();
    });

    fireEvent.click(screen.getAllByText("恢复模考")[0]);

    await waitFor(() => {
      expect(recoverMockExam).toHaveBeenCalledWith("access-token", "mock-flow-1");
      expect(screen.getByText("server_sync_status: 模考恢复成功")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("加载复盘报告"));

    await waitFor(() => {
      expect(getMockExamReport).toHaveBeenCalledWith("access-token", "mock-flow-1");
      expect(screen.getByText("overall: 6.5")).toBeTruthy();
      expect(screen.getByText("bands: L6.5/S6/R6.5/W6")).toBeTruthy();
      expect(screen.getByText("writeback_applied: true")).toBeTruthy();
      expect(screen.getByText("undo_available: true")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("撤销计划回写"));

    await waitFor(() => {
      expect(undoMockExamWriteback).toHaveBeenCalledWith("access-token", "mock-flow-1");
      expect(screen.getByText("server_sync_status: 已撤销计划回写")).toBeTruthy();
      expect(screen.getByText("writeback_applied: false")).toBeTruthy();
      expect(screen.getByText("undo_available: false")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("导出并分享报告"));

    await waitFor(() => {
      expect(exportMockExamReport).toHaveBeenCalledWith("access-token", "mock-flow-1");
      expect(mockedShare.share).toHaveBeenCalledWith({
        title: "mock-report-flow-1.json",
        message: "{\"report_id\":\"mock-report-flow-1\"}"
      });
      expect(screen.getByText("filename: mock-report-flow-1.json")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("preview: {\"report_id\":\"mock-report-flow-1\"}"))).toBeTruthy();
    });
  });

  test("mock exam screen can retry failed report load and export", async () => {
    const createMockExam = vi.fn().mockResolvedValue({
      exam_id: "mock-retry-report-1",
      status: "in_progress",
      time_limit_seconds: 7200,
      elapsed_seconds: 0,
      remaining_seconds: 7200,
      current_skill: "reading",
      sections: [],
      created_at: "2026-04-05T10:00:00.000Z",
      updated_at: "2026-04-05T10:00:00.000Z"
    });
    const getMockExamReport = vi
      .fn()
      .mockRejectedValueOnce(new Error("报告服务暂时不可用"))
      .mockResolvedValueOnce({
        report_id: "mock-retry-report-result-1",
        exam_id: "mock-retry-report-1",
        total_estimated_band: 6,
        skill_band_estimates: {
          listening: 6,
          speaking: 6,
          reading: 6,
          writing: 6
        },
        error_distribution: {
          listening: 4,
          speaking: 3,
          reading: 5,
          writing: 4
        },
        next_actions: ["先处理阅读耗时"],
        plan_writeback: {
          applied: true,
          undo_available: true,
          reasons: ["阅读耗时偏高"],
          changed_tasks: []
        },
        generated_at: "2026-04-05T10:20:00.000Z",
        created_at: "2026-04-05T10:20:00.000Z",
        updated_at: "2026-04-05T10:20:00.000Z"
      });
    const exportMockExamReport = vi
      .fn()
      .mockRejectedValueOnce(new Error("导出服务暂时不可用"))
      .mockResolvedValueOnce({
        filename: "mock-retry-report-1.json",
        content: "{\"report_id\":\"mock-retry-report-result-1\"}"
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createMockExam,
          getMockExamReport,
          exportMockExamReport
        }
      })
    );

    render(<MockExamScreen />);

    fireEvent.click(screen.getByTestId("mockExam.create"));

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("exam_id: mock-retry-report-1"))).toBeTruthy();
    });

    fireEvent.click(screen.getByText("加载复盘报告"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 加载报告失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 报告服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("mockExam.retryLastFailedAction"));

    await waitFor(() => {
      expect(getMockExamReport).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 已加载模考报告")).toBeTruthy();
      expect(screen.getByText("overall: 6")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("导出并分享报告"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 导出报告失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 导出服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("mockExam.retryLastFailedAction"));

    await waitFor(() => {
      expect(exportMockExamReport).toHaveBeenCalledTimes(2);
      expect(mockedShare.share).toHaveBeenCalledWith({
        title: "mock-retry-report-1.json",
        message: "{\"report_id\":\"mock-retry-report-result-1\"}"
      });
      expect(screen.getByText("server_sync_status: 已导出并分享报告 mock-retry-report-1.json")).toBeTruthy();
      expect(screen.getByText("filename: mock-retry-report-1.json")).toBeTruthy();
    });
  });

  test("mock exam screen can retry failed progress save and recovery", async () => {
    const createMockExam = vi.fn().mockResolvedValue({
      exam_id: "mock-retry-progress-1",
      status: "in_progress",
      time_limit_seconds: 7200,
      elapsed_seconds: 0,
      remaining_seconds: 7200,
      current_skill: "reading",
      sections: [],
      created_at: "2026-04-05T12:00:00.000Z",
      updated_at: "2026-04-05T12:00:00.000Z"
    });
    const saveMockExamProgress = vi
      .fn()
      .mockRejectedValueOnce(new Error("模考进度服务暂时不可用"))
      .mockResolvedValueOnce({
        exam_id: "mock-retry-progress-1",
        status: "in_progress",
        time_limit_seconds: 7200,
        elapsed_seconds: 900,
        remaining_seconds: 6300,
        current_skill: "reading",
        sections: [
          {
            skill: "reading",
            answered_count: 20,
            status: "in_progress",
            last_checkpoint_at: "2026-04-05T12:15:00.000Z"
          }
        ],
        created_at: "2026-04-05T12:00:00.000Z",
        updated_at: "2026-04-05T12:15:00.000Z"
      });
    const recoverMockExam = vi
      .fn()
      .mockRejectedValueOnce(new Error("模考恢复服务暂时不可用"))
      .mockResolvedValueOnce({
        exam_id: "mock-retry-progress-1",
        status: "in_progress",
        time_limit_seconds: 7200,
        elapsed_seconds: 900,
        remaining_seconds: 6300,
        current_skill: "reading",
        recovered: true,
        sections: [
          {
            skill: "reading",
            answered_count: 20,
            status: "in_progress",
            last_checkpoint_at: "2026-04-05T12:15:00.000Z"
          }
        ],
        created_at: "2026-04-05T12:00:00.000Z",
        updated_at: "2026-04-05T12:16:00.000Z"
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createMockExam,
          saveMockExamProgress,
          recoverMockExam
        }
      })
    );

    render(<MockExamScreen />);

    fireEvent.click(screen.getByTestId("mockExam.create"));

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("exam_id: mock-retry-progress-1"))).toBeTruthy();
    });

    fireEvent.click(screen.getByText("保存进度"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 保存进度失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 模考进度服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("mockExam.retryLastFailedAction"));

    await waitFor(() => {
      expect(saveMockExamProgress).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 已保存 reading 进度")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("reading · in_progress"))).toBeTruthy();
    });

    fireEvent.click(screen.getAllByText("恢复模考")[0]);

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 恢复模考失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 模考恢复服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("mockExam.retryLastFailedAction"));

    await waitFor(() => {
      expect(recoverMockExam).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 模考恢复成功")).toBeTruthy();
    });
  });

  test("mock exam screen can retry failed exam refresh", async () => {
    const createMockExam = vi.fn().mockResolvedValue({
      exam_id: "mock-retry-load-1",
      status: "in_progress",
      time_limit_seconds: 7200,
      elapsed_seconds: 0,
      remaining_seconds: 7200,
      current_skill: "reading",
      sections: [],
      created_at: "2026-04-05T13:30:00.000Z",
      updated_at: "2026-04-05T13:30:00.000Z"
    });
    const getMockExam = vi
      .fn()
      .mockRejectedValueOnce(new Error("模考状态服务暂时不可用"))
      .mockResolvedValueOnce({
        exam_id: "mock-retry-load-1",
        status: "in_progress",
        time_limit_seconds: 7200,
        elapsed_seconds: 300,
        remaining_seconds: 6900,
        current_skill: "speaking",
        sections: [],
        created_at: "2026-04-05T13:30:00.000Z",
        updated_at: "2026-04-05T13:35:00.000Z"
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createMockExam,
          getMockExam
        }
      })
    );

    render(<MockExamScreen />);

    fireEvent.click(screen.getByTestId("mockExam.create"));

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("exam_id: mock-retry-load-1"))).toBeTruthy();
    });

    fireEvent.click(screen.getByText("拉取模考状态"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 拉取模考失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 模考状态服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("mockExam.retryLastFailedAction"));

    await waitFor(() => {
      expect(getMockExam).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 模考状态=in_progress，剩余=6900s")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("current_skill: speaking"))).toBeTruthy();
    });
  });

  test("mock exam screen can retry failed skill submit and final submit", async () => {
    const createMockExam = vi.fn().mockResolvedValue({
      exam_id: "mock-retry-submit-1",
      status: "in_progress",
      time_limit_seconds: 7200,
      elapsed_seconds: 0,
      remaining_seconds: 7200,
      current_skill: "reading",
      sections: [],
      created_at: "2026-04-05T14:00:00.000Z",
      updated_at: "2026-04-05T14:00:00.000Z"
    });
    const saveMockExamProgress = vi
      .fn()
      .mockRejectedValueOnce(new Error("提交科目服务暂时不可用"))
      .mockResolvedValueOnce({
        exam_id: "mock-retry-submit-1",
        status: "in_progress",
        time_limit_seconds: 7200,
        elapsed_seconds: 1200,
        remaining_seconds: 6000,
        current_skill: "reading",
        sections: [
          {
            skill: "reading",
            answered_count: 20,
            status: "completed",
            last_checkpoint_at: "2026-04-05T14:20:00.000Z"
          }
        ],
        created_at: "2026-04-05T14:00:00.000Z",
        updated_at: "2026-04-05T14:20:00.000Z"
      });
    const submitMockExam = vi
      .fn()
      .mockRejectedValueOnce(new Error("整场提交服务暂时不可用"))
      .mockResolvedValueOnce({
        exam: {
          exam_id: "mock-retry-submit-1",
          status: "submitted",
          time_limit_seconds: 7200,
          elapsed_seconds: 3600,
          remaining_seconds: 0,
          current_skill: "writing",
          sections: [],
          report_id: "mock-retry-submit-report-1",
          submitted_at: "2026-04-05T15:00:00.000Z",
          created_at: "2026-04-05T14:00:00.000Z",
          updated_at: "2026-04-05T15:00:00.000Z"
        },
        report: {
          report_id: "mock-retry-submit-report-1",
          exam_id: "mock-retry-submit-1",
          total_estimated_band: 6.5,
          skill_band_estimates: {
            listening: 6.5,
            speaking: 6,
            reading: 6.5,
            writing: 6
          },
          error_distribution: {
            listening: 3,
            speaking: 2,
            reading: 4,
            writing: 3
          },
          next_actions: ["补强阅读限时节奏"],
          plan_writeback: {
            applied: true,
            undo_available: true,
            reasons: ["阅读耗时偏高"],
            changed_tasks: []
          },
          generated_at: "2026-04-05T15:00:00.000Z",
          created_at: "2026-04-05T15:00:00.000Z",
          updated_at: "2026-04-05T15:00:00.000Z"
        }
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          createMockExam,
          saveMockExamProgress,
          submitMockExam
        }
      })
    );

    render(<MockExamScreen />);

    fireEvent.click(screen.getByTestId("mockExam.create"));

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("exam_id: mock-retry-submit-1"))).toBeTruthy();
    });

    fireEvent.click(screen.getByText("提交当前科目"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 提交科目失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 提交科目服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("mockExam.retryLastFailedAction"));

    await waitFor(() => {
      expect(saveMockExamProgress).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 已提交 reading 科目")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("reading · completed"))).toBeTruthy();
    });

    fireEvent.click(screen.getByText("提交整场模考"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 提交整场失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 整场提交服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("mockExam.retryLastFailedAction"));

    await waitFor(() => {
      expect(submitMockExam).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 模考提交完成，overall=6.5")).toBeTruthy();
      expect(screen.getByText("overall: 6.5")).toBeTruthy();
      expect(screen.getByText("writeback_applied: true")).toBeTruthy();
    });
  });

  test("mock exam screen can retry failed undo writeback", async () => {
    const undoMockExamWriteback = vi
      .fn()
      .mockRejectedValueOnce(new Error("计划回写撤销服务暂时不可用"))
      .mockResolvedValueOnce({
        report_id: "mock-report-undo-retry-1",
        exam_id: "mock-undo-retry-1",
        total_estimated_band: 6.5,
        skill_band_estimates: {
          listening: 6.5,
          speaking: 6,
          reading: 6.5,
          writing: 6
        },
        error_distribution: {
          listening: 3,
          speaking: 2,
          reading: 4,
          writing: 3
        },
        next_actions: ["补强阅读限时节奏"],
        plan_writeback: {
          applied: false,
          undo_available: false,
          reasons: [],
          changed_tasks: []
        },
        generated_at: "2026-04-05T12:35:00.000Z",
        created_at: "2026-04-05T12:30:00.000Z",
        updated_at: "2026-04-05T12:35:00.000Z"
      });

    mockedUseAppSession.mockReturnValue(
      createSessionContext({
        apiClient: {
          undoMockExamWriteback
        }
      })
    );
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("mock-exam", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        exam: {
          exam_id: "mock-undo-retry-1",
          status: "submitted",
          time_limit_seconds: 7200,
          elapsed_seconds: 3600,
          remaining_seconds: 0,
          current_skill: "writing",
          sections: [],
          report_id: "mock-report-undo-retry-1",
          submitted_at: "2026-04-05T12:30:00.000Z",
          created_at: "2026-04-05T12:00:00.000Z",
          updated_at: "2026-04-05T12:30:00.000Z"
        },
        report: {
          report_id: "mock-report-undo-retry-1",
          exam_id: "mock-undo-retry-1",
          total_estimated_band: 6.5,
          skill_band_estimates: {
            listening: 6.5,
            speaking: 6,
            reading: 6.5,
            writing: 6
          },
          error_distribution: {
            listening: 3,
            speaking: 2,
            reading: 4,
            writing: 3
          },
          next_actions: ["补强阅读限时节奏"],
          plan_writeback: {
            applied: true,
            undo_available: true,
            reasons: ["阅读耗时偏高"],
            changed_tasks: []
          },
          generated_at: "2026-04-05T12:30:00.000Z",
          created_at: "2026-04-05T12:30:00.000Z",
          updated_at: "2026-04-05T12:30:00.000Z"
        },
        timeLimitSeconds: "7200",
        skill: "reading",
        answeredCount: "20",
        listeningBand: "6.5",
        speakingBand: "6",
        readingBand: "6.5",
        writingBand: "6",
        exportPreview: "-",
        exportFilename: "-",
        updatedAt: "2026-04-05T12:31:00.000Z"
      })
    );

    render(<MockExamScreen />);

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("checkpoint_status: 已恢复"))).toBeTruthy();
      expect(screen.getByText("writeback_applied: true")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("撤销计划回写"));

    await waitFor(() => {
      expect(screen.getByText("server_sync_status: 撤销回写失败")).toBeTruthy();
      expect(screen.getByText((content) => content.includes("server_sync_result: 计划回写撤销服务暂时不可用"))).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("mockExam.retryLastFailedAction"));

    await waitFor(() => {
      expect(undoMockExamWriteback).toHaveBeenCalledTimes(2);
      expect(screen.getByText("server_sync_status: 已撤销计划回写")).toBeTruthy();
      expect(screen.getByText("writeback_applied: false")).toBeTruthy();
      expect(screen.getByText("undo_available: false")).toBeTruthy();
    });
  });
});
