import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import RegisterScreen from "../app/register";
import type { MinorGuardianResponse } from "../src/lib/api-types";
import { buildScopedStorageKey } from "../src/lib/storage";
import { MinorGuardianProvider, useMinorGuardian } from "../src/state/minor-guardian";
import { useAppSession } from "../src/state/app-session";

const minorGuardianStorageKey = buildScopedStorageKey("minor_guardian");
const mockedUseAppSession = vi.mocked(useAppSession);
const mockedSecureStore = SecureStore as typeof SecureStore & {
  __resetMockStorage: () => void;
  __setMockItem: (key: string, value: string) => void;
  __getMockItem: (key: string) => string | null;
};

const registerMock = vi.fn();

const createAppSessionContext = (overrides?: {
  session?: ReturnType<typeof useAppSession>["session"];
  remoteMinorGuardian?: MinorGuardianResponse;
}): ReturnType<typeof useAppSession> => {
  let remoteMinorGuardian: MinorGuardianResponse = {
    age_band: "unknown",
    ...overrides?.remoteMinorGuardian
  };
  const session =
    overrides?.session === undefined
      ? {
          accessToken: "access-token",
          refreshToken: "refresh-token",
          expiresAt: 9_999_999_999,
          userId: "user-1"
        }
      : overrides.session;
  const runWithAuthorizedClient = vi.fn(async <T,>(
    execute: (client: any, accessToken: string) => Promise<T>
  ): Promise<T> =>
    execute(
      {
        getProfile: vi.fn(async () => ({
          id: session?.userId ?? "user-1",
          email: "learner@example.com",
          status: "active",
          minor_guardian: {
            ...remoteMinorGuardian
          },
          created_at: "2026-04-03T00:00:00.000Z",
          updated_at: remoteMinorGuardian.updated_at ?? "2026-04-03T00:00:00.000Z"
        })),
        updateMinorGuardian: vi.fn(async (_accessToken: string, payload: { age_band: string; source?: string }) => {
          remoteMinorGuardian = {
            age_band: payload.age_band as MinorGuardianResponse["age_band"],
            source: (payload.source as MinorGuardianResponse["source"]) ?? "account",
            updated_at: "2026-04-03T00:10:00.000Z"
          };
          return {
            ...remoteMinorGuardian
          };
        }),
        acknowledgeMinorGuardianNotice: vi.fn(async () => {
          remoteMinorGuardian = {
            ...remoteMinorGuardian,
            updated_at: "2026-04-03T00:12:00.000Z",
            guardian_notice_accepted_at: "2026-04-03T00:12:00.000Z",
            guardian_notice_accepted_user_id: session?.userId ?? "user-1"
          };
          return {
            ...remoteMinorGuardian
          };
        })
      },
      "access-token"
    )
  );

  return {
    ready: true,
    defaultInstanceConfig: {
      apiBaseUrl: "http://127.0.0.1:8787",
      wsBaseUrl: "ws://127.0.0.1:8787"
    },
    instanceConfig: {
      apiBaseUrl: "http://127.0.0.1:8787",
      wsBaseUrl: "ws://127.0.0.1:8787"
    },
    session,
    saveInstanceConfig: vi.fn(),
    saveSession: vi.fn(),
    logout: vi.fn(),
    syncReminderDevice: vi.fn(),
    runWithAuthorizedClient
  } as unknown as ReturnType<typeof useAppSession>;
};

vi.mock("expo-router", () => ({
  router: {
    push: vi.fn(),
    replace: vi.fn()
  },
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
  Redirect: ({ href }: { href: string }) => <div data-testid="redirect">{href}</div>
}));

vi.mock("../src/state/app-session", () => ({
  useAppSession: vi.fn()
}));

vi.mock("../src/lib/api-client", () => ({
  ApiClient: vi.fn().mockImplementation(() => ({
    register: registerMock
  }))
}));

describe("minor guardian flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSecureStore.__resetMockStorage();
    mockedUseAppSession.mockReturnValue(createAppSessionContext());
    registerMock.mockResolvedValue({
      user_id: "user-1"
    });
  });

  test("shows guardian notice for under-18 users until acknowledged", async () => {
    mockedSecureStore.__setMockItem(
      minorGuardianStorageKey,
      JSON.stringify({
        ageBand: "under_18",
        source: "register",
        updatedAt: "2026-04-03T00:00:00.000Z"
      })
    );

    render(
      <MinorGuardianProvider>
        <div>home</div>
      </MinorGuardianProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("未成年人使用提示")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("minorGuardian.acknowledge"));

    await waitFor(() => {
      expect(screen.queryByText("未成年人使用提示")).toBeNull();
    });

    expect(JSON.parse(String(mockedSecureStore.__getMockItem(minorGuardianStorageKey)))).toMatchObject({
      ageBand: "under_18",
      ownerUserId: "user-1",
      guardianNoticeAcceptedUserId: "user-1"
    });
  });

  test("hydrates existing logged-in user state from remote profile", async () => {
    mockedUseAppSession.mockReturnValue(
      createAppSessionContext({
        remoteMinorGuardian: {
          age_band: "under_18",
          source: "account",
          updated_at: "2026-04-03T00:05:00.000Z",
          guardian_notice_accepted_at: "2026-04-03T00:06:00.000Z",
          guardian_notice_accepted_user_id: "user-1"
        }
      })
    );

    const Probe = () => {
      const { state } = useMinorGuardian();
      return <div>{state.ageBand}</div>;
    };

    render(
      <MinorGuardianProvider>
        <Probe />
      </MinorGuardianProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("under_18")).toBeTruthy();
    });
    expect(JSON.parse(String(mockedSecureStore.__getMockItem(minorGuardianStorageKey)))).toMatchObject({
      ageBand: "under_18",
      source: "account",
      ownerUserId: "user-1"
    });
  });

  test("requires guardian confirmation before under-18 registration can continue", async () => {
    mockedUseAppSession.mockReturnValue(
      createAppSessionContext({
        session: null
      })
    );

    render(
      <MinorGuardianProvider>
        <RegisterScreen />
      </MinorGuardianProvider>
    );

    fireEvent.change(screen.getByTestId("register.email"), {
      target: { value: "learner@example.com" }
    });
    fireEvent.change(screen.getByTestId("register.password"), {
      target: { value: "Passw0rd!123" }
    });
    fireEvent.change(screen.getByTestId("register.confirmPassword"), {
      target: { value: "Passw0rd!123" }
    });
    fireEvent.click(screen.getByTestId("register.ageBandMinor"));
    fireEvent.click(screen.getByTestId("register.submit"));

    await waitFor(() => {
      expect(screen.getByText("若未满 18 周岁，请先确认监护提示")).toBeTruthy();
    });
    expect(registerMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("register.guardianConfirm"));
    fireEvent.click(screen.getByTestId("register.submit"));

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledTimes(1);
    });
    expect(JSON.parse(String(mockedSecureStore.__getMockItem(minorGuardianStorageKey)))).toMatchObject({
      ageBand: "under_18",
      source: "register"
    });
    expect(router.replace).toHaveBeenCalledWith("/login");
  });
});
