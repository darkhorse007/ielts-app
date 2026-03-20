import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TokenStorage } from "../src/lib/token-storage";
import { MockExamPage } from "../src/pages/MockExamPage";

describe("S5 mock exam page", () => {
  test("supports mock exam creation, report load and export in self-hosted mode", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 900,
      userId: "u-1"
    });

    const createMockExam = vi.fn().mockResolvedValue({
      exam_id: "m-1",
      status: "in_progress",
      time_limit_seconds: 7200,
      elapsed_seconds: 10,
      remaining_seconds: 7190,
      current_skill: "reading",
      sections: []
    });
    const getMockExam = vi.fn().mockResolvedValue({
      exam_id: "m-1",
      status: "in_progress",
      time_limit_seconds: 7200,
      elapsed_seconds: 20,
      remaining_seconds: 7180,
      current_skill: "speaking",
      sections: []
    });
    const saveMockExamProgress = vi.fn().mockResolvedValue({
      exam_id: "m-1",
      status: "in_progress",
      time_limit_seconds: 7200,
      elapsed_seconds: 30,
      remaining_seconds: 7170,
      current_skill: "speaking",
      sections: []
    });
    const recoverMockExam = vi.fn().mockResolvedValue({
      exam_id: "m-1",
      status: "in_progress",
      time_limit_seconds: 7200,
      elapsed_seconds: 30,
      remaining_seconds: 7170,
      current_skill: "speaking",
      sections: [],
      recovered: true
    });
    const submitMockExam = vi.fn().mockResolvedValue({
      exam: {
        exam_id: "m-1",
        status: "completed",
        time_limit_seconds: 7200,
        elapsed_seconds: 3000,
        remaining_seconds: 4200,
        current_skill: "writing",
        sections: []
      },
      report: {
        report_id: "r-1",
        exam_id: "m-1",
        total_estimated_band: 6,
        skill_band_estimates: {
          listening: 6,
          speaking: 6,
          reading: 6,
          writing: 6
        },
        error_distribution: {
          listening: 12,
          speaking: 12,
          reading: 12,
          writing: 12
        },
        next_actions: ["a1"],
        generated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });
    const getMockExamReport = vi.fn().mockResolvedValue({
      report_id: "r-1",
      exam_id: "m-1",
      total_estimated_band: 6,
      skill_band_estimates: {
        listening: 6,
        speaking: 6,
        reading: 6,
        writing: 6
      },
      error_distribution: {
        listening: 12,
        speaking: 12,
        reading: 12,
        writing: 12
      },
      next_actions: ["a1"],
      generated_at: new Date().toISOString(),
      plan_writeback: {
        applied: true,
        reasons: ["r1"],
        undo_available: true,
        changed_tasks: []
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const undoMockExamWriteback = vi.fn().mockResolvedValue({
      report_id: "r-1",
      exam_id: "m-1",
      total_estimated_band: 6,
      skill_band_estimates: {
        listening: 6,
        speaking: 6,
        reading: 6,
        writing: 6
      },
      error_distribution: {
        listening: 12,
        speaking: 12,
        reading: 12,
        writing: 12
      },
      next_actions: ["a1"],
      generated_at: new Date().toISOString(),
      plan_writeback: {
        applied: true,
        reasons: ["r1"],
        undo_available: false,
        changed_tasks: []
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const exportMockExamReport = vi.fn().mockResolvedValue({
      filename: "report.txt",
      content: "mock report content"
    });

    render(
      <MockExamPage
        apiClient={{
          createMockExam,
          getMockExam,
          saveMockExamProgress,
          recoverMockExam,
          submitMockExam,
          getMockExamReport,
          undoMockExamWriteback,
          exportMockExamReport
        }}
        tokenStorage={tokenStorage}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "创建模考" }));
    await waitFor(() => {
      expect(createMockExam).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/exam_id: m-1/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "拉取模考状态" }));
    await waitFor(() => {
      expect(getMockExam).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "保存进度" }));
    await waitFor(() => {
      expect(saveMockExamProgress).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "恢复模考" }));
    await waitFor(() => {
      expect(recoverMockExam).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "提交整场模考" }));
    await waitFor(() => {
      expect(submitMockExam).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "加载复盘报告" }));
    await waitFor(() => {
      expect(getMockExamReport).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "撤销计划回写" }));
    await waitFor(() => {
      expect(undoMockExamWriteback).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "导出报告" }));
    await waitFor(() => {
      expect(exportMockExamReport).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: 已导出报告 report.txt/)).toBeInTheDocument();
    });
  });
});
