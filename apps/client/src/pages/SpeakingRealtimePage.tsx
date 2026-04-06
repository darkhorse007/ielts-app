import { useEffect, useRef, useState } from "react";
import type { ApiClient } from "../lib/api-client";
import { saveProgressFollowUp } from "../lib/progress-follow-up";
import { TokenStorage } from "../lib/token-storage";

type SpeakingRealtimePageProps = {
  apiClient: Pick<
    ApiClient,
    | "createSpeakingSession"
    | "getSpeakingRolePlayScenarios"
    | "getSpeakingSessionEvents"
    | "getSpeakingPronunciationFeedback"
    | "trackSpeakingPronunciationTask"
    | "endSpeakingSession"
    | "switchSpeakingPart"
    | "createSpeakingRetrySession"
    | "getSpeakingComparison"
  >;
  tokenStorage: TokenStorage;
  wsBaseUrl: string;
};

export const SpeakingRealtimePage = ({ apiClient, tokenStorage, wsBaseUrl }: SpeakingRealtimePageProps) => {
  const socketRef = useRef<WebSocket | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [resumeToken, setResumeToken] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("未连接");
  const [status, setStatus] = useState("未开始");
  const [taskType, setTaskType] = useState<"core_training" | "role_play">("core_training");
  const [scenarioType, setScenarioType] = useState<
    "campus_service" | "travel_support" | "job_interview" | "academic_tutor" | "community_event"
  >("campus_service");
  const [scenarioCount, setScenarioCount] = useState(0);
  const [topic, setTopic] = useState("Describe a recent IELTS preparation experience.");
  const [currentPart, setCurrentPart] = useState<1 | 2 | 3>(1);
  const [transcript, setTranscript] = useState("");
  const [scoreText, setScoreText] = useState("-");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [latencyMs, setLatencyMs] = useState(0);
  const [traceCount, setTraceCount] = useState(0);
  const [events, setEvents] = useState<string[]>([]);
  const [comparisonText, setComparisonText] = useState("-");
  const [heatmapText, setHeatmapText] = useState("-");
  const [replaySegmentCount, setReplaySegmentCount] = useState(0);
  const [pronunciationTasks, setPronunciationTasks] = useState<Array<{ taskId: string; status: "todo" | "doing" | "done" }>>([]);
  const [trackedTaskText, setTrackedTaskText] = useState("-");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

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
      title: "继续口语训练",
      detail: "口语会话已结束，下一步可回到口语页继续复盘或再答一轮。",
      route: "/speaking-live",
      actionLabel: "回到口语训练"
    });
  };

  const createSession = async (): Promise<void> => {
    try {
      const created = await apiClient.createSpeakingSession(withToken(), {
        topic,
        task_type: taskType,
        scenario_type: taskType === "role_play" ? scenarioType : undefined
      });
      setSessionId(created.session_id);
      setResumeToken(created.resume_token ?? "");
      setCurrentPart(created.current_part ?? 1);
      setConnectionStatus("未连接");
      setStatus("已创建口语实时会话");
      setEvents([]);
      setTraceCount(0);
      setComparisonText("-");
      setSuggestions([]);
      setHeatmapText("-");
      setReplaySegmentCount(0);
      setPronunciationTasks([]);
      setTrackedTaskText("-");
      setTaskType(created.task_type ?? taskType);
      if (created.scenario_type) {
        setScenarioType(created.scenario_type);
      }
      setError(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建口语会话失败");
    }
  };

  const loadRolePlayScenarios = async (): Promise<void> => {
    try {
      const scenarios = await apiClient.getSpeakingRolePlayScenarios(withToken());
      setScenarioCount(scenarios.items.length);
      if (scenarios.items.length > 0 && taskType === "role_play") {
        const exists = scenarios.items.some((item) => item.scenario_type === scenarioType);
        if (!exists) {
          setScenarioType(scenarios.items[0].scenario_type);
        }
      }
      setStatus("已拉取角色扮演场景");
      setError(null);
    } catch (scenarioError) {
      setError(scenarioError instanceof Error ? scenarioError.message : "拉取角色扮演场景失败");
    }
  };

  const connect = (): void => {
    if (!sessionId || !resumeToken) {
      setError("请先创建口语会话");
      return;
    }

    try {
      const query = new URLSearchParams({
        session_id: sessionId,
        resume_token: resumeToken
      });
      const ws = new WebSocket(`${wsBaseUrl}/v1/realtime/speaking?${query.toString()}`);
      socketRef.current = ws;
      setConnectionStatus("连接中");

      ws.onopen = () => {
        setConnectionStatus("已连接");
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as {
            type?: string;
            text?: string;
            current_part?: 1 | 2 | 3;
            part_no?: 1 | 2 | 3;
            fluency?: number;
            lexical?: number;
            grammar?: number;
            pronunciation?: number;
            suggestions?: string[];
            latency_ms?: number;
            pronunciation_feedback?: {
              word_issues?: unknown[];
              phoneme_issues?: unknown[];
              replay_segments?: unknown[];
              task_recommendations?: Array<{
                task_id?: string;
                status?: "todo" | "doing" | "done";
              }>;
            };
          };
          const eventType = payload.type ?? "unknown";
          setEvents((prev) => [...prev.slice(-10), eventType]);

          if ((eventType === "session_start" || eventType === "session_resume") && payload.current_part) {
            setCurrentPart(payload.current_part);
          }
          if (eventType === "part_switch" && payload.current_part) {
            setCurrentPart(payload.current_part);
            setStatus(`已切换到 Part ${payload.current_part}`);
          }
          if (eventType === "session_start") {
            setStatus("会话已开始");
          }
          if (eventType === "session_resume") {
            setStatus("会话已恢复");
          }
          if (eventType === "coach_question" && payload.text) {
            setStatus(`Part ${payload.part_no ?? currentPart} 追问: ${payload.text}`);
          }
          if (eventType === "score_update") {
            setScoreText(
              `F${payload.fluency ?? "-"} / L${payload.lexical ?? "-"} / G${payload.grammar ?? "-"} / P${payload.pronunciation ?? "-"}`
            );
            setSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : []);
            setLatencyMs(Number(payload.latency_ms) || 0);
            const wordIssueCount = payload.pronunciation_feedback?.word_issues?.length ?? 0;
            const phonemeIssueCount = payload.pronunciation_feedback?.phoneme_issues?.length ?? 0;
            const replayCount = payload.pronunciation_feedback?.replay_segments?.length ?? 0;
            setHeatmapText(`word=${wordIssueCount} / phoneme=${phonemeIssueCount}`);
            setReplaySegmentCount(replayCount);
            if (Array.isArray(payload.pronunciation_feedback?.task_recommendations)) {
              setPronunciationTasks(
                payload.pronunciation_feedback.task_recommendations
                  .map((item) =>
                    item.task_id
                      ? {
                          taskId: item.task_id,
                          status: item.status ?? "todo"
                        }
                      : null
                  )
                  .filter((item): item is { taskId: string; status: "todo" | "doing" | "done" } => Boolean(item))
              );
            }
          }
          if (eventType === "session_end") {
            setConnectionStatus("已结束");
            setStatus("会话结束");
            persistFollowUp();
          }
          if (eventType === "error") {
            setError("实时会话返回错误");
          }
        } catch {
          setError("实时消息解析失败");
        }
      };

      ws.onerror = () => {
        setError("实时连接异常");
      };

      ws.onclose = () => {
        setConnectionStatus("已断开");
      };
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "连接失败");
    }
  };

  const switchPart = async (partNo: 1 | 2 | 3): Promise<void> => {
    if (!sessionId) {
      setError("请先创建会话");
      return;
    }

    try {
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "part_switch",
            part_no: partNo
          })
        );
      } else {
        await apiClient.switchSpeakingPart(withToken(), sessionId, partNo);
      }
      setCurrentPart(partNo);
      setStatus(`已切换到 Part ${partNo}`);
      setError(null);
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : "切换 Part 失败");
    }
  };

  const sendTranscript = (): void => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("当前未连接实时会话");
      return;
    }
    socket.send(
      JSON.stringify({
        type: "partial_transcript",
        text: transcript,
        part_no: currentPart
      })
    );
    setError(null);
  };

  const sendHeartbeat = (): void => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("当前未连接实时会话");
      return;
    }
    socket.send(
      JSON.stringify({
        type: "heartbeat"
      })
    );
  };

  const end = async (): Promise<void> => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "session_end"
        })
      );
      return;
    }

    if (!sessionId) {
      setError("请先创建会话");
      return;
    }

    try {
      await apiClient.endSpeakingSession(withToken(), sessionId);
      setConnectionStatus("已结束");
      setStatus("会话结束");
      persistFollowUp();
      setError(null);
    } catch (endError) {
      setError(endError instanceof Error ? endError.message : "结束会话失败");
    }
  };

  const createRetry = async (): Promise<void> => {
    if (!sessionId) {
      setError("请先完成一次会话");
      return;
    }
    try {
      const retry = await apiClient.createSpeakingRetrySession(withToken(), sessionId);
      setSessionId(retry.session_id);
      setResumeToken(retry.resume_token ?? "");
      setCurrentPart(retry.current_part ?? 1);
      setConnectionStatus("未连接");
      setComparisonText("-");
      setStatus("已创建同题再答会话");
      setError(null);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "创建同题再答失败");
    }
  };

  const loadComparison = async (): Promise<void> => {
    if (!sessionId) {
      setError("请先创建重答会话");
      return;
    }

    try {
      const comparison = await apiClient.getSpeakingComparison(withToken(), sessionId);
      setComparisonText(
        `ΔF${comparison.delta.fluency} ΔL${comparison.delta.lexical} ΔG${comparison.delta.grammar} ΔP${comparison.delta.pronunciation}`
      );
      setStatus("已拉取同题前后对比");
      setError(null);
    } catch (compareError) {
      setError(compareError instanceof Error ? compareError.message : "拉取对比失败");
    }
  };

  const loadEvents = async (): Promise<void> => {
    if (!sessionId) {
      setError("请先创建会话");
      return;
    }

    try {
      const response = await apiClient.getSpeakingSessionEvents(withToken(), sessionId);
      setTraceCount(response.items.length);
      setStatus("已拉取会话日志");
      setError(null);
    } catch (eventsError) {
      setError(eventsError instanceof Error ? eventsError.message : "拉取日志失败");
    }
  };

  const loadPronunciationFeedback = async (): Promise<void> => {
    if (!sessionId) {
      setError("请先创建会话");
      return;
    }

    try {
      const feedback = await apiClient.getSpeakingPronunciationFeedback(withToken(), sessionId);
      const topWord = feedback.hotspot_words[0];
      const topPhoneme = feedback.hotspot_phonemes[0];
      setHeatmapText(
        `top_word=${topWord ? `${topWord.word}(${topWord.count})` : "-"} / top_phoneme=${topPhoneme ? `${topPhoneme.phoneme}(${topPhoneme.count})` : "-"}`
      );
      setReplaySegmentCount(feedback.turns.reduce((sum, turn) => sum + turn.replay_segments.length, 0));
      setPronunciationTasks(
        feedback.tasks.map((item) => ({
          taskId: item.task_id,
          status: item.status
        }))
      );
      setStatus("已拉取发音热力图反馈");
      setError(null);
    } catch (feedbackError) {
      setError(feedbackError instanceof Error ? feedbackError.message : "拉取发音反馈失败");
    }
  };

  const trackFirstPronunciationTask = async (): Promise<void> => {
    if (!sessionId) {
      setError("请先创建会话");
      return;
    }
    const target = pronunciationTasks[0];
    if (!target) {
      setError("当前没有可追踪的纠音任务");
      return;
    }

    try {
      const tracked = await apiClient.trackSpeakingPronunciationTask(withToken(), sessionId, target.taskId, "done");
      setPronunciationTasks((prev) =>
        prev.map((item) => (item.taskId === tracked.task_id ? { ...item, status: tracked.status } : item))
      );
      setTrackedTaskText(`${tracked.task_id}:${tracked.status}`);
      setStatus("已标记纠音任务完成");
      setError(null);
    } catch (trackError) {
      setError(trackError instanceof Error ? trackError.message : "追踪纠音任务失败");
    }
  };

  return (
    <section>
      <h1>口语 Part1/2/3 与评分反馈</h1>
      {error ? <p role="alert">{error}</p> : null}

      <label htmlFor="speaking-topic">口语题目</label>
      <textarea
        id="speaking-topic"
        value={topic}
        onChange={(event) => setTopic(event.target.value)}
      />

      <label htmlFor="speaking-task-type">训练形态</label>
      <select
        id="speaking-task-type"
        value={taskType}
        onChange={(event) => setTaskType(event.target.value as "core_training" | "role_play")}
      >
        <option value="core_training">核心会话</option>
        <option value="role_play">角色扮演</option>
      </select>

      <label htmlFor="speaking-scenario-type">角色场景</label>
      <select
        id="speaking-scenario-type"
        value={scenarioType}
        onChange={(event) =>
          setScenarioType(
            event.target.value as "campus_service" | "travel_support" | "job_interview" | "academic_tutor" | "community_event"
          )
        }
      >
        <option value="campus_service">campus_service</option>
        <option value="travel_support">travel_support</option>
        <option value="job_interview">job_interview</option>
        <option value="academic_tutor">academic_tutor</option>
        <option value="community_event">community_event</option>
      </select>

      <button type="button" onClick={createSession}>
        创建口语会话
      </button>
      <button type="button" onClick={() => void loadRolePlayScenarios()}>
        拉取角色场景
      </button>
      <button type="button" onClick={connect}>
        连接实时会话
      </button>

      <p>session_id: {sessionId || "-"}</p>
      <p>connection: {connectionStatus}</p>
      <p>task_type: {taskType}</p>
      <p>scenario_type: {taskType === "role_play" ? scenarioType : "-"}</p>
      <p>scenario_count: {scenarioCount}</p>
      <p>current_part: {currentPart}</p>

      <button type="button" onClick={() => void switchPart(1)}>
        切换Part1
      </button>
      <button type="button" onClick={() => void switchPart(2)}>
        切换Part2
      </button>
      <button type="button" onClick={() => void switchPart(3)}>
        切换Part3
      </button>

      <label htmlFor="speaking-transcript">转写文本</label>
      <textarea
        id="speaking-transcript"
        value={transcript}
        onChange={(event) => setTranscript(event.target.value)}
      />

      <button type="button" onClick={sendTranscript}>
        发送转写
      </button>
      <button type="button" onClick={sendHeartbeat}>
        发送心跳
      </button>
      <button type="button" onClick={() => void end()}>
        结束会话
      </button>
      <button type="button" onClick={() => void createRetry()}>
        同题再答
      </button>
      <button type="button" onClick={() => void loadComparison()}>
        拉取前后对比
      </button>
      <button type="button" onClick={() => void loadPronunciationFeedback()}>
        拉取发音热力图
      </button>
      <button type="button" onClick={() => void trackFirstPronunciationTask()}>
        标记首个纠音任务完成
      </button>
      <button type="button" onClick={() => void loadEvents()}>
        拉取会话日志
      </button>

      <p>status: {status}</p>
      <p>score: {scoreText}</p>
      <p>suggestions: {suggestions.join(" | ") || "-"}</p>
      <p>latency_ms: {latencyMs}</p>
      <p>pronunciation_heatmap: {heatmapText}</p>
      <p>replay_segment_count: {replaySegmentCount}</p>
      <p>pronunciation_task_count: {pronunciationTasks.length}</p>
      <p>tracked_task: {trackedTaskText}</p>
      <p>comparison: {comparisonText}</p>
      <p>event_trace_count: {traceCount}</p>
      <p>recent_events: {events.join(",") || "-"}</p>
    </section>
  );
};
