import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { loadProgressFollowUp, saveProgressFollowUp } from "../src/lib/progress-follow-up";
import { TokenStorage } from "../src/lib/token-storage";
import { ProgressPage } from "../src/pages/ProgressPage";
import { AccountPage } from "../src/pages/AccountPage";

beforeEach(() => {
  localStorage.clear();
});

describe("S2 progress/account pages", () => {
  test("loads and syncs progress", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 900,
      userId: "u-1"
    });

    const getProgress = vi.fn().mockResolvedValue({
      listening_completed: 1,
      speaking_completed: 2,
      reading_completed: 3,
      writing_completed: 4,
      total_study_minutes: 50,
      streak_days: 5,
      server_version: 2,
      updated_at: new Date().toISOString()
    });

    const syncProgress = vi.fn().mockResolvedValue({
      listening_completed: 2,
      speaking_completed: 2,
      reading_completed: 3,
      writing_completed: 4,
      total_study_minutes: 60,
      streak_days: 6,
      server_version: 3,
      updated_at: new Date().toISOString(),
      stale_request: false,
      conflict_count: 0
    });

    const getProgressConflicts = vi.fn().mockResolvedValue({
      items: []
    });

    render(
      <ProgressPage
        apiClient={{
          getProgress,
          syncProgress,
          getProgressConflicts
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(getProgress).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: 已加载服务端进度/)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "回到学习计划" })).toHaveAttribute("href", "/plan");

    fireEvent.change(screen.getByLabelText("总学习分钟数"), {
      target: {
        value: "80"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "同步进度" }));

    await waitFor(() => {
      expect(syncProgress).toHaveBeenCalledTimes(1);
      expect(getProgressConflicts).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: 同步成功/)).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { level: 2, name: "继续听力训练" })).toBeInTheDocument();
    expect(screen.getByText("听力进度已写回服务端，下一步可返回训练页继续推进。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "回到听力训练" })).toHaveAttribute("href", "/practice/listening");
  });

  test("syncs stale progress response back into the editable fields", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 900,
      userId: "u-1"
    });

    const getProgress = vi.fn().mockResolvedValue({
      listening_completed: 1,
      speaking_completed: 2,
      reading_completed: 3,
      writing_completed: 4,
      total_study_minutes: 50,
      streak_days: 5,
      server_version: 2,
      updated_at: new Date().toISOString()
    });

    const syncProgress = vi.fn().mockResolvedValue({
      listening_completed: 4,
      speaking_completed: 3,
      reading_completed: 5,
      writing_completed: 6,
      total_study_minutes: 60,
      streak_days: 6,
      server_version: 3,
      updated_at: new Date().toISOString(),
      stale_request: true,
      conflict_count: 1
    });

    const getProgressConflicts = vi.fn().mockResolvedValue({
      items: [
        {
          id: "conflict-1"
        }
      ]
    });

    render(
      <ProgressPage
        apiClient={{
          getProgress,
          syncProgress,
          getProgressConflicts
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(getProgress).toHaveBeenCalledTimes(1);
      expect(screen.getByDisplayValue("50")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("总学习分钟数"), {
      target: {
        value: "999"
      }
    });
    fireEvent.change(screen.getByLabelText("连续学习天数"), {
      target: {
        value: "12"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "同步进度" }));

    await waitFor(() => {
      expect(syncProgress).toHaveBeenCalledTimes(1);
      expect(getProgressConflicts).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: 同步请求为旧版本，使用服务端数据/)).toBeInTheDocument();
    });

    expect(screen.getByLabelText("听力完成数")).toHaveValue("4");
    expect(screen.getByLabelText("口语完成数")).toHaveValue("3");
    expect(screen.getByLabelText("阅读完成数")).toHaveValue("5");
    expect(screen.getByLabelText("写作完成数")).toHaveValue("6");
    expect(screen.getByLabelText("总学习分钟数")).toHaveValue("60");
    expect(screen.getByLabelText("连续学习天数")).toHaveValue("6");
    expect(screen.getByText(/conflicts: 1/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "回看学习计划" })).toBeInTheDocument();
    expect(screen.getByText("服务端进度已覆盖本地修改，下一步先回计划页核对当前任务。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "回到学习计划" })).toHaveAttribute("href", "/plan");
  });

  test("prefers explicit follow-up source over delta inference after sync", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 900,
      userId: "u-1"
    });

    saveProgressFollowUp("u-1", {
      title: "继续阅读训练",
      detail: "刚完成一次阅读提交，下一步可回到训练页继续复盘或再练一轮。",
      route: "/practice/reading",
      actionLabel: "回到阅读训练"
    });

    const getProgress = vi.fn().mockResolvedValue({
      listening_completed: 1,
      speaking_completed: 2,
      reading_completed: 3,
      writing_completed: 4,
      total_study_minutes: 50,
      streak_days: 5,
      server_version: 2,
      updated_at: new Date().toISOString()
    });

    const syncProgress = vi.fn().mockResolvedValue({
      listening_completed: 2,
      speaking_completed: 2,
      reading_completed: 3,
      writing_completed: 4,
      total_study_minutes: 60,
      streak_days: 6,
      server_version: 3,
      updated_at: new Date().toISOString(),
      stale_request: false,
      conflict_count: 0
    });

    const getProgressConflicts = vi.fn().mockResolvedValue({
      items: []
    });

    render(
      <ProgressPage
        apiClient={{
          getProgress,
          syncProgress,
          getProgressConflicts
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(getProgress).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: 已加载服务端进度/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "同步进度" }));

    await waitFor(() => {
      expect(syncProgress).toHaveBeenCalledTimes(1);
      expect(getProgressConflicts).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: 同步成功/)).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { level: 2, name: "继续阅读训练" })).toBeInTheDocument();
    expect(screen.getByText("刚完成一次阅读提交，下一步可回到训练页继续复盘或再练一轮。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "回到阅读训练" })).toHaveAttribute("href", "/practice/reading");
    expect(loadProgressFollowUp("u-1")).toBeNull();
  });

  test("requests deletion then deletes account", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 900,
      userId: "u-1"
    });

    const getProfile = vi.fn().mockResolvedValue({
      id: "u-1",
      system_roles: ["learner"],
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const requestDeletion = vi.fn().mockResolvedValue({
      user_id: "u-1",
      status: "pending_deletion",
      deletion_requested_at: new Date().toISOString()
    });

    const deleteAccount = vi.fn().mockResolvedValue({
      user_id: "u-1",
      status: "deleted",
      deleted_at: new Date().toISOString(),
      revoked_sessions: 1,
      removed_assessments: 1,
      removed_plans: 1,
      removed_goal_profiles: 1,
      removed_progress_conflicts: 0
    });

    const getReminderPreference = vi.fn().mockResolvedValue({
      subscribed: true,
      active_hour_utc: 20,
      updated_at: new Date().toISOString()
    });

    const updateReminderPreference = vi.fn().mockResolvedValue({
      subscribed: false,
      active_hour_utc: 20,
      updated_at: new Date().toISOString()
    });

    const getReminderRecommendation = vi.fn().mockResolvedValue({
      subscribed: true,
      active_hour_utc: 20,
      reminder_id: "r-1",
      scheduled_at: new Date().toISOString(),
      reason: "based on active hours",
      deep_link: "/plan?from=reminder&task_id=t-1"
    });

    const clickReminder = vi.fn().mockResolvedValue({
      reminder_id: "r-1",
      deep_link: "/plan?from=reminder&task_id=t-1",
      clicked_at: new Date().toISOString()
    });

    render(
      <AccountPage
        apiClient={{
          getProfile,
          requestDeletion,
          deleteAccount,
          getReminderPreference,
          updateReminderPreference,
          getReminderRecommendation,
          clickReminder
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(getProfile).toHaveBeenCalledTimes(1);
      expect(getReminderPreference).toHaveBeenCalledTimes(1);
      expect(getReminderRecommendation).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/账号状态: active/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "申请注销" }));
    await waitFor(() => {
      expect(requestDeletion).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/账号状态: pending_deletion/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "立即删除账号" }));
    await waitFor(() => {
      expect(deleteAccount).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/账号状态: deleted/)).toBeInTheDocument();
    });

    expect(tokenStorage.getAccessToken()).toBeNull();
  });

  test("updates reminder preference and tracks reminder click", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 900,
      userId: "u-2"
    });

    const getProfile = vi.fn().mockResolvedValue({
      id: "u-2",
      system_roles: ["learner"],
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const requestDeletion = vi.fn();
    const deleteAccount = vi.fn();

    const getReminderPreference = vi.fn().mockResolvedValue({
      subscribed: true,
      active_hour_utc: 21,
      updated_at: new Date().toISOString()
    });
    const updateReminderPreference = vi.fn().mockResolvedValue({
      subscribed: false,
      active_hour_utc: 21,
      updated_at: new Date().toISOString()
    });
    const getReminderRecommendation = vi.fn().mockResolvedValue({
      subscribed: true,
      active_hour_utc: 21,
      reminder_id: "r-99",
      scheduled_at: new Date().toISOString(),
      reason: "active time",
      deep_link: "/plan?from=reminder&task_id=t-99"
    });
    const clickReminder = vi.fn().mockResolvedValue({
      reminder_id: "r-99",
      deep_link: "/plan?from=reminder&task_id=t-99",
      clicked_at: new Date().toISOString()
    });

    render(
      <AccountPage
        apiClient={{
          getProfile,
          requestDeletion,
          deleteAccount,
          getReminderPreference,
          updateReminderPreference,
          getReminderRecommendation,
          clickReminder
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(getReminderRecommendation).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/reminder_id: r-99/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "模拟点击提醒" }));
    await waitFor(() => {
      expect(clickReminder).toHaveBeenCalledTimes(1);
      expect(screen.getByText("直达任务页")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("checkbox", { name: "接收个性化学习提醒" }));
    fireEvent.click(screen.getByRole("button", { name: "保存提醒设置" }));
    await waitFor(() => {
      expect(updateReminderPreference).toHaveBeenCalledTimes(1);
      expect(updateReminderPreference).toHaveBeenCalledWith("access", { subscribed: false });
      expect(screen.getByText(/提醒设置已保存/)).toBeInTheDocument();
    });
  });
});
