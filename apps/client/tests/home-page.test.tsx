import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { clearCachedSessionProfile } from "../src/lib/session-profile-cache";
import { TokenStorage } from "../src/lib/token-storage";
import { HomePage } from "../src/pages/HomePage";

const createTokenStorage = () => {
  const tokenStorage = new TokenStorage();
  tokenStorage.save({
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresIn: 900,
    userId: "user-1"
  });
  return tokenStorage;
};

const createPlanTask = (overrides?: Record<string, unknown>) => ({
  task_id: "task-1",
  skill: "listening" as const,
  task_type: "foundation",
  title: "精听错题复盘",
  target_minutes: 45,
  completion_criteria: "完成 1 次复盘",
  day_of_week: 1,
  status: "todo" as const,
  ...overrides
});

const createPlanWeek = (tasks = [createPlanTask()], overrides?: Record<string, unknown>) => ({
  week_id: "week-1",
  week_no: 1,
  goals: ["首周目标"],
  tasks,
  ...overrides
});

const createActivePlan = (weeks = [createPlanWeek()]) => ({
  plan_id: "plan-1",
  status: "active" as const,
  horizon_weeks: 8,
  version: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  adjustment_history: [],
  weeks
});

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    resolve,
    reject
  };
};

describe("home page", () => {
  beforeEach(() => {
    localStorage.clear();
    clearCachedSessionProfile();
  });

  afterEach(() => {
    clearCachedSessionProfile();
    vi.restoreAllMocks();
  });

  test("shows the next actionable plan task as the primary CTA", async () => {
    const tokenStorage = createTokenStorage();
    const getProfile = vi.fn().mockResolvedValue({
      id: "user-1",
      email: "learner@example.com",
      system_roles: ["learner"],
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const fetchActivePlan = vi.fn().mockResolvedValue(createActivePlan());

    render(<HomePage apiClient={{ getProfile, fetchActivePlan }} tokenStorage={tokenStorage} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "直接进入当前计划任务" })).toBeInTheDocument();
    });
    expect(screen.getByText("当前计划下一步：精听错题复盘")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "进入听力训练" })).toHaveAttribute("href", "/practice/listening");
    expect(screen.queryByRole("link", { name: "监护人工单处理台" })).not.toBeInTheDocument();
    expect(getProfile).toHaveBeenCalledWith("access-token");
    expect(fetchActivePlan).toHaveBeenCalledWith("access-token");
  });

  test("prefers an in-progress task over earlier completed tasks", async () => {
    const tokenStorage = createTokenStorage();
    const getProfile = vi.fn().mockResolvedValue({
      id: "user-1",
      email: "learner@example.com",
      system_roles: ["learner"],
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const fetchActivePlan = vi.fn().mockResolvedValue(
      createActivePlan([
        createPlanWeek(
          [
            createPlanTask({
              task_id: "task-done-1",
              title: "已完成听力任务",
              status: "done"
            }),
            createPlanTask({
              task_id: "task-skipped-1",
              skill: "reading",
              title: "已跳过阅读任务",
              status: "skipped"
            }),
            createPlanTask({
              task_id: "task-todo-1",
              skill: "writing",
              title: "候选写作任务",
              status: "todo"
            })
          ],
          {
            week_id: "week-1",
            week_no: 1
          }
        ),
        createPlanWeek(
          [
            createPlanTask({
              task_id: "task-doing-1",
              skill: "speaking",
              title: "当前口语冲刺",
              status: "doing",
              day_of_week: 2
            })
          ],
          {
            week_id: "week-2",
            week_no: 2
          }
        )
      ])
    );

    render(<HomePage apiClient={{ getProfile, fetchActivePlan }} tokenStorage={tokenStorage} />);

    await waitFor(() => {
      expect(screen.getByText("当前计划下一步：当前口语冲刺")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "进入口语训练" })).toHaveAttribute("href", "/speaking-live");
  });

  test("falls back to diagnostic when the active plan has no actionable task", async () => {
    const tokenStorage = createTokenStorage();
    const getProfile = vi.fn().mockResolvedValue({
      id: "user-1",
      email: "learner@example.com",
      system_roles: ["learner"],
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const fetchActivePlan = vi.fn().mockResolvedValue(createActivePlan([createPlanWeek([])]));

    render(<HomePage apiClient={{ getProfile, fetchActivePlan }} tokenStorage={tokenStorage} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "开始今天的学习主线" })).toBeInTheDocument();
    });
    expect(screen.getByText("当前计划还没有排入可执行任务，先完成首次诊断。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "进入首次诊断" })).toHaveAttribute("href", "/diagnostic");
  });

  test("falls back to diagnostic on plan fetch failure while keeping ops entry visible", async () => {
    const tokenStorage = createTokenStorage();
    const getProfile = vi.fn().mockResolvedValue({
      id: "ops-user-1",
      email: "ops@example.com",
      system_roles: ["learner", "ops"],
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const fetchActivePlan = vi.fn().mockRejectedValue(new Error("plan unavailable"));

    render(<HomePage apiClient={{ getProfile, fetchActivePlan }} tokenStorage={tokenStorage} />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "进入首次诊断" })).toHaveAttribute("href", "/diagnostic");
    });
    expect(screen.getByText("当前计划暂时无法加载，先回到首次诊断继续主线。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "监护人工单处理台" })).toHaveAttribute("href", "/admin");
  });

  test("does not block plan CTA when profile request is still pending", async () => {
    const tokenStorage = createTokenStorage();
    const profileDeferred = createDeferred<{
      id: string;
      email: string;
      system_roles: string[];
      status: "active";
      created_at: string;
      updated_at: string;
    }>();
    const getProfile = vi.fn().mockReturnValue(profileDeferred.promise);
    const fetchActivePlan = vi.fn().mockResolvedValue(
      createActivePlan([
        createPlanWeek([
          createPlanTask({
            task_id: "task-reading-1",
            skill: "reading",
            title: "阅读限时冲刺",
            status: "todo"
          })
        ])
      ])
    );

    render(<HomePage apiClient={{ getProfile, fetchActivePlan }} tokenStorage={tokenStorage} />);

    await waitFor(() => {
      expect(screen.getByText("当前计划下一步：阅读限时冲刺")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "进入阅读训练" })).toHaveAttribute("href", "/practice/reading");
    expect(screen.queryByRole("link", { name: "监护人工单处理台" })).not.toBeInTheDocument();

    await act(async () => {
      profileDeferred.resolve({
        id: "ops-user-2",
        email: "ops2@example.com",
        system_roles: ["learner", "ops"],
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "监护人工单处理台" })).toHaveAttribute("href", "/admin");
    });
  });
});
