import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "../src/App";
import { clearCachedSessionProfile } from "../src/lib/session-profile-cache";
import { TokenStorage } from "../src/lib/token-storage";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });

describe("app route guards", () => {
  beforeEach(() => {
    localStorage.clear();
    clearCachedSessionProfile();
    window.history.pushState({}, "", "/login");
  });

  afterEach(() => {
    clearCachedSessionProfile();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("redirects unauthenticated admin visits to login", async () => {
    window.history.pushState({}, "", "/admin");

    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/login");
    });
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
  });

  test("redirects learner admin visits back to home and hides internal entry", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900,
      userId: "user-1"
    });

    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/v1/users/me/profile")) {
        return jsonResponse({
          id: "user-1",
          email: "learner@example.com",
          system_roles: ["learner"],
          status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal(
      "fetch",
      fetchSpy as typeof fetch
    );

    window.history.pushState({}, "", "/admin");

    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/home");
      expect(screen.getByRole("heading", { name: "IELTS 自托管学习首页" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: "监护人工单处理台" })).not.toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("shows internal entry on home for ops users", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "ops-access-token",
      refreshToken: "ops-refresh-token",
      expiresIn: 900,
      userId: "ops-user-1"
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/v1/users/me/profile")) {
          return jsonResponse({
            id: "ops-user-1",
            email: "ops-reviewer@example.com",
            system_roles: ["learner", "ops"],
            status: "active",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }) as typeof fetch
    );

    window.history.pushState({}, "", "/home");

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "监护人工单处理台" })).toBeInTheDocument();
    });
  });

  test("allows authenticated ops admin visits to open the guardian support console", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900,
      userId: "user-1"
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/v1/users/me/profile")) {
          return jsonResponse({
            id: "user-1",
            email: "ops-reviewer@example.com",
            system_roles: ["learner", "ops"],
            status: "active",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
        if (url.includes("/internal/minor-guardian/support-requests")) {
          return jsonResponse({
            total_count: 0,
            page: 1,
            page_size: 10,
            has_next_page: false,
            ordered_by: "updated_at_desc",
            status_summary: {
              pending_review: 0,
              contacted: 0,
              closed: 0
            },
            sla_summary: {
              within_sla: 0,
              due_soon: 0,
              breached: 0
            },
            dashboard_summary: {
              open_count: 0,
              assigned_open_count: 0,
              unassigned_open_count: 0,
              breached_open_count: 0,
              due_soon_open_count: 0,
              oldest_open_wait_minutes: 0,
              average_open_wait_minutes: 0
            },
            items: []
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }) as typeof fetch
    );
    window.history.pushState({}, "", "/admin");

    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/admin");
      expect(screen.getByRole("heading", { name: "监护人工单处理台" })).toBeInTheDocument();
    });
    expect(screen.getByText(/总数: 0/)).toBeInTheDocument();
  });

  test("redirects authenticated subscription visits back to home in self-hosted mode", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900,
      userId: "user-1"
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/v1/users/me/profile")) {
          return jsonResponse({
            id: "user-1",
            email: "learner@example.com",
            system_roles: ["learner"],
            status: "active",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }) as typeof fetch
    );
    window.history.pushState({}, "", "/subscription");

    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/home");
    });
    expect(screen.getByRole("heading", { name: "IELTS 自托管学习首页" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "订阅权益" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "监护人工单处理台" })).not.toBeInTheDocument();
  });
});
