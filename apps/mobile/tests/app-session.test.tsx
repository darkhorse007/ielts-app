import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { StoredSession } from "../src/lib/api-types";
import type { InstanceConfig } from "../src/lib/runtime-config";
import { AppSessionProvider, useAppSession } from "../src/state/app-session";
import { buildScopedStorageKey, loadStoredSession, saveStoredInstanceConfig, saveStoredSession } from "../src/lib/storage";

const mockedSecureStore = SecureStore as typeof SecureStore & {
  __resetMockStorage: () => void;
  __setMockItem: (key: string, value: string) => void;
};
const mockedNotifications = Notifications as typeof Notifications & {
  __resetMockNotifications: () => void;
  __setMockDevicePushToken: (token: { type: string; data: string }) => void;
};

const instanceConfig: InstanceConfig = {
  apiBaseUrl: "http://127.0.0.1:8787",
  wsBaseUrl: "ws://127.0.0.1:8787"
};

const storedSession: StoredSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  userId: "user-1"
};

const SessionProbe = () => {
  const { ready, session, logout } = useAppSession();

  return (
    <div>
      <span>{ready ? "ready" : "loading"}</span>
      <span>{session ? `session:${session.userId}` : "session:none"}</span>
      <button type="button" onClick={() => void logout()}>
        logout
      </button>
    </div>
  );
};

describe("mobile app session reminder device sync", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockedSecureStore.__resetMockStorage();
    mockedNotifications.__resetMockNotifications();
    mockedSecureStore.__setMockItem(buildScopedStorageKey("installation", "id", "v1"), JSON.stringify("installation-ios-1"));
    mockedNotifications.__setMockDevicePushToken({
      type: "ios",
      data: "native-token-abcdef1234567890"
    });
    await saveStoredInstanceConfig(instanceConfig);
    await saveStoredSession(storedSession);
  });

  test("registers the current reminder device after restoring a stored session", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/v1/reminders/devices/installation-ios-1");
      expect(init?.method).toBe("PUT");

      return new Response(
        JSON.stringify({
          installation_id: "installation-ios-1",
          platform: "ios",
          permission_status: "granted",
          push_provider: "apns",
          push_token_preview: "native...7890",
          environment: "development",
          delivery_ready: true,
          created_at: "2026-04-01T00:00:00.000Z",
          updated_at: "2026-04-01T00:00:00.000Z"
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AppSessionProvider>
        <SessionProbe />
      </AppSessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("ready")).toBeTruthy();
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const payload = JSON.parse(String(init?.body)) as {
      push_provider?: string;
      push_token?: string;
      environment: string;
    };

    expect(payload.push_provider).toBe("apns");
    expect(payload.push_token).toBe("native-token-abcdef1234567890");
    expect(payload.environment).toBe("development");
  });

  test("removes the current reminder device during logout", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return new Response(
          JSON.stringify({
            installation_id: "installation-ios-1",
            platform: "ios",
            permission_status: "granted",
            push_provider: "apns",
            push_token_preview: "native...7890",
            environment: "development",
            delivery_ready: true,
            created_at: "2026-04-01T00:00:00.000Z",
            updated_at: "2026-04-01T00:00:00.000Z"
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }

      expect(String(input)).toBe("http://127.0.0.1:8787/v1/reminders/devices/installation-ios-1");
      expect(init?.method).toBe("DELETE");

      return new Response(
        JSON.stringify({
          installation_id: "installation-ios-1",
          removed: true
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AppSessionProvider>
        <SessionProbe />
      </AppSessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("session:user-1")).toBeTruthy();
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByText("logout"));

    await waitFor(() => {
      expect(screen.getByText("session:none")).toBeTruthy();
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("DELETE");
    await expect(loadStoredSession()).resolves.toBeNull();
  });
});
