import { Redirect, router } from "expo-router";
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync, setIsAudioActiveAsync } from "expo-audio";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import type { SpeakingRolePlayScenariosResponse, SpeakingSessionResponse } from "../src/lib/api-types";
import { useAppForegroundEffect } from "../src/hooks/use-app-foreground-effect";
import { openAppSettingsAsync } from "../src/lib/native-settings";
import { buildScopedStorageKey, clearStoredJson, loadStoredJson, saveStoredJson } from "../src/lib/storage";
import { useAppSession } from "../src/state/app-session";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, StatusPill, TextField } from "../src/ui/primitives";
import { colors, radii, spacing } from "../src/ui/theme";

type SpeakingTaskType = "core_training" | "role_play";
type ScenarioType = NonNullable<SpeakingSessionResponse["scenario_type"]>;
type PronunciationTaskStatus = "todo" | "doing" | "done";

type PronunciationTask = {
  taskId: string;
  title: string;
  description: string;
  phoneme: string;
  status: PronunciationTaskStatus;
  linkedTurnNos: number[];
};

type SpeakingSnapshot = {
  version: 1;
  taskType: SpeakingTaskType;
  scenarioType: ScenarioType;
  topic: string;
  transcript: string;
  sessionState: SpeakingSessionResponse | null;
  resumeToken: string;
  scenarioItems: SpeakingRolePlayScenariosResponse["items"];
  currentPart: 1 | 2 | 3;
  scoreText: string;
  suggestions: string[];
  latencyMs: number;
  traceCount: number;
  recentEvents: string[];
  comparisonText: string;
  heatmapText: string;
  replaySegmentCount: number;
  pronunciationTasks: PronunciationTask[];
  trackedTaskText: string;
  reconnectIntent: boolean;
  updatedAt: string;
};

type SpeakingSocketPayload = {
  type?: string;
  message?: string;
  text?: string;
  current_part?: 1 | 2 | 3;
  part_no?: 1 | 2 | 3;
  fluency?: number;
  lexical?: number;
  grammar?: number;
  pronunciation?: number;
  suggestions?: string[];
  latency_ms?: number;
  summary?: {
    fluency?: number;
    lexical?: number;
    grammar?: number;
    pronunciation?: number;
    turns?: number;
  };
  pronunciation_feedback?: {
    word_issues?: unknown[];
    phoneme_issues?: unknown[];
    replay_segments?: unknown[];
    task_recommendations?: Array<{
      task_id?: string;
      title?: string;
      description?: string;
      phoneme?: string;
      status?: PronunciationTaskStatus;
      linked_turn_nos?: number[];
    }>;
  };
};

const taskOptions: Array<{
  value: SpeakingTaskType;
  label: string;
  description: string;
}> = [
  {
    value: "core_training",
    label: "核心会话",
    description: "按 IELTS Part1/2/3 常规口语流程训练"
  },
  {
    value: "role_play",
    label: "角色扮演",
    description: "按场景做实时对练，并保留同题重答能力"
  }
];

const scenarioOptions: Array<{
  value: ScenarioType;
  label: string;
  description: string;
}> = [
  {
    value: "campus_service",
    label: "校园服务",
    description: "处理校园咨询、服务台与问询情境"
  },
  {
    value: "travel_support",
    label: "旅行支持",
    description: "模拟出行、预订与现场沟通问题"
  },
  {
    value: "job_interview",
    label: "求职面试",
    description: "用于面试式追问与回答组织训练"
  },
  {
    value: "academic_tutor",
    label: "学术辅导",
    description: "模拟导师沟通与学业讨论"
  },
  {
    value: "community_event",
    label: "社区活动",
    description: "围绕活动组织、报名与协作对话"
  }
];

const formatScoreSummary = (
  summary:
    | SpeakingSessionResponse["summary"]
    | SpeakingSocketPayload["summary"]
    | null
    | undefined
): string => {
  if (!summary) {
    return "-";
  }

  return `F${summary.fluency ?? "-"} / L${summary.lexical ?? "-"} / G${summary.grammar ?? "-"} / P${summary.pronunciation ?? "-"}`;
};

const toConnectionLabel = (status: SpeakingSessionResponse["status"] | null | undefined): string => {
  if (!status) {
    return "未连接";
  }

  switch (status) {
    case "created":
      return "未连接";
    case "connected":
      return "已连接";
    case "disconnected":
      return "已断开";
    case "ended":
      return "已结束";
    default:
      return "未连接";
  }
};

const safeParseSocketPayload = (data: unknown): SpeakingSocketPayload | null => {
  if (typeof data !== "string") {
    return null;
  }

  try {
    return JSON.parse(data) as SpeakingSocketPayload;
  } catch {
    return null;
  }
};

const isSocketOpen = (socket: WebSocket | null): boolean => Boolean(socket && socket.readyState === WebSocket.OPEN);

const toPermissionLabel = (status: string): string => {
  switch (status) {
    case "granted":
      return "已授权";
    case "denied":
      return "已拒绝";
    default:
      return "未决定";
  }
};

const defaultTaskType: SpeakingTaskType = "core_training";
const defaultScenarioType: ScenarioType = "campus_service";
const defaultTopic = "Describe a recent IELTS preparation experience.";

const isDefaultSpeakingSnapshot = (snapshot: SpeakingSnapshot): boolean =>
  snapshot.taskType === defaultTaskType &&
  snapshot.scenarioType === defaultScenarioType &&
  snapshot.topic === defaultTopic &&
  snapshot.transcript === "" &&
  snapshot.sessionState === null &&
  snapshot.resumeToken === "" &&
  snapshot.scenarioItems.length === 0 &&
  snapshot.currentPart === 1 &&
  snapshot.scoreText === "-" &&
  snapshot.suggestions.length === 0 &&
  snapshot.latencyMs === 0 &&
  snapshot.traceCount === 0 &&
  snapshot.recentEvents.length === 0 &&
  snapshot.comparisonText === "-" &&
  snapshot.heatmapText === "-" &&
  snapshot.replaySegmentCount === 0 &&
  snapshot.pronunciationTasks.length === 0 &&
  snapshot.trackedTaskText === "-" &&
  snapshot.reconnectIntent === false;

const formatCheckpointTime = (value: string): string =>
  new Date(value).toLocaleTimeString("zh-CN", {
    hour12: false
  });

export default function SpeakingScreen() {
  const { instanceConfig, session: authSession, runWithAuthorizedClient } = useAppSession();
  const socketRef = useRef<WebSocket | null>(null);
  const shouldReconnectRef = useRef(false);
  const snapshotSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSnapshotPersistRef = useRef(false);
  const pendingRestoreReconnectRef = useRef(false);
  const [taskType, setTaskType] = useState<SpeakingTaskType>(defaultTaskType);
  const [scenarioType, setScenarioType] = useState<ScenarioType>(defaultScenarioType);
  const [topic, setTopic] = useState(defaultTopic);
  const [transcript, setTranscript] = useState("");
  const [sessionState, setSessionState] = useState<SpeakingSessionResponse | null>(null);
  const [resumeToken, setResumeToken] = useState("");
  const [scenarioItems, setScenarioItems] = useState<SpeakingRolePlayScenariosResponse["items"]>([]);
  const [connectionStatus, setConnectionStatus] = useState("未连接");
  const [statusMessage, setStatusMessage] = useState("未开始");
  const [checkpointStatus, setCheckpointStatus] = useState("本地会话未恢复");
  const [checkpointReady, setCheckpointReady] = useState(false);
  const [currentPart, setCurrentPart] = useState<1 | 2 | 3>(1);
  const [scoreText, setScoreText] = useState("-");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [latencyMs, setLatencyMs] = useState(0);
  const [traceCount, setTraceCount] = useState(0);
  const [recentEvents, setRecentEvents] = useState<string[]>([]);
  const [comparisonText, setComparisonText] = useState("-");
  const [heatmapText, setHeatmapText] = useState("-");
  const [replaySegmentCount, setReplaySegmentCount] = useState(0);
  const [pronunciationTasks, setPronunciationTasks] = useState<PronunciationTask[]>([]);
  const [trackedTaskText, setTrackedTaskText] = useState("-");
  const [microphonePermissionStatus, setMicrophonePermissionStatus] = useState("未决定");
  const [microphoneSettingsRequired, setMicrophoneSettingsRequired] = useState(false);
  const [requestingMicrophonePermission, setRequestingMicrophonePermission] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const snapshotStorageKey = authSession
    ? buildScopedStorageKey("speaking", "draft", "v1", authSession.userId)
    : null;

  const closeSocket = (): void => {
    const existing = socketRef.current;
    if (!existing) {
      return;
    }

    socketRef.current = null;
    existing.close();
  };

  const resetCheckpointState = (): void => {
    shouldReconnectRef.current = false;
    pendingRestoreReconnectRef.current = false;
    setTaskType(defaultTaskType);
    setScenarioType(defaultScenarioType);
    setTopic(defaultTopic);
    setTranscript("");
    setSessionState(null);
    setResumeToken("");
    setScenarioItems([]);
    setConnectionStatus("未连接");
    setStatusMessage("未开始");
    setCurrentPart(1);
    setSuggestions([]);
    setLatencyMs(0);
    setTraceCount(0);
    setRecentEvents([]);
    setComparisonText("-");
    setHeatmapText("-");
    setReplaySegmentCount(0);
    setPronunciationTasks([]);
    setTrackedTaskText("-");
    setScoreText("-");
    setError(null);
  };

  const persistSnapshot = useEffectEvent(async (snapshot: SpeakingSnapshot) => {
    if (!snapshotStorageKey) {
      return;
    }

    if (isDefaultSpeakingSnapshot(snapshot)) {
      await clearStoredJson(snapshotStorageKey);
      setCheckpointStatus("已启用自动保存");
      return;
    }

    await saveStoredJson(snapshotStorageKey, snapshot);
    setCheckpointStatus(`已自动保存 ${formatCheckpointTime(snapshot.updatedAt)}`);
  });

  useEffect(() => closeSocket, []);

  useEffect(() => {
    if (!instanceConfig || !authSession) {
      closeSocket();
    }
  }, [authSession, instanceConfig]);

  useEffect(() => {
    let cancelled = false;

    resetCheckpointState();
    setCheckpointReady(false);
    setCheckpointStatus("正在恢复本地会话...");
    if (snapshotSaveTimeoutRef.current) {
      clearTimeout(snapshotSaveTimeoutRef.current);
      snapshotSaveTimeoutRef.current = null;
    }

    if (!snapshotStorageKey) {
      setCheckpointStatus("登录后启用自动保存");
      setCheckpointReady(true);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const snapshot = await loadStoredJson<SpeakingSnapshot>(snapshotStorageKey);
      if (cancelled) {
        return;
      }

      if (snapshot?.version === 1) {
        setTaskType(snapshot.taskType);
        setScenarioType(snapshot.scenarioType);
        setTopic(snapshot.topic);
        setTranscript(snapshot.transcript);
        setSessionState(snapshot.sessionState);
        setResumeToken(snapshot.resumeToken);
        setScenarioItems(snapshot.scenarioItems);
        setCurrentPart(snapshot.currentPart);
        setScoreText(snapshot.scoreText);
        setSuggestions(snapshot.suggestions);
        setLatencyMs(snapshot.latencyMs);
        setTraceCount(snapshot.traceCount);
        setRecentEvents(snapshot.recentEvents);
        setComparisonText(snapshot.comparisonText);
        setHeatmapText(snapshot.heatmapText);
        setReplaySegmentCount(snapshot.replaySegmentCount);
        setPronunciationTasks(snapshot.pronunciationTasks);
        setTrackedTaskText(snapshot.trackedTaskText);

        if (snapshot.sessionState?.status === "ended") {
          shouldReconnectRef.current = false;
          pendingRestoreReconnectRef.current = false;
          setConnectionStatus("已结束");
          setStatusMessage("已恢复本地口语会话结果");
        } else if (snapshot.reconnectIntent && snapshot.sessionState?.session_id && snapshot.resumeToken) {
          shouldReconnectRef.current = true;
          pendingRestoreReconnectRef.current = true;
          setConnectionStatus("待恢复");
          setStatusMessage("已恢复本地口语会话，准备重连实时连接");
        } else {
          shouldReconnectRef.current = false;
          pendingRestoreReconnectRef.current = false;
          setConnectionStatus(toConnectionLabel(snapshot.sessionState?.status));
          setStatusMessage(snapshot.sessionState ? "已恢复本地口语会话" : "未开始");
        }

        setCheckpointStatus(`已恢复 ${formatCheckpointTime(snapshot.updatedAt)}`);
      } else {
        setCheckpointStatus("已启用自动保存");
      }

      skipNextSnapshotPersistRef.current = true;
      setCheckpointReady(true);
    })();

    return () => {
      cancelled = true;
      if (snapshotSaveTimeoutRef.current) {
        clearTimeout(snapshotSaveTimeoutRef.current);
        snapshotSaveTimeoutRef.current = null;
      }
    };
  }, [snapshotStorageKey]);

  const syncMicrophonePermission = async (): Promise<boolean> => {
    try {
      const permission = await getRecordingPermissionsAsync();
      setMicrophonePermissionStatus(toPermissionLabel(permission.status));
      setMicrophoneSettingsRequired(!permission.granted && permission.canAskAgain === false);
      return permission.granted;
    } catch {
      setMicrophonePermissionStatus("检查失败");
      setMicrophoneSettingsRequired(false);
      return false;
    }
  };

  const prepareSpeakingAudioSession = async (): Promise<void> => {
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false
      });
      await setIsAudioActiveAsync(true);
    } catch {
      // Best-effort only. Permission gating matters more than audio mode tuning here.
    }
  };

  const ensureMicrophonePermission = async (): Promise<boolean> => {
    const alreadyGranted = await syncMicrophonePermission();
    if (alreadyGranted) {
      await prepareSpeakingAudioSession();
      return true;
    }

    setRequestingMicrophonePermission(true);
    try {
      const permission = await requestRecordingPermissionsAsync();
      setMicrophonePermissionStatus(toPermissionLabel(permission.status));
      setMicrophoneSettingsRequired(!permission.granted && permission.canAskAgain === false);
      if (!permission.granted) {
        setError("麦克风权限未授予，无法进入实时口语会话");
        return false;
      }

      await prepareSpeakingAudioSession();
      setError(null);
      setStatusMessage("麦克风权限已授权");
      return true;
    } catch (permissionError) {
      setError(permissionError instanceof Error ? permissionError.message : "申请麦克风权限失败");
      return false;
    } finally {
      setRequestingMicrophonePermission(false);
    }
  };

  const openMicrophoneSettings = async (): Promise<void> => {
    const opened = await openAppSettingsAsync();
    if (opened) {
      setStatusMessage("已打开系统设置");
      setError(null);
      return;
    }

    setError("无法打开系统设置，请手动前往设置开启麦克风权限");
  };

  useEffect(() => {
    void syncMicrophonePermission();
  }, []);

  useEffect(() => {
    let currentState = AppState.currentState ?? "active";

    const subscription = AppState.addEventListener("change", (nextState) => {
      const movedToBackground = currentState === "active" && nextState !== "active";
      currentState = nextState;

      if (!movedToBackground) {
        return;
      }

      if (socketRef.current && isSocketOpen(socketRef.current)) {
        closeSocket();
        setConnectionStatus((current) => (current === "已结束" ? "已结束" : "已断开"));
        setStatusMessage("应用切到后台，恢复前台后会尝试恢复口语会话");
      }

      void setIsAudioActiveAsync(false).catch(() => undefined);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const resetLiveFeedback = (): void => {
    setSuggestions([]);
    setLatencyMs(0);
    setTraceCount(0);
    setRecentEvents([]);
    setComparisonText("-");
    setHeatmapText("-");
    setReplaySegmentCount(0);
    setPronunciationTasks([]);
    setTrackedTaskText("-");
    setScoreText("-");
  };

  useEffect(() => {
    if (!checkpointReady) {
      return;
    }

    if (skipNextSnapshotPersistRef.current) {
      skipNextSnapshotPersistRef.current = false;
      return;
    }

    const snapshot: SpeakingSnapshot = {
      version: 1,
      taskType,
      scenarioType,
      topic,
      transcript,
      sessionState,
      resumeToken,
      scenarioItems,
      currentPart,
      scoreText,
      suggestions,
      latencyMs,
      traceCount,
      recentEvents,
      comparisonText,
      heatmapText,
      replaySegmentCount,
      pronunciationTasks,
      trackedTaskText,
      reconnectIntent: shouldReconnectRef.current && sessionState?.status !== "ended",
      updatedAt: new Date().toISOString()
    };

    if (snapshotSaveTimeoutRef.current) {
      clearTimeout(snapshotSaveTimeoutRef.current);
    }

    snapshotSaveTimeoutRef.current = setTimeout(() => {
      void persistSnapshot(snapshot);
      snapshotSaveTimeoutRef.current = null;
    }, 400);

    return () => {
      if (snapshotSaveTimeoutRef.current) {
        clearTimeout(snapshotSaveTimeoutRef.current);
        snapshotSaveTimeoutRef.current = null;
      }
    };
  }, [
    checkpointReady,
    comparisonText,
    connectionStatus,
    currentPart,
    heatmapText,
    latencyMs,
    persistSnapshot,
    pronunciationTasks,
    recentEvents,
    replaySegmentCount,
    resumeToken,
    scenarioItems,
    scenarioType,
    scoreText,
    sessionState,
    suggestions,
    taskType,
    topic,
    traceCount,
    trackedTaskText,
    transcript
  ]);

  const applySession = (response: SpeakingSessionResponse): void => {
    setSessionState(response);
    setTaskType(response.task_type ?? "core_training");
    if (response.scenario_type) {
      setScenarioType(response.scenario_type);
    }
    setCurrentPart(response.current_part ?? 1);
    setConnectionStatus(toConnectionLabel(response.status));
    if (response.summary) {
      setScoreText(formatScoreSummary(response.summary));
    }
  };

  const createSession = async (): Promise<void> => {
    closeSocket();
    shouldReconnectRef.current = false;
    setLoading(true);

    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.createSpeakingSession(accessToken, {
          topic,
          task_type: taskType,
          scenario_type: taskType === "role_play" ? scenarioType : undefined
        })
      );

      applySession(response);
      setResumeToken(response.resume_token ?? "");
      resetLiveFeedback();
      setTranscript("");
      setStatusMessage("已创建实时口语会话");
      setError(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建口语会话失败");
    } finally {
      setLoading(false);
    }
  };

  const loadRolePlayScenarios = async (): Promise<void> => {
    setLoading(true);

    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getSpeakingRolePlayScenarios(accessToken)
      );
      setScenarioItems(response.items);
      if (taskType === "role_play" && response.items.length > 0) {
        const exists = response.items.some((item) => item.scenario_type === scenarioType);
        if (!exists) {
          setScenarioType(response.items[0].scenario_type);
        }
      }
      setStatusMessage("已拉取角色场景");
      setError(null);
    } catch (scenarioError) {
      setError(scenarioError instanceof Error ? scenarioError.message : "拉取角色场景失败");
    } finally {
      setLoading(false);
    }
  };

  const loadSessionStatus = async (options?: { restoreForeground?: boolean; skipLoading?: boolean }): Promise<SpeakingSessionResponse | null> => {
    if (!sessionState?.session_id) {
      setError("请先创建口语会话");
      return null;
    }

    if (!options?.skipLoading) {
      setLoading(true);
    }

    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getSpeakingSession(accessToken, sessionState.session_id)
      );
      applySession({
        ...response,
        resume_token: resumeToken || response.resume_token
      });
      if (response.resume_token) {
        setResumeToken(response.resume_token);
      }
      setStatusMessage(options?.restoreForeground ? "前台恢复后已同步口语会话状态" : "已拉取服务端会话状态");
      setError(null);
      return response;
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : "拉取会话状态失败");
      return null;
    } finally {
      if (!options?.skipLoading) {
        setLoading(false);
      }
    }
  };

  const connect = async (options?: { skipPermissionCheck?: boolean }): Promise<void> => {
    if (!instanceConfig) {
      setConnectionStatus("未连接");
      setError("请先配置自托管实例");
      return;
    }

    if (!sessionState?.session_id || !resumeToken) {
      setError("请先创建口语会话");
      return;
    }

    if (!options?.skipPermissionCheck) {
      const granted = await ensureMicrophonePermission();
      if (!granted) {
        shouldReconnectRef.current = false;
        return;
      }
    }

    closeSocket();
    setConnectionStatus("连接中");

    try {
      const query = new URLSearchParams({
        session_id: sessionState.session_id,
        resume_token: resumeToken
      });

      const ws = new WebSocket(`${instanceConfig.wsBaseUrl}/v1/realtime/speaking?${query.toString()}`);
      socketRef.current = ws;

      ws.onopen = () => {
        if (socketRef.current !== ws) {
          return;
        }
        shouldReconnectRef.current = true;
        setConnectionStatus("已连接");
        setStatusMessage("实时连接已建立");
      };

      ws.onmessage = (event) => {
        if (socketRef.current !== ws) {
          return;
        }

        const payload = safeParseSocketPayload(event.data);
        if (!payload || typeof payload.type !== "string") {
          return;
        }

        if (payload.type === "heartbeat") {
          ws.send(JSON.stringify({ type: "heartbeat" }));
          return;
        }

        setRecentEvents((current) => [...current.slice(-9), payload.type as string]);

        if ((payload.type === "session_start" || payload.type === "session_resume") && payload.current_part) {
          setCurrentPart(payload.current_part);
          setConnectionStatus("已连接");
          setStatusMessage(payload.type === "session_resume" ? "会话已恢复" : "会话已开始");
          return;
        }

        if (payload.type === "part_switch" && payload.current_part) {
          setCurrentPart(payload.current_part);
          setStatusMessage(`已切换到 Part ${payload.current_part}`);
          return;
        }

        if (payload.type === "coach_question" && typeof payload.text === "string") {
          setStatusMessage(`Part ${payload.part_no ?? currentPart} 追问: ${payload.text}`);
          return;
        }

        if (payload.type === "score_update") {
          setScoreText(
            `F${payload.fluency ?? "-"} / L${payload.lexical ?? "-"} / G${payload.grammar ?? "-"} / P${payload.pronunciation ?? "-"}`
          );
          setSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : []);
          setLatencyMs(typeof payload.latency_ms === "number" ? payload.latency_ms : 0);
          setHeatmapText(
            `word=${payload.pronunciation_feedback?.word_issues?.length ?? 0} / phoneme=${payload.pronunciation_feedback?.phoneme_issues?.length ?? 0}`
          );
          setReplaySegmentCount(payload.pronunciation_feedback?.replay_segments?.length ?? 0);
          setPronunciationTasks(
            (payload.pronunciation_feedback?.task_recommendations ?? [])
              .map((item) =>
                item.task_id
                  ? {
                      taskId: item.task_id,
                      title: item.title ?? item.task_id,
                      description: item.description ?? "-",
                      phoneme: item.phoneme ?? "-",
                      status: item.status ?? "todo",
                      linkedTurnNos: item.linked_turn_nos ?? []
                    }
                  : null
              )
              .filter((item): item is PronunciationTask => Boolean(item))
          );
          setStatusMessage("已收到评分更新");
          return;
        }

        if (payload.type === "session_timeout") {
          setConnectionStatus("已断开");
          setStatusMessage("会话因心跳超时断开");
          return;
        }

        if (payload.type === "session_end") {
          shouldReconnectRef.current = false;
          setConnectionStatus("已结束");
          setStatusMessage("会话结束");
          setScoreText(formatScoreSummary(payload.summary));
          setSessionState((current) =>
            current
              ? {
                  ...current,
                  status: "ended",
                  summary: payload.summary
                    ? {
                        fluency: payload.summary.fluency ?? 0,
                        lexical: payload.summary.lexical ?? 0,
                        grammar: payload.summary.grammar ?? 0,
                        pronunciation: payload.summary.pronunciation ?? 0,
                        turns: payload.summary.turns ?? current.summary?.turns ?? current.turns ?? 0
                      }
                    : current.summary
                }
              : current
          );
          return;
        }

        if (payload.type === "error") {
          setError(payload.message ?? "实时会话返回错误");
        }
      };

      ws.onerror = () => {
        if (socketRef.current !== ws) {
          return;
        }
        setError("实时连接异常");
      };

      ws.onclose = () => {
        if (socketRef.current !== ws) {
          return;
        }
        socketRef.current = null;
        setConnectionStatus((current) => (current === "已结束" ? "已结束" : "已断开"));
      };
    } catch (connectError) {
      shouldReconnectRef.current = false;
      setConnectionStatus("未连接");
      setError(connectError instanceof Error ? connectError.message : "连接实时会话失败");
    }
  };

  const switchPart = async (partNo: 1 | 2 | 3): Promise<void> => {
    if (!sessionState?.session_id) {
      setError("请先创建口语会话");
      return;
    }

    try {
      const socket = socketRef.current;
      if (socket && isSocketOpen(socket)) {
        socket.send(
          JSON.stringify({
            type: "part_switch",
            part_no: partNo
          })
        );
      } else {
        await runWithAuthorizedClient((apiClient, accessToken) =>
          apiClient.switchSpeakingPart(accessToken, sessionState.session_id, partNo)
        );
      }

      setCurrentPart(partNo);
      setSessionState((current) =>
        current
          ? {
              ...current,
              current_part: partNo
            }
          : current
      );
      setStatusMessage(`已切换到 Part ${partNo}`);
      setError(null);
    } catch (partError) {
      setError(partError instanceof Error ? partError.message : "切换 Part 失败");
    }
  };

  const sendTranscript = (): void => {
    const socket = socketRef.current;
    if (!socket || !isSocketOpen(socket)) {
      setError("请先连接实时会话");
      return;
    }

    socket.send(
      JSON.stringify({
        type: "partial_transcript",
        text: transcript,
        part_no: currentPart
      })
    );
    setStatusMessage("已发送转写文本");
    setError(null);
  };

  const sendHeartbeat = (): void => {
    const socket = socketRef.current;
    if (!socket || !isSocketOpen(socket)) {
      setError("请先连接实时会话");
      return;
    }

    socket.send(
      JSON.stringify({
        type: "heartbeat"
      })
    );
    setStatusMessage("已发送心跳");
    setError(null);
  };

  const endSession = async (): Promise<void> => {
    const socket = socketRef.current;
    if (socket && isSocketOpen(socket)) {
      shouldReconnectRef.current = false;
      socket.send(
        JSON.stringify({
          type: "session_end"
        })
      );
      setStatusMessage("正在结束会话");
      setError(null);
      return;
    }

    if (!sessionState?.session_id) {
      setError("请先创建口语会话");
      return;
    }

    setLoading(true);
    shouldReconnectRef.current = false;

    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.endSpeakingSession(accessToken, sessionState.session_id)
      );
      applySession({
        ...response,
        current_part: sessionState.current_part,
        task_type: sessionState.task_type,
        scenario_type: sessionState.scenario_type,
        topic: sessionState.topic,
        source_session_id: sessionState.source_session_id,
        resume_until: sessionState.resume_until
      });
      setConnectionStatus("已结束");
      setStatusMessage("会话结束");
      setError(null);
    } catch (endError) {
      setError(endError instanceof Error ? endError.message : "结束会话失败");
    } finally {
      setLoading(false);
    }
  };

  const createRetrySession = async (): Promise<void> => {
    if (!sessionState?.session_id) {
      setError("请先完成一次会话");
      return;
    }

    closeSocket();
    shouldReconnectRef.current = false;
    setLoading(true);

    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.createSpeakingRetrySession(accessToken, sessionState.session_id)
      );
      applySession(response);
      setResumeToken(response.resume_token ?? "");
      resetLiveFeedback();
      setTranscript("");
      setStatusMessage("已创建同题再答会话");
      setError(null);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "创建同题再答失败");
    } finally {
      setLoading(false);
    }
  };

  const loadComparison = async (): Promise<void> => {
    if (!sessionState?.session_id) {
      setError("请先创建重答会话");
      return;
    }

    setLoading(true);

    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getSpeakingComparison(accessToken, sessionState.session_id)
      );
      setComparisonText(
        `ΔF${response.delta.fluency} ΔL${response.delta.lexical} ΔG${response.delta.grammar} ΔP${response.delta.pronunciation}`
      );
      setStatusMessage("已拉取前后对比");
      setError(null);
    } catch (compareError) {
      setError(compareError instanceof Error ? compareError.message : "拉取前后对比失败");
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async (): Promise<void> => {
    if (!sessionState?.session_id) {
      setError("请先创建口语会话");
      return;
    }

    setLoading(true);

    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getSpeakingSessionEvents(accessToken, sessionState.session_id)
      );
      setTraceCount(response.items.length);
      setRecentEvents(response.items.slice(-8).map((item) => item.type));
      setStatusMessage("已拉取会话日志");
      setError(null);
    } catch (eventsError) {
      setError(eventsError instanceof Error ? eventsError.message : "拉取会话日志失败");
    } finally {
      setLoading(false);
    }
  };

  const loadPronunciationFeedback = async (): Promise<void> => {
    if (!sessionState?.session_id) {
      setError("请先创建口语会话");
      return;
    }

    setLoading(true);

    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getSpeakingPronunciationFeedback(accessToken, sessionState.session_id)
      );

      const topWord = response.hotspot_words[0];
      const topPhoneme = response.hotspot_phonemes[0];
      setHeatmapText(
        `top_word=${topWord ? `${topWord.word}(${topWord.count})` : "-"} / top_phoneme=${topPhoneme ? `${topPhoneme.phoneme}(${topPhoneme.count})` : "-"}`
      );
      setReplaySegmentCount(response.turns.reduce((sum, turn) => sum + turn.replay_segments.length, 0));
      setPronunciationTasks(
        response.tasks.map((item) => ({
          taskId: item.task_id,
          title: item.title,
          description: item.description,
          phoneme: item.phoneme,
          status: item.status,
          linkedTurnNos: item.linked_turn_nos
        }))
      );
      setStatusMessage("已拉取发音热力图反馈");
      setError(null);
    } catch (feedbackError) {
      setError(feedbackError instanceof Error ? feedbackError.message : "拉取发音反馈失败");
    } finally {
      setLoading(false);
    }
  };

  const trackFirstPronunciationTask = async (): Promise<void> => {
    if (!sessionState?.session_id) {
      setError("请先创建口语会话");
      return;
    }

    const firstTask = pronunciationTasks[0];
    if (!firstTask) {
      setError("当前没有可追踪的纠音任务");
      return;
    }

    setLoading(true);

    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.trackSpeakingPronunciationTask(accessToken, sessionState.session_id, firstTask.taskId, "done")
      );
      setPronunciationTasks((current) =>
        current.map((item) => (item.taskId === response.task_id ? { ...item, status: response.status } : item))
      );
      setTrackedTaskText(`${response.task_id}:${response.status}`);
      setStatusMessage("已标记首个纠音任务完成");
      setError(null);
    } catch (trackError) {
      setError(trackError instanceof Error ? trackError.message : "追踪纠音任务失败");
    } finally {
      setLoading(false);
    }
  };

  const clearLocalCheckpoint = async (): Promise<void> => {
    if (!snapshotStorageKey) {
      return;
    }

    if (snapshotSaveTimeoutRef.current) {
      clearTimeout(snapshotSaveTimeoutRef.current);
      snapshotSaveTimeoutRef.current = null;
    }

    closeSocket();
    await clearStoredJson(snapshotStorageKey);
    skipNextSnapshotPersistRef.current = true;
    resetCheckpointState();
    setCheckpointReady(true);
    setCheckpointStatus("本地会话已清空");
    setStatusMessage("已清空本地口语会话");
  };

  useAppForegroundEffect(
    async () => {
      void syncMicrophonePermission();
      void setIsAudioActiveAsync(true).catch(() => undefined);

      if (loading || !sessionState?.session_id) {
        return;
      }

      const response = await loadSessionStatus({
        restoreForeground: true,
        skipLoading: true
      });

      if (!response || !shouldReconnectRef.current || response.status === "ended") {
        return;
      }

      await connect({
        skipPermissionCheck: true
      });
    },
    {
      enabled: Boolean(sessionState?.session_id)
    }
  );

  useEffect(() => {
    if (!checkpointReady || !pendingRestoreReconnectRef.current || !sessionState?.session_id || !resumeToken) {
      return;
    }

    pendingRestoreReconnectRef.current = false;
    setStatusMessage("已恢复本地口语会话，正在尝试重连实时连接");
    void connect();
  }, [checkpointReady, resumeToken, sessionState?.session_id]);

  const selectedScenario = scenarioItems.find((item) => item.scenario_type === scenarioType);

  if (!instanceConfig) {
    return <Redirect href="/instance" />;
  }

  if (!authSession) {
    return <Redirect href="/login" />;
  }

  return (
    <AppScreen
      eyebrow="Speaking"
      title="实时口语已进入移动端"
      subtitle="当前已接上 speaking session、WebSocket 实时交互、Part 切换、同题再答、前后对比、发音热力图与纠音任务追踪。"
    >
      <InfoCard tone="accent">
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>训练形态</Text>
        <View style={{ gap: 10 }}>
          {taskOptions.map((option) => {
            const active = option.value === taskType;
            return (
              <Pressable
                key={option.value}
                onPress={() => setTaskType(option.value)}
                style={{
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: active ? colors.cardAccentBorder : colors.cardBorder,
                  backgroundColor: active ? colors.cardAccent : colors.card,
                  padding: spacing.md,
                  gap: 6
                }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700" }}>{option.label}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>{option.description}</Text>
              </Pressable>
            );
          })}
        </View>
      </InfoCard>

      <TextField
        label="口语题目"
        value={topic}
        onChangeText={setTopic}
        placeholder="Describe a recent IELTS preparation experience."
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />

      {taskType === "role_play" ? (
        <InfoCard>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>角色场景</Text>
          <View style={{ gap: 10 }}>
            {scenarioOptions.map((option) => {
              const active = option.value === scenarioType;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setScenarioType(option.value)}
                  style={{
                    borderRadius: radii.md,
                    borderWidth: 1,
                    borderColor: active ? colors.cardAccentBorder : colors.cardBorder,
                    backgroundColor: active ? colors.cardAccent : colors.card,
                    padding: spacing.md,
                    gap: 6
                  }}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700" }}>{option.label}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>{option.description}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>scenario_count: {scenarioItems.length}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
            opening_prompt: {selectedScenario?.opening_prompt ?? "-"}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>npc_role: {selectedScenario?.npc_role ?? "-"}</Text>
          <PrimaryButton label={loading ? "处理中..." : "拉取角色场景"} onPress={() => void loadRolePlayScenarios()} disabled={loading} />
        </InfoCard>
      ) : null}

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>麦克风权限</Text>
        <ButtonRow>
          <StatusPill label={microphonePermissionStatus} tone={microphonePermissionStatus === "已授权" ? "success" : "neutral"} />
          <StatusPill label={requestingMicrophonePermission ? "申请中" : "待命"} tone="accent" />
        </ButtonRow>
        <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
          实时口语进入连接前会先校验麦克风权限。应用切到后台后会关闭实时连接，并在恢复前台时尝试同步会话状态。
        </Text>
        <ButtonRow>
          <PrimaryButton
            label={requestingMicrophonePermission ? "申请中..." : "授权麦克风"}
            onPress={() => void ensureMicrophonePermission()}
            disabled={requestingMicrophonePermission}
          />
          {microphoneSettingsRequired ? (
            <SecondaryButton
              label="打开系统麦克风设置"
              onPress={() => void openMicrophoneSettings()}
              disabled={requestingMicrophonePermission}
              testID="speaking.microphoneOpenSettings"
            />
          ) : null}
        </ButtonRow>
        {microphoneSettingsRequired ? (
          <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
            系统已阻止麦克风权限，请前往系统设置开启后再连接实时口语。
          </Text>
        ) : null}
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>本地会话恢复</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>checkpoint_status: {checkpointStatus}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          restore_target: {sessionState?.session_id ? `session ${sessionState.session_id}` : "当前尚无本地口语 checkpoint"}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          reconnect_intent: {shouldReconnectRef.current ? "true" : "false"}
        </Text>
        <ButtonRow>
          <PrimaryButton label="拉取会话状态" onPress={() => void loadSessionStatus()} disabled={loading || !sessionState} />
          <SecondaryButton label="清空本地会话" onPress={() => void clearLocalCheckpoint()} disabled={loading || !checkpointReady} />
        </ButtonRow>
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>当前会话</Text>
        <ButtonRow>
          <StatusPill label={connectionStatus} tone={connectionStatus === "已连接" || connectionStatus === "已结束" ? "success" : "neutral"} />
          <StatusPill label={statusMessage} tone={sessionState ? "accent" : "neutral"} />
        </ButtonRow>
        <View style={{ gap: 6, marginTop: 10 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>session_id: {sessionState?.session_id ?? "-"}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>task_type: {sessionState?.task_type ?? taskType}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            scenario_type: {taskType === "role_play" ? sessionState?.scenario_type ?? scenarioType : "-"}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>current_part: {currentPart}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>resume_until: {sessionState?.resume_until ?? "-"}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>source_session_id: {sessionState?.source_session_id ?? "-"}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>turns: {sessionState?.turns ?? sessionState?.summary?.turns ?? 0}</Text>
        </View>
        <ButtonRow>
          <PrimaryButton label={loading ? "处理中..." : "创建口语会话"} onPress={() => void createSession()} disabled={loading} />
          <SecondaryButton label="拉取会话状态" onPress={() => void loadSessionStatus()} disabled={loading || !sessionState} />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton label="连接实时会话" onPress={() => void connect()} disabled={!sessionState || !resumeToken} />
          <SecondaryButton label="结束会话" onPress={() => void endSession()} disabled={loading || !sessionState} />
        </ButtonRow>
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>Part 控制</Text>
        <ButtonRow>
          <PrimaryButton label="切到 Part1" onPress={() => void switchPart(1)} disabled={!sessionState} />
          <SecondaryButton label="切到 Part2" onPress={() => void switchPart(2)} disabled={!sessionState} />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton label="切到 Part3" onPress={() => void switchPart(3)} disabled={!sessionState} />
          <SecondaryButton label="发送心跳" onPress={sendHeartbeat} disabled={!isSocketOpen(socketRef.current)} />
        </ButtonRow>
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>实时转写</Text>
        <TextField
          label="转写文本"
          value={transcript}
          onChangeText={setTranscript}
          placeholder="Because I practiced daily, I can answer faster."
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />
        <ButtonRow>
          <PrimaryButton label="发送转写" onPress={sendTranscript} disabled={!isSocketOpen(socketRef.current)} />
          <SecondaryButton label="同题再答" onPress={() => void createRetrySession()} disabled={loading || !sessionState} />
        </ButtonRow>
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>评分与反馈</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700" }}>score: {scoreText}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          suggestions: {suggestions.length ? suggestions.join(" | ") : "-"}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>latency_ms: {latencyMs}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>pronunciation_heatmap: {heatmapText}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>replay_segment_count: {replaySegmentCount}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>pronunciation_task_count: {pronunciationTasks.length}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>tracked_task: {trackedTaskText}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>comparison: {comparisonText}</Text>
        <ButtonRow>
          <PrimaryButton
            label="拉取发音热力图"
            onPress={() => void loadPronunciationFeedback()}
            disabled={loading || !sessionState}
          />
          <SecondaryButton
            label="标记首个纠音任务完成"
            onPress={() => void trackFirstPronunciationTask()}
            disabled={loading || pronunciationTasks.length === 0 || !sessionState}
          />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton label="拉取前后对比" onPress={() => void loadComparison()} disabled={loading || !sessionState} />
          <SecondaryButton label="拉取会话日志" onPress={() => void loadEvents()} disabled={loading || !sessionState} />
        </ButtonRow>
      </InfoCard>

      {pronunciationTasks.length ? (
        <InfoCard>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>纠音任务</Text>
          <View style={{ gap: 10 }}>
            {pronunciationTasks.map((task) => (
              <View
                key={task.taskId}
                style={{
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: colors.cardBorder,
                  backgroundColor: colors.input,
                  padding: spacing.md,
                  gap: 6
                }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>
                  {task.title} · {task.status}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>task_id: {task.taskId}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>phoneme: {task.phoneme}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>{task.description}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  linked_turns: {task.linkedTurnNos.length ? task.linkedTurnNos.join(", ") : "-"}
                </Text>
              </View>
            ))}
          </View>
        </InfoCard>
      ) : null}

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>事件轨迹</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>event_trace_count: {traceCount}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          recent_events: {recentEvents.length ? recentEvents.join(" , ") : "-"}
        </Text>
      </InfoCard>

      {error ? <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{error}</Text> : null}

      <ButtonRow>
        <PrimaryButton label="返回首页" onPress={() => router.replace("/home")} />
        <SecondaryButton label="查看学习进度" onPress={() => router.push("/progress")} />
      </ButtonRow>
    </AppScreen>
  );
}
