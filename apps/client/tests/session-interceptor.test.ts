import { describe, expect, test, vi, beforeEach } from "vitest";
import { HttpClient } from "../src/lib/http-client";
import { TokenStorage } from "../src/lib/token-storage";
import { SessionManager } from "../src/lib/session-manager";

beforeEach(() => {
  localStorage.clear();
});

describe("S1 auto refresh and retry interceptor", () => {
  test("retries once after refresh when first request returns 401", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access-old",
      refreshToken: "refresh-old",
      expiresIn: 900,
      userId: "u-1"
    });

    const refresh = vi.fn().mockResolvedValue({
      access_token: "access-new",
      refresh_token: "refresh-new",
      expires_in: 900,
      user_id: "u-1",
      session_id: "s-1"
    });

    const sessionManager = new SessionManager(
      {
        refresh,
        register: vi.fn(),
        login: vi.fn(),
        logout: vi.fn(),
        submitOnboarding: vi.fn(),
        fetchOnboardingStatus: vi.fn(),
        request: vi.fn()
      } as any,
      tokenStorage
    );

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          code: "UNAUTHORIZED",
          message: "expired"
        }), {
          status: 401,
          headers: {
            "Content-Type": "application/json"
          }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          ok: true,
          value: 42
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        })
      );

    const httpClient = new HttpClient({
      baseUrl: "http://localhost:8787",
      fetchFn: fetchFn as any,
      tokenStorage,
      sessionManager
    });

    const result = await httpClient.request<{ ok: boolean; value: number }>("/v1/users/me/progress", {
      method: "GET"
    });

    expect(result.ok).toBe(true);
    expect(result.value).toBe(42);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(tokenStorage.getAccessToken()).toBe("access-new");
  });

  test("clears local session when refresh fails", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access-old",
      refreshToken: "refresh-old",
      expiresIn: 900,
      userId: "u-1"
    });

    const refresh = vi.fn().mockRejectedValue(new Error("refresh failed"));

    const sessionManager = new SessionManager(
      {
        refresh,
        register: vi.fn(),
        login: vi.fn(),
        logout: vi.fn(),
        submitOnboarding: vi.fn(),
        fetchOnboardingStatus: vi.fn(),
        request: vi.fn()
      } as any,
      tokenStorage
    );

    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        code: "UNAUTHORIZED",
        message: "expired"
      }), {
        status: 401,
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    const httpClient = new HttpClient({
      baseUrl: "http://localhost:8787",
      fetchFn: fetchFn as any,
      tokenStorage,
      sessionManager
    });

    await expect(
      httpClient.request("/v1/users/me/progress", {
        method: "GET"
      })
    ).rejects.toThrow("SESSION_EXPIRED");

    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });
});
