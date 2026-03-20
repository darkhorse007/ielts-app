import { describe, expect, test, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RegisterPage } from "../src/pages/RegisterPage";
import { LoginPage } from "../src/pages/LoginPage";
import { TokenStorage } from "../src/lib/token-storage";

beforeEach(() => {
  localStorage.clear();
});

describe("S1 register/login pages", () => {
  test("register validates input and submits when valid", async () => {
    const register = vi.fn().mockResolvedValue({ user_id: "u-1" });
    const onRegistered = vi.fn();

    render(<RegisterPage apiClient={{ register }} onRegistered={onRegistered} />);

    fireEvent.click(screen.getByRole("button", { name: "注册" }));
    expect(screen.getByRole("alert")).toHaveTextContent("请填写邮箱或手机号");

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: {
        value: "user@example.com"
      }
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: {
        value: "StrongPass123"
      }
    });
    fireEvent.change(screen.getByLabelText("确认密码"), {
      target: {
        value: "StrongPass123"
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    await waitFor(() => {
      expect(register).toHaveBeenCalledTimes(1);
      expect(onRegistered).toHaveBeenCalledTimes(1);
    });
  });

  test("login saves token and triggers navigation callback", async () => {
    const tokenStorage = new TokenStorage();
    const onLoginSuccess = vi.fn();
    const login = vi.fn().mockResolvedValue({
      access_token: "access",
      refresh_token: "refresh",
      expires_in: 900,
      user_id: "user-id",
      session_id: "session-id"
    });

    render(
      <LoginPage
        apiClient={{ login }}
        tokenStorage={tokenStorage}
        onLoginSuccess={onLoginSuccess}
      />
    );

    fireEvent.change(screen.getByLabelText("邮箱或手机号"), {
      target: {
        value: "user@example.com"
      }
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: {
        value: "StrongPass123"
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledTimes(1);
      expect(onLoginSuccess).toHaveBeenCalledTimes(1);
    });

    expect(tokenStorage.getAccessToken()).toBe("access");
    expect(tokenStorage.getRefreshToken()).toBe("refresh");
    expect(tokenStorage.getUserId()).toBe("user-id");
  });
});
