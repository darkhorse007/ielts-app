import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OnboardingPage } from "../src/pages/OnboardingPage";
import { TokenStorage } from "../src/lib/token-storage";

beforeEach(() => {
  localStorage.clear();
});

describe("S1 onboarding page", () => {
  test("validates fields and supports retry after failed submit", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900,
      userId: "u-1"
    });

    const submitOnboarding = vi
      .fn()
      .mockRejectedValueOnce(new Error("网络异常"))
      .mockResolvedValueOnce({
        assessment_id: "assessment-2",
        plan_id: "plan-2",
        status: "processing"
      });

    const fetchOnboardingStatus = vi.fn().mockResolvedValue({
      assessment_id: "assessment-2",
      plan_id: "plan-2",
      status: "completed",
      updated_at: new Date().toISOString()
    });

    render(
      <OnboardingPage
        apiClient={{
          submitOnboarding,
          fetchOnboardingStatus
        }}
        tokenStorage={tokenStorage}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "提交目标" }));
    expect(screen.getByRole("alert")).toHaveTextContent("请填写考试日期");

    fireEvent.change(screen.getByLabelText("考试日期"), {
      target: {
        value: "2026-12-01"
      }
    });

    fireEvent.change(screen.getByLabelText("目标分"), {
      target: {
        value: "6.5"
      }
    });

    fireEvent.change(screen.getByLabelText("每周学习时长"), {
      target: {
        value: "12"
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "提交目标" }));

    await waitFor(() => {
      expect(submitOnboarding).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByRole("alert")).toHaveTextContent("网络异常");

    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitFor(() => {
      expect(submitOnboarding).toHaveBeenCalledTimes(2);
      expect(fetchOnboardingStatus).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: completed/)).toBeInTheDocument();
    });
  });
});
