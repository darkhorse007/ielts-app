import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import RegisterScreen from "../app/register";
import { buildScopedStorageKey } from "../src/lib/storage";
import { MinorGuardianProvider } from "../src/state/minor-guardian";
import { useAppSession } from "../src/state/app-session";

const minorGuardianStorageKey = buildScopedStorageKey("minor_guardian");
const mockedUseAppSession = vi.mocked(useAppSession);
const mockedSecureStore = SecureStore as typeof SecureStore & {
  __resetMockStorage: () => void;
  __setMockItem: (key: string, value: string) => void;
  __getMockItem: (key: string) => string | null;
};

const registerMock = vi.fn();

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
    mockedUseAppSession.mockReturnValue({
      ready: true,
      defaultInstanceConfig: {
        apiBaseUrl: "http://127.0.0.1:8787",
        wsBaseUrl: "ws://127.0.0.1:8787"
      },
      instanceConfig: {
        apiBaseUrl: "http://127.0.0.1:8787",
        wsBaseUrl: "ws://127.0.0.1:8787"
      },
      session: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: 9_999_999_999,
        userId: "user-1"
      },
      saveInstanceConfig: vi.fn(),
      saveSession: vi.fn(),
      logout: vi.fn(),
      syncReminderDevice: vi.fn(),
      runWithAuthorizedClient: vi.fn()
    } as unknown as ReturnType<typeof useAppSession>);
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
      guardianNoticeAcceptedUserId: "user-1"
    });
  });

  test("requires guardian confirmation before under-18 registration can continue", async () => {
    mockedUseAppSession.mockReturnValue({
      ready: true,
      defaultInstanceConfig: {
        apiBaseUrl: "http://127.0.0.1:8787",
        wsBaseUrl: "ws://127.0.0.1:8787"
      },
      instanceConfig: {
        apiBaseUrl: "http://127.0.0.1:8787",
        wsBaseUrl: "ws://127.0.0.1:8787"
      },
      session: null,
      saveInstanceConfig: vi.fn(),
      saveSession: vi.fn(),
      logout: vi.fn(),
      syncReminderDevice: vi.fn(),
      runWithAuthorizedClient: vi.fn()
    } as unknown as ReturnType<typeof useAppSession>);

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
