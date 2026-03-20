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

  test("allows authenticated users to open admin route", () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900,
      userId: "user-1"
    });
    window.history.pushState({}, "", "/admin");

    render(<App />);

    expect(screen.getByRole("heading", { name: "后台登录与订单权益管理" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/admin");
  });
});
