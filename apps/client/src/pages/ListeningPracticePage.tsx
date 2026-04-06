import { useState } from "react";
import type { ApiClient } from "../lib/api-client";
import type { PracticeSessionResponse } from "../lib/api-types";
import { saveProgressFollowUp } from "../lib/progress-follow-up";
import { TokenStorage } from "../lib/token-storage";

type ListeningPracticePageProps = {
  apiClient: Pick<
    ApiClient,
    "createPracticeSession" | "submitPracticeSession" | "getPlaybackState" | "updatePlaybackState" | "addRetryQueue"
  >;
  tokenStorage: TokenStorage;
};

export const ListeningPracticePage = ({ apiClient, tokenStorage }: ListeningPracticePageProps) => {
  const [session, setSession] = useState<PracticeSessionResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("未开始");
  const [error, setError] = useState<string | null>(null);
  const [taskType, setTaskType] = useState<"core_training" | "dictation">("core_training");
  const [playbackRate, setPlaybackRate] = useState("1");
  const [segmentIndex, setSegmentIndex] = useState("0");
  const [positionSeconds, setPositionSeconds] = useState("0");
  const [replayWrongOnly, setReplayWrongOnly] = useState(false);
  const [queueCount, setQueueCount] = useState(0);

  const withToken = (): string => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      throw new Error("会话已失效，请重新登录");
    }
    return accessToken;
  };

  const persistFollowUp = (): void => {
    const userId = tokenStorage.getUserId();
    if (!userId) {
      return;
    }

    saveProgressFollowUp(userId, {
      title: "继续听力训练",
      detail: "刚完成一次听力提交，下一步可回到训练页继续复盘或再练一轮。",
      route: "/practice/listening",
      actionLabel: "回到听力训练"
    });
  };

  const createSession = async (): Promise<void> => {
    try {
      const created = await apiClient.createPracticeSession(withToken(), {
        skill: "listening",
        task_type: taskType === "dictation" ? "dictation" : "core_training"
      });
      setSession(created);
      setAnswers({});
      setQueueCount(0);
      setStatus(
        created.task_type === "dictation"
          ? `已创建听力听写训练，句量 ${created.questions.length}`
          : `已创建听力训练，题量 ${created.questions.length}`
      );
      setError(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建听力训练失败");
    }
  };

  const submit = async (): Promise<void> => {
    if (!session) {
      setError("请先创建听力训练");
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
      persistFollowUp();
      setStatus(
        `提交完成，正确 ${submitted.submission?.score_breakdown.correct_count ?? 0}/${submitted.submission?.score_breakdown.total_questions ?? 0}`
      );
      setError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交失败");
    }
  };

  const savePlayback = async (): Promise<void> => {
    if (!session) {
      setError("请先创建听力训练");
      return;
    }

    try {
      const response = await apiClient.updatePlaybackState(withToken(), session.session_id, {
        playback_rate: Number(playbackRate),
        segment_index: Number(segmentIndex),
        position_seconds: Number(positionSeconds),
        replay_wrong_only: replayWrongOnly
      });

      setPlaybackRate(String(response.playback_rate));
      setSegmentIndex(String(response.segment_index));
      setPositionSeconds(String(response.position_seconds));
      setReplayWrongOnly(response.replay_wrong_only);
      setStatus(response.recovered ? "播放器异常已恢复到 1.0x" : "播放状态已保存");
      setError(null);
    } catch (playbackError) {
      setError(playbackError instanceof Error ? playbackError.message : "保存播放状态失败");
    }
  };

  const loadPlayback = async (): Promise<void> => {
    if (!session) {
      setError("请先创建听力训练");
      return;
    }

    try {
      const response = await apiClient.getPlaybackState(withToken(), session.session_id);
      setPlaybackRate(String(response.playback_rate));
      setSegmentIndex(String(response.segment_index));
      setPositionSeconds(String(response.position_seconds));
      setReplayWrongOnly(response.replay_wrong_only);
      setStatus("已加载播放状态");
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载播放状态失败");
    }
  };

  const addRetryQueue = async (): Promise<void> => {
    if (!session) {
      setError("请先创建并提交听力训练");
      return;
    }

    try {
      const response = await apiClient.addRetryQueue(withToken(), session.session_id);
      setQueueCount(response.items.length);
      setStatus(`已加入重练队列 ${response.items.length} 题`);
      setError(null);
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : "加入重练失败");
    }
  };

  return (
    <section>
      <h1>听力训练（核心题型 / 听写）</h1>
      {error ? <p role="alert">{error}</p> : null}

      <label htmlFor="listening-task-type">训练形态</label>
      <select
        id="listening-task-type"
        value={taskType}
        onChange={(event) => setTaskType(event.target.value as "core_training" | "dictation")}
      >
        <option value="core_training">核心题型</option>
        <option value="dictation">句级听写</option>
      </select>

      <button type="button" onClick={createSession}>
        {taskType === "dictation" ? "创建听力听写训练" : "创建听力训练"}
      </button>

      {session ? (
        <div>
          <p>session_id: {session.session_id}</p>
          <p>task_type: {session.task_type}</p>
          {session.questions.map((question) => (
            <div key={question.question_id}>
              <p>
                [{question.type}] {question.prompt}
              </p>
              <label htmlFor={`listening-answer-${question.question_id}`}>答案</label>
              <input
                id={`listening-answer-${question.question_id}`}
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

      <button type="button" onClick={submit}>
        提交听力答案
      </button>

      <label htmlFor="listening-playback-rate">播放倍速</label>
      <input
        id="listening-playback-rate"
        value={playbackRate}
        onChange={(event) => setPlaybackRate(event.target.value)}
      />

      <label htmlFor="listening-segment-index">句段索引</label>
      <input
        id="listening-segment-index"
        value={segmentIndex}
        onChange={(event) => setSegmentIndex(event.target.value)}
      />

      <label htmlFor="listening-position-seconds">播放位置(秒)</label>
      <input
        id="listening-position-seconds"
        value={positionSeconds}
        onChange={(event) => setPositionSeconds(event.target.value)}
      />

      <label htmlFor="listening-replay-wrong-only">仅重听错题</label>
      <input
        id="listening-replay-wrong-only"
        type="checkbox"
        checked={replayWrongOnly}
        onChange={(event) => setReplayWrongOnly(event.target.checked)}
      />

      <button type="button" onClick={savePlayback}>
        保存播放状态
      </button>
      <button type="button" onClick={loadPlayback}>
        加载播放状态
      </button>
      <button type="button" onClick={addRetryQueue}>
        加入重练队列
      </button>

      {session?.submission?.dictation_summary ? (
        <div>
          <p>dictation_sentence_count: {session.submission.dictation_summary.total_sentences}</p>
          <p>
            dictation_top_spelling:
            {session.submission.dictation_summary.high_frequency_spelling_errors.length > 0
              ? ` ${session.submission.dictation_summary.high_frequency_spelling_errors
                  .map((item) => `${item.token}(${item.count})`)
                  .join(", ")}`
              : " -"}
          </p>
          <p>
            dictation_top_chunks:
            {session.submission.dictation_summary.high_frequency_chunk_errors.length > 0
              ? ` ${session.submission.dictation_summary.high_frequency_chunk_errors
                  .map((item) => `${item.chunk}(${item.count})`)
                  .join(", ")}`
              : " -"}
          </p>
          {session.submission.question_results
            .filter((item) => item.dictation_feedback)
            .map((item) => (
              <p key={item.question_id}>
                听写反馈[{item.question_id.slice(0, 8)}]: spelling=
                {item.dictation_feedback?.spelling_mismatches.length ?? 0}, missing_chunks=
                {item.dictation_feedback?.missing_chunks.length ?? 0}
              </p>
            ))}
        </div>
      ) : null}

      <p>status: {status}</p>
      <p>retry_queue_count: {queueCount}</p>
    </section>
  );
};
