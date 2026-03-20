import { beforeEach, describe, expect, test } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "../src/App";
import { TokenStorage } from "../src/lib/token-storage";

describe("app route guards", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, "", "/login");
  });

  test("redirects unauthenticated admin visits to login", async () => {
    window.history.pushState({}, "", "/admin");

    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/login");
    });
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
  });

  test("redirects authenticated admin visits back to home in self-hosted mode", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900,
      userId: "user-1"
    });
    window.history.pushState({}, "", "/admin");

    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/home");
    });
    expect(screen.getByRole("heading", { name: "IELTS 自托管学习首页" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "订阅权益" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "后台管理" })).not.toBeInTheDocument();
  });

  test("redirects authenticated subscription visits back to home in self-hosted mode", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900,
      userId: "user-1"
    });
    window.history.pushState({}, "", "/subscription");

    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/home");
    });
    expect(screen.getByRole("heading", { name: "IELTS 自托管学习首页" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "订阅权益" })).not.toBeInTheDocument();
  });
});
