import { useState } from "react";
import type { ApiClient } from "../lib/api-client";
import type { PracticeSessionResponse } from "../lib/api-types";
import { TokenStorage } from "../lib/token-storage";

type ReadingPracticePageProps = {
  apiClient: Pick<
    ApiClient,
    | "createPracticeSession"
    | "submitPracticeSession"
    | "switchReadingMode"
    | "getReadingTimer"
    | "pauseReadingTimer"
    | "resumeReadingTimer"
    | "recoverReadingTimer"
  >;
  tokenStorage: TokenStorage;
};

export const ReadingPracticePage = ({ apiClient, tokenStorage }: ReadingPracticePageProps) => {
  const [session, setSession] = useState<PracticeSessionResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("未开始");
  const [error, setError] = useState<string | null>(null);
  const [evidenceCount, setEvidenceCount] = useState(0);
  const [trainingMode, setTrainingMode] = useState<"training" | "exam">("training");
  const [timeLimitSeconds, setTimeLimitSeconds] = useState("1200");
  const [timerText, setTimerText] = useState("-");

  const withToken = (): string => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      throw new Error("会话已失效，请重新登录");
    }
    return accessToken;
  };

  const createSession = async (): Promise<void> => {
    try {
      const created = await apiClient.createPracticeSession(withToken(), {
        skill: "reading",
        training_mode: trainingMode,
        time_limit_seconds: Number(timeLimitSeconds) || 1200
      });
      setSession(created);
      setAnswers({});
      setStatus(`已创建阅读训练，题量 ${created.questions.length}`);
      setEvidenceCount(0);
      setTimerText(created.timer ? `${created.timer.status}/${created.timer.elapsed_seconds}s` : "-");
      setError(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建阅读训练失败");
    }
  };

  const submit = async (): Promise<void> => {
    if (!session) {
      setError("请先创建阅读训练");
      return;
    }

    try {
      const submitted = await apiClient.submitPracticeSession(
        withToken(),
        session.session_id,
        session.questions.map((question) => ({
          question_id: question.question_id,
          answer: answers[question.question_id] ?? ""
        }))
      );
      setSession(submitted);

      const wrongWithEvidence =
        submitted.submission?.question_results.filter((item) => !item.is_correct && Boolean(item.evidence)).length ?? 0;

      setEvidenceCount(wrongWithEvidence);
      setStatus(
        `提交完成，正确 ${submitted.submission?.score_breakdown.correct_count ?? 0}/${submitted.submission?.score_breakdown.total_questions ?? 0}`
      );
      setTimerText(`${submitted.submission?.score_breakdown.mode ?? "-"} / ${submitted.submission?.score_breakdown.elapsed_seconds ?? 0}s`);
      setError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交失败");
    }
  };

  const switchMode = async (mode: "training" | "exam"): Promise<void> => {
    if (!session) {
      setError("请先创建阅读训练");
      return;
    }
    try {
      const updated = await apiClient.switchReadingMode(withToken(), session.session_id, {
        training_mode: mode,
        time_limit_seconds: Number(timeLimitSeconds) || 1200
      });
      setSession(updated);
      setTrainingMode(mode);
      setTimerText(updated.timer ? `${updated.timer.status}/${updated.timer.elapsed_seconds}s` : "-");
      setStatus(updated.recovered ? "模式切换成功，计时器已恢复" : `已切换到${mode === "exam" ? "考试" : "训练"}模式`);
      setError(null);
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : "切换模式失败");
    }
  };

  const loadTimer = async (): Promise<void> => {
    if (!session) {
      setError("请先创建阅读训练");
      return;
    }
    try {
      const result = await apiClient.getReadingTimer(withToken(), session.session_id);
      setTimerText(
        `${result.timer?.status ?? "-"} / ${result.timer?.elapsed_seconds ?? 0}s / remain ${result.timer?.remaining_seconds ?? "-"}`
      );
      setStatus(result.recovered ? "计时器状态已恢复" : "已拉取计时器状态");
      setError(null);
    } catch (timerError) {
      setError(timerError instanceof Error ? timerError.message : "获取计时器失败");
    }
  };

  const pauseTimer = async (): Promise<void> => {
    if (!session) {
      setError("请先创建阅读训练");
      return;
    }
    try {
      const result = await apiClient.pauseReadingTimer(withToken(), session.session_id);
      setTimerText(`${result.timer?.status ?? "-"} / ${result.timer?.elapsed_seconds ?? 0}s`);
      setStatus("计时已暂停");
      setError(null);
    } catch (timerError) {
      setError(timerError instanceof Error ? timerError.message : "暂停计时失败");
    }
  };

  const resumeTimer = async (): Promise<void> => {
    if (!session) {
      setError("请先创建阅读训练");
      return;
    }
    try {
      const result = await apiClient.resumeReadingTimer(withToken(), session.session_id);
      setTimerText(`${result.timer?.status ?? "-"} / ${result.timer?.elapsed_seconds ?? 0}s`);
      setStatus("计时已恢复");
      setError(null);
    } catch (timerError) {
      setError(timerError instanceof Error ? timerError.message : "恢复计时失败");
    }
  };

  const recoverTimer = async (): Promise<void> => {
    if (!session) {
      setError("请先创建阅读训练");
      return;
    }
    try {
      const result = await apiClient.recoverReadingTimer(withToken(), session.session_id);
      setTimerText(`${result.timer?.status ?? "-"} / ${result.timer?.elapsed_seconds ?? 0}s`);
      setStatus(result.recovered ? "计时器恢复完成" : "计时器无需恢复");
      setError(null);
    } catch (timerError) {
      setError(timerError instanceof Error ? timerError.message : "计时恢复失败");
    }
  };

  return (
    <section>
      <h1>阅读训练与考试模式</h1>
      {error ? <p role="alert">{error}</p> : null}

      <label htmlFor="reading-mode">模式</label>
      <select
        id="reading-mode"
        value={trainingMode}
        onChange={(event) => setTrainingMode(event.target.value as "training" | "exam")}
      >
        <option value="training">training</option>
        <option value="exam">exam</option>
      </select>

      <label htmlFor="reading-limit-seconds">考试时长(秒)</label>
      <input
        id="reading-limit-seconds"
        value={timeLimitSeconds}
        onChange={(event) => setTimeLimitSeconds(event.target.value)}
      />

      <button type="button" onClick={createSession}>
        创建阅读训练
      </button>

      {session ? (
        <div>
          <p>session_id: {session.session_id}</p>
          <p>training_mode: {session.training_mode}</p>
          {session.questions.map((question) => (
            <div key={question.question_id}>
              <p>
                [{question.type}] {question.prompt}
              </p>
              <label htmlFor={`reading-answer-${question.question_id}`}>答案</label>
              <input
                id={`reading-answer-${question.question_id}`}
                value={answers[question.question_id] ?? ""}
                onChange={(event) =>
                  setAnswers((prev) => ({
                    ...prev,
                    [question.question_id]: event.target.value
                  }))
                }
              />
            </div>
          ))}
        </div>
      ) : null}

      <button type="button" onClick={() => void switchMode("training")}>
        切换训练模式
      </button>
      <button type="button" onClick={() => void switchMode("exam")}>
        切换考试模式
      </button>
      <button type="button" onClick={() => void loadTimer()}>
        拉取计时状态
      </button>
      <button type="button" onClick={() => void pauseTimer()}>
        暂停计时
      </button>
      <button type="button" onClick={() => void resumeTimer()}>
        恢复计时
      </button>
      <button type="button" onClick={() => void recoverTimer()}>
        恢复异常计时
      </button>

      <button type="button" onClick={submit}>
        提交阅读答案
      </button>

      {session?.submission ? (
        <div>
          <p>evidence_count: {evidenceCount}</p>
          {session.submission.question_results
            .filter((item) => !item.is_correct && item.evidence)
            .map((item) => (
              <p key={item.question_id}>
                证据定位: P{item.evidence?.paragraph} - {item.evidence?.sentence}
              </p>
            ))}
        </div>
      ) : null}

      <p>timer: {timerText}</p>
      <p>status: {status}</p>
    </section>
  );
};
