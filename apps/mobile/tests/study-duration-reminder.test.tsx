import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AppState } from "react-native";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { StudyDurationReminderProvider } from "../src/state/study-duration-reminder";

let mockedPathname = "/listening";

vi.mock("expo-router", () => ({
  usePathname: () => mockedPathname
}));

const mockedAppState = AppState as typeof AppState & {
  __emitMockStateChange: (state: "active" | "background" | "inactive") => void;
};

describe("study duration reminder", () => {
  beforeEach(() => {
    mockedPathname = "/listening";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T04:00:00.000Z"));
    mockedAppState.__emitMockStateChange("active");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("shows reminder after continuous study and supports snooze", () => {
    render(
      <StudyDurationReminderProvider>
        <div>study screen</div>
      </StudyDurationReminderProvider>
    );

    expect(screen.queryByText("建议先休息一下")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(45 * 60 * 1000);
    });

    expect(screen.getByText("建议先休息一下")).toBeTruthy();
    expect(screen.getByTestId("study.durationReminder.message").textContent).toContain("连续学习约 45 分钟");

    fireEvent.click(screen.getByText("15 分钟后再提醒"));
    expect(screen.queryByText("建议先休息一下")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(14 * 60 * 1000);
    });
    expect(screen.queryByText("建议先休息一下")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });
    expect(screen.getByText("建议先休息一下")).toBeTruthy();
  });

  test("resets countdown after leaving study routes or moving app to background", () => {
    const view = render(
      <StudyDurationReminderProvider>
        <div>study screen</div>
      </StudyDurationReminderProvider>
    );

    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000);
    });

    mockedPathname = "/account";
    view.rerender(
      <StudyDurationReminderProvider>
        <div>account screen</div>
      </StudyDurationReminderProvider>
    );

    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000);
    });
    expect(screen.queryByText("建议先休息一下")).toBeNull();

    mockedPathname = "/reading";
    view.rerender(
      <StudyDurationReminderProvider>
        <div>reading screen</div>
      </StudyDurationReminderProvider>
    );

    act(() => {
      vi.advanceTimersByTime(20 * 60 * 1000);
      mockedAppState.__emitMockStateChange("background");
      vi.advanceTimersByTime(30 * 60 * 1000);
    });
    expect(screen.queryByText("建议先休息一下")).toBeNull();

    act(() => {
      mockedAppState.__emitMockStateChange("active");
    });

    act(() => {
      vi.advanceTimersByTime(45 * 60 * 1000);
    });
    expect(screen.getByText("建议先休息一下")).toBeTruthy();
  });

  test("uses night copy during night study window", () => {
    vi.setSystemTime(new Date("2026-04-03T14:00:00.000Z"));

    render(
      <StudyDurationReminderProvider>
        <div>night study</div>
      </StudyDurationReminderProvider>
    );

    act(() => {
      vi.advanceTimersByTime(20 * 60 * 1000);
    });

    expect(screen.getByTestId("study.durationReminder.message").textContent).toContain("现在已较晚");
  });
});
