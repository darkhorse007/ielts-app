import { useState } from "react";
import type { ApiClient } from "../lib/api-client";
import { resolveLearningRouteForPlanTask, selectNextActionablePlanTask } from "../lib/learning-routes";
import { TokenStorage } from "../lib/token-storage";

type CompletionTaskAction = {
  route: string;
  actionLabel: string;
  taskTitle: string;
};

type DiagnosticPageProps = {
  apiClient: Pick<
    ApiClient,
    "fetchDiagnosticQuestions" | "submitDiagnosticAnswer" | "pauseDiagnostic" | "resumeDiagnostic" | "completeDiagnostic"
  > &
    Partial<Pick<ApiClient, "fetchActivePlan">>;
  tokenStorage: TokenStorage;
};

export const DiagnosticPage = ({ apiClient, tokenStorage }: DiagnosticPageProps) => {
  const [assessmentId, setAssessmentId] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("未开始");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [skillBandText, setSkillBandText] = useState("-");
  const [planId, setPlanId] = useState<string | null>(null);
  const [completionTaskAction, setCompletionTaskAction] = useState<CompletionTaskAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const withToken = (): string => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      throw new Error("会话已失效，请重新登录");
    }
    return accessToken;
  };

  const resolveAssessmentId = (): string | null => {
    const trimmedAssessmentId = assessmentId.trim();
    if (!trimmedAssessmentId) {
      setError("请先填写 assessment_id");
      return null;
    }

    return trimmedAssessmentId;
  };

  const loadQuestions = async (): Promise<void> => {
    const resolvedAssessmentId = resolveAssessmentId();
    if (!resolvedAssessmentId) {
      return;
    }

    try {
      const response = await apiClient.fetchDiagnosticQuestions(withToken(), resolvedAssessmentId);
      setStatus(response.status);
      setElapsedSeconds(response.elapsed_seconds);
      setQuestionId(
        response.questions[response.current_question_index]?.question_id ?? response.questions[0]?.question_id ?? ""
      );
      setSkillBandText("-");
      setPlanId(null);
      setCompletionTaskAction(null);
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
    const resolvedAssessmentId = resolveAssessmentId();
    if (!resolvedAssessmentId) {
      return;
    }

    try {
      const response = await apiClient.pauseDiagnostic(withToken(), resolvedAssessmentId);
      setStatus(response.status);
      setElapsedSeconds(response.elapsed_seconds);
      setError(null);
    } catch (pauseError) {
      setError(pauseError instanceof Error ? pauseError.message : "暂停失败");
    }
  };

  const resume = async (): Promise<void> => {
    const resolvedAssessmentId = resolveAssessmentId();
    if (!resolvedAssessmentId) {
      return;
    }

    try {
      const response = await apiClient.resumeDiagnostic(withToken(), resolvedAssessmentId);
      setStatus(response.status);
      setElapsedSeconds(response.elapsed_seconds);
      setError(null);
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : "恢复失败");
    }
  };

  const complete = async (): Promise<void> => {
    const resolvedAssessmentId = resolveAssessmentId();
    if (!resolvedAssessmentId) {
      return;
    }

    try {
      const response = await apiClient.completeDiagnostic(withToken(), resolvedAssessmentId);
      setStatus(response.status);
      setElapsedSeconds(response.elapsed_seconds);
      setPlanId(response.plan_id);
      setSkillBandText(
        `L${response.skill_bands.listening}/S${response.skill_bands.speaking}/R${response.skill_bands.reading}/W${response.skill_bands.writing}`
      );
      if (!apiClient.fetchActivePlan) {
        setCompletionTaskAction(null);
        setError(null);
        return;
      }

      try {
        const activePlan = await apiClient.fetchActivePlan(withToken());
        if (activePlan.plan_id !== response.plan_id) {
          setCompletionTaskAction(null);
          setError(null);
          return;
        }

        const nextTask = selectNextActionablePlanTask(activePlan);
        const learningRoute = resolveLearningRouteForPlanTask(nextTask);
        if (!nextTask || !learningRoute) {
          setCompletionTaskAction(null);
          setError(null);
          return;
        }

        setCompletionTaskAction({
          route: learningRoute.route,
          actionLabel: learningRoute.actionLabel,
          taskTitle: nextTask.title
        });
      } catch {
        setCompletionTaskAction(null);
      }
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
      <p>plan_id: {planId ?? "-"}</p>

      {status === "completed" ? (
        <section>
          <h2>诊断完成后下一步</h2>
          <p>next_task: {completionTaskAction?.taskTitle ?? "当前计划暂未排出可执行任务"}</p>
          <p>
            <a href={completionTaskAction?.route ?? "/plan"}>
              {completionTaskAction?.actionLabel ?? "查看学习计划"}
            </a>{" "}
            | <a href="/progress">查看学习进度</a>
          </p>
        </section>
      ) : null}
    </section>
  );
};
