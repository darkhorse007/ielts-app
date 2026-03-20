import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TokenStorage } from "../src/lib/token-storage";
import { DiagnosticPage } from "../src/pages/DiagnosticPage";
import { StudyPlanPage } from "../src/pages/StudyPlanPage";

beforeEach(() => {
  localStorage.clear();
});

describe("S2 diagnostic/plan pages", () => {
  test("runs diagnostic actions and displays completion bands", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 900,
      userId: "u-1"
    });

    const fetchDiagnosticQuestions = vi.fn().mockResolvedValue({
      assessment_id: "a-1",
      status: "in_progress",
      answered_count: 0,
      total_questions: 8,
      elapsed_seconds: 10,
      current_question_index: 0,
      questions: [
        {
          question_id: "q-1",
          skill: "speaking",
          prompt: "prompt"
        }
      ]
    });

    const submitDiagnosticAnswer = vi.fn().mockResolvedValue({
      assessment_id: "a-1",
      answered_count: 1,
      total_questions: 8,
      current_question_index: 1,
      status: "in_progress"
    });

    const pauseDiagnostic = vi.fn().mockResolvedValue({
      assessment_id: "a-1",
      status: "paused",
      elapsed_seconds: 20
    });

    const resumeDiagnostic = vi.fn().mockResolvedValue({
      assessment_id: "a-1",
      status: "in_progress",
      elapsed_seconds: 25
    });

    const completeDiagnostic = vi.fn().mockResolvedValue({
      assessment_id: "a-1",
      plan_id: "p-1",
      status: "completed",
      elapsed_seconds: 100,
      skill_bands: {
        listening: 6,
        speaking: 6.5,
        reading: 6,
        writing: 5.5
      }
    });

    render(
      <DiagnosticPage
        apiClient={{
          fetchDiagnosticQuestions,
          submitDiagnosticAnswer,
          pauseDiagnostic,
          resumeDiagnostic,
          completeDiagnostic
        }}
        tokenStorage={tokenStorage}
      />
    );

    fireEvent.change(screen.getByLabelText("assessment_id"), {
      target: {
        value: "a-1"
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "加载题目" }));
    await waitFor(() => {
      expect(fetchDiagnosticQuestions).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: in_progress/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("回答"), {
      target: {
        value: "answer"
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "提交答案" }));
    fireEvent.click(screen.getByRole("button", { name: "暂停" }));
    fireEvent.click(screen.getByRole("button", { name: "恢复" }));
    fireEvent.click(screen.getByRole("button", { name: "完成诊断" }));

    await waitFor(() => {
      expect(submitDiagnosticAnswer).toHaveBeenCalledTimes(1);
      expect(pauseDiagnostic).toHaveBeenCalledTimes(1);
      expect(resumeDiagnostic).toHaveBeenCalledTimes(1);
      expect(completeDiagnostic).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: completed/)).toBeInTheDocument();
      expect(screen.getByText(/skill_bands: L6\/S6.5\/R6\/W5.5/)).toBeInTheDocument();
    });
  });

  test("loads plan and adjusts task minutes", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 900,
      userId: "u-1"
    });

    const fetchActivePlan = vi.fn().mockResolvedValue({
      plan_id: "p-1",
      status: "active",
      horizon_weeks: 8,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      adjustment_history: [
        {
          adjustment_id: "adj-1",
          source_type: "practice_session",
          source_id: "s-1",
          skill: "speaking",
          reason: "speaking 最近表现 50%，任务时长 +20 分钟。表现未达标，增加训练量巩固薄弱点。",
          score: 0.5,
          created_at: new Date().toISOString(),
          changed_tasks: [
            {
              task_id: "t-1",
              skill: "speaking",
              before_target_minutes: 45,
              after_target_minutes: 65,
              before_completion_criteria: "c1",
              after_completion_criteria: "c1"
            }
          ]
        }
      ],
      weeks: [
        {
          week_id: "w-1",
          week_no: 1,
          goals: ["g1"],
          tasks: [
            {
              task_id: "t-1",
              skill: "speaking",
              task_type: "foundation",
              title: "task",
              target_minutes: 45,
              completion_criteria: "c1",
              day_of_week: 1,
              status: "todo"
            }
          ]
        }
      ]
    });

    const adjustPlanTask = vi.fn().mockResolvedValue({
      plan_id: "p-1",
      status: "active",
      horizon_weeks: 8,
      version: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      adjustment_history: [],
      weeks: [
        {
          week_id: "w-1",
          week_no: 1,
          goals: ["g1"],
          tasks: [
            {
              task_id: "t-1",
              skill: "speaking",
              task_type: "foundation",
              title: "task",
              target_minutes: 90,
              completion_criteria: "c1",
              day_of_week: 1,
              status: "todo"
            }
          ]
        }
      ]
    });
    const getPlanAdjustmentHistory = vi.fn().mockResolvedValue({
      total: 1,
      page: 1,
      page_size: 20,
      items: [
        {
          adjustment_id: "adj-1",
          source_type: "practice_session",
          source_id: "s-1",
          skill: "speaking",
          reason: "speaking 最近表现 50%，任务时长 +20 分钟。表现未达标，增加训练量巩固薄弱点。",
          score: 0.5,
          created_at: new Date().toISOString(),
          changed_tasks: [
            {
              task_id: "t-1",
              skill: "speaking",
              before_target_minutes: 45,
              after_target_minutes: 65,
              before_completion_criteria: "c1",
              after_completion_criteria: "c1"
            }
          ]
        }
      ]
    });

    render(
      <StudyPlanPage
        apiClient={{
          fetchActivePlan,
          adjustPlanTask,
          getPlanAdjustmentHistory
        }}
        tokenStorage={tokenStorage}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "加载计划" }));
    await waitFor(() => {
      expect(fetchActivePlan).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/week_count: 1/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("调整分钟数"), {
      target: {
        value: "90"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "更新任务时长" }));

    await waitFor(() => {
      expect(adjustPlanTask).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: 计划已更新，version=2/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "加载变更历史" }));
    await waitFor(() => {
      expect(getPlanAdjustmentHistory).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/adjustment_count: 1/)).toBeInTheDocument();
      expect(screen.getByText(/latest_adjustment_reason: speaking 最近表现 50%/)).toBeInTheDocument();
    });
  });
});
