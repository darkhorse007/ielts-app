import { useState } from "react";
import type { ApiClient } from "../lib/api-client";
import { TokenStorage } from "../lib/token-storage";

type MockExamPageProps = {
  apiClient: Pick<
    ApiClient,
    | "createMockExam"
    | "getMockExam"
    | "saveMockExamProgress"
    | "recoverMockExam"
    | "submitMockExam"
    | "getMockExamReport"
    | "undoMockExamWriteback"
    | "exportMockExamReport"
  >;
  tokenStorage: TokenStorage;
};

export const MockExamPage = ({ apiClient, tokenStorage }: MockExamPageProps) => {
  const [examId, setExamId] = useState("");
  const [skill, setSkill] = useState<"listening" | "speaking" | "reading" | "writing">("reading");
  const [answeredCount, setAnsweredCount] = useState("20");
  const [status, setStatus] = useState("未开始");
  const [reportText, setReportText] = useState("-");
  const [error, setError] = useState<string | null>(null);

  const withToken = (): string => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      throw new Error("会话已失效，请重新登录");
    }
    return accessToken;
  };

  const create = async (): Promise<void> => {
    try {
      const exam = await apiClient.createMockExam(withToken());
      setExamId(exam.exam_id);
      setStatus(`模考创建成功，当前科目=${exam.current_skill}`);
      setError(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建模考失败");
    }
  };

  const saveProgress = async (completed: boolean): Promise<void> => {
    if (!examId) {
      setError("请先创建模考");
      return;
    }
    try {
      const exam = await apiClient.saveMockExamProgress(withToken(), examId, {
        skill,
        answered_count: Number(answeredCount) || 0,
        completed
      });
      setStatus(`进度已保存，current=${exam.current_skill}`);
      setError(null);
    } catch (progressError) {
      setError(progressError instanceof Error ? progressError.message : "保存进度失败");
    }
  };

  const recover = async (): Promise<void> => {
    if (!examId) {
      setError("请先创建模考");
      return;
    }
    try {
      const exam = await apiClient.recoverMockExam(withToken(), examId);
      setStatus(exam.recovered ? "模考恢复成功" : "模考无需恢复");
      setError(null);
    } catch (recoverError) {
      setError(recoverError instanceof Error ? recoverError.message : "恢复模考失败");
    }
  };

  const submit = async (): Promise<void> => {
    if (!examId) {
      setError("请先创建模考");
      return;
    }
    try {
      const result = await apiClient.submitMockExam(withToken(), examId, {
        skill_bands: {
          listening: 6.5,
          speaking: 6,
          reading: 6,
          writing: 6
        }
      });
      setStatus(`模考提交完成，overall=${result.report.total_estimated_band}`);
      setReportText(
        `L${result.report.skill_band_estimates.listening}/S${result.report.skill_band_estimates.speaking}/R${result.report.skill_band_estimates.reading}/W${result.report.skill_band_estimates.writing}`
      );
      setError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交模考失败");
    }
  };

  const loadReport = async (): Promise<void> => {
    if (!examId) {
      setError("请先创建模考");
      return;
    }
    try {
      const report = await apiClient.getMockExamReport(withToken(), examId);
      setReportText(
        `overall=${report.total_estimated_band}; writeback=${String(report.plan_writeback?.applied ?? false)}`
      );
      setStatus("已加载模考报告");
      setError(null);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "加载报告失败");
    }
  };

  const undoWriteback = async (): Promise<void> => {
    if (!examId) {
      setError("请先创建模考");
      return;
    }
    try {
      const report = await apiClient.undoMockExamWriteback(withToken(), examId);
      setReportText(
        `overall=${report.total_estimated_band}; undo_available=${String(report.plan_writeback?.undo_available ?? false)}`
      );
      setStatus("已撤销计划回写");
      setError(null);
    } catch (undoError) {
      setError(undoError instanceof Error ? undoError.message : "撤销失败");
    }
  };

  const exportReport = async (): Promise<void> => {
    if (!examId) {
      setError("请先创建模考");
      return;
    }
    try {
      const exported = await apiClient.exportMockExamReport(withToken(), examId);
      setStatus(`已导出报告 ${exported.filename}`);
      setReportText(exported.content.slice(0, 80));
      setError(null);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "导出报告失败");
    }
  };

  const loadExam = async (): Promise<void> => {
    if (!examId) {
      setError("请先创建模考");
      return;
    }
    try {
      const exam = await apiClient.getMockExam(withToken(), examId);
      setStatus(`模考状态=${exam.status}，剩余=${exam.remaining_seconds}s`);
      setError(null);
    } catch (examError) {
      setError(examError instanceof Error ? examError.message : "加载模考失败");
    }
  };

  return (
    <section>
      <h1>全科模考与复盘</h1>
      {error ? <p role="alert">{error}</p> : null}

      <button type="button" onClick={() => void create()}>
        创建模考
      </button>
      <button type="button" onClick={() => void loadExam()}>
        拉取模考状态
      </button>

      <p>exam_id: {examId || "-"}</p>

      <label htmlFor="mock-skill">科目</label>
      <select
        id="mock-skill"
        value={skill}
        onChange={(event) => setSkill(event.target.value as "listening" | "speaking" | "reading" | "writing")}
      >
        <option value="listening">listening</option>
        <option value="speaking">speaking</option>
        <option value="reading">reading</option>
        <option value="writing">writing</option>
      </select>

      <label htmlFor="mock-answered-count">完成题数</label>
      <input
        id="mock-answered-count"
        value={answeredCount}
        onChange={(event) => setAnsweredCount(event.target.value)}
      />

      <button type="button" onClick={() => void saveProgress(false)}>
        保存进度
      </button>
      <button type="button" onClick={() => void saveProgress(true)}>
        提交当前科目
      </button>
      <button type="button" onClick={() => void recover()}>
        恢复模考
      </button>
      <button type="button" onClick={() => void submit()}>
        提交整场模考
      </button>
      <button type="button" onClick={() => void loadReport()}>
        加载复盘报告
      </button>
      <button type="button" onClick={() => void undoWriteback()}>
        撤销计划回写
      </button>
      <button type="button" onClick={() => void exportReport()}>
        导出报告
      </button>

      <p>report: {reportText}</p>
      <p>status: {status}</p>
    </section>
  );
};
