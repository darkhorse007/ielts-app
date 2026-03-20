import { useState } from "react";
import type { ApiClient } from "../lib/api-client";
import { TokenStorage } from "../lib/token-storage";

type DiagnosticPageProps = {
  apiClient: Pick<
    ApiClient,
    "fetchDiagnosticQuestions" | "submitDiagnosticAnswer" | "pauseDiagnostic" | "resumeDiagnostic" | "completeDiagnostic"
  >;
  tokenStorage: TokenStorage;
};

export const DiagnosticPage = ({ apiClient, tokenStorage }: DiagnosticPageProps) => {
  const [assessmentId, setAssessmentId] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("未开始");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [skillBandText, setSkillBandText] = useState("-");
  const [error, setError] = useState<string | null>(null);

  const withToken = (): string => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      throw new Error("会话已失效，请重新登录");
    }
    return accessToken;
  };

  const loadQuestions = async (): Promise<void> => {
    if (!assessmentId.trim()) {
      setError("请先填写 assessment_id");
      return;
    }

    try {
      const response = await apiClient.fetchDiagnosticQuestions(withToken(), assessmentId.trim());
      setStatus(response.status);
      setElapsedSeconds(response.elapsed_seconds);
      setQuestionId(response.questions[response.current_question_index]?.question_id ?? response.questions[0]?.question_id ?? "");
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载题目失败");
    }
  };

  const submitAnswer = async (): Promise<void> => {
    if (!assessmentId.trim() || !questionId.trim()) {
      setError("请先加载题目");
      return;
    }

    try {
      const response = await apiClient.submitDiagnosticAnswer(
        withToken(),
        assessmentId.trim(),
        questionId.trim(),
        answer
      );
      setStatus(response.status);
      setError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交答案失败");
    }
  };

  const pause = async (): Promise<void> => {
    try {
      const response = await apiClient.pauseDiagnostic(withToken(), assessmentId.trim());
      setStatus(response.status);
      setElapsedSeconds(response.elapsed_seconds);
      setError(null);
    } catch (pauseError) {
      setError(pauseError instanceof Error ? pauseError.message : "暂停失败");
    }
  };

  const resume = async (): Promise<void> => {
    try {
      const response = await apiClient.resumeDiagnostic(withToken(), assessmentId.trim());
      setStatus(response.status);
      setElapsedSeconds(response.elapsed_seconds);
      setError(null);
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : "恢复失败");
    }
  };

  const complete = async (): Promise<void> => {
    try {
      const response = await apiClient.completeDiagnostic(withToken(), assessmentId.trim());
      setStatus(response.status);
      setElapsedSeconds(response.elapsed_seconds);
      setSkillBandText(
        `L${response.skill_bands.listening}/S${response.skill_bands.speaking}/R${response.skill_bands.reading}/W${response.skill_bands.writing}`
      );
      setError(null);
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : "完成诊断失败");
    }
  };

  return (
    <section>
      <h1>首次诊断</h1>
      {error ? <p role="alert">{error}</p> : null}

      <label htmlFor="diagnostic-assessment-id">assessment_id</label>
      <input
        id="diagnostic-assessment-id"
        value={assessmentId}
        onChange={(event) => setAssessmentId(event.target.value)}
      />

      <label htmlFor="diagnostic-question-id">question_id</label>
      <input
        id="diagnostic-question-id"
        value={questionId}
        onChange={(event) => setQuestionId(event.target.value)}
      />

      <label htmlFor="diagnostic-answer">回答</label>
      <textarea
        id="diagnostic-answer"
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
      />

      <button type="button" onClick={loadQuestions}>
        加载题目
      </button>
      <button type="button" onClick={submitAnswer}>
        提交答案
      </button>
      <button type="button" onClick={pause}>
        暂停
      </button>
      <button type="button" onClick={resume}>
        恢复
      </button>
      <button type="button" onClick={complete}>
        完成诊断
      </button>

      <p>status: {status}</p>
      <p>elapsed_seconds: {elapsedSeconds}</p>
      <p>skill_bands: {skillBandText}</p>
    </section>
  );
};
