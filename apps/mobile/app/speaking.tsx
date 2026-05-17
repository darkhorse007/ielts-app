import { Redirect, router } from "expo-router";
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync, setIsAudioActiveAsync } from "expo-audio";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { ApiNetworkError, ApiRequestError } from "../src/lib/api-client";
import type { SpeakingRolePlayScenariosResponse, SpeakingSessionResponse } from "../src/lib/api-types";
import { useAppForegroundEffect } from "../src/hooks/use-app-foreground-effect";
import { openAppSettingsAsync } from "../src/lib/native-settings";
import {
  ExpoSpeechRecognitionModule,
  getSpeechRecognitionUnsupportedReason,
  useSpeechRecognitionEvent
} from "../src/lib/speech-recognition";
import { buildScopedStorageKey, clearStoredJson, loadStoredJson, saveStoredJson } from "../src/lib/storage";
import { useAppSession } from "../src/state/app-session";
import { useStudyLoop } from "../src/state/study-loop";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, StatusPill, TextField } from "../src/ui/primitives";
import { StudyLoopNextStepCard } from "../src/ui/study-loop-next-step-card";
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

const formatIsoDateTime = (value?: string | null): string => {
  if (!value) {
    return "-";
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Date(timestamp).toLocaleString("zh-CN", {
    hour12: false
  });
};

const formatTranscriptPreview = (value: string): string => {
  const normalized = value.trim();
  if (normalized.length <= 48) {
    return normalized;
  }

  return `${normalized.slice(0, 45)}...`;
};

const formatVoiceVolume = (value: number | null): string => {
  if (value === null) {
    return "-";
  }

  return value.toFixed(1);
};

type SpeakingRetryAction =
  | "create_session"
  | "load_role_play_scenarios"
  | "load_session_status"
  | "connect_session"
  | "switch_part"
  | "end_session"
  | "create_retry_session"
  | "load_comparison"
  | "load_events"
  | "load_pronunciation_feedback"
  | "track_pronunciation_task";

type LastFailedSpeakingAction = {
  action: SpeakingRetryAction;
  switchPartTarget?: 1 | 2 | 3;
};

const formatSpeakingRetryActionLabel = (value: SpeakingRetryAction): string => {
  switch (value) {
    case "create_session":
      return "创建会话";
    case "load_role_play_scenarios":
      return "拉取场景";
    case "load_session_status":
      return "拉取状态";
    case "connect_session":
      return "连接会话";
    case "switch_part":
      return "切换 Part";
    case "end_session":
      return "结束会话";
    case "create_retry_session":
      return "同题再答";
    case "load_comparison":
      return "拉取对比";
    case "load_events":
      return "拉取日志";
    case "load_pronunciation_feedback":
      return "拉取发音反馈";
    case "track_pronunciation_task":
      return "追踪纠音任务";
    default:
      return value;
  }
};

const toRequestErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiNetworkError) {
    return error.message;
  }

  if (error instanceof ApiRequestError) {
    const requestLine = error.method && error.url ? ` (${error.method} ${error.url})` : "";
    return `${error.message}${requestLine}`;
  }

  return error instanceof Error ? error.message : fallback;
};

export default function SpeakingScreen() {
  const { instanceConfig, session: authSession, runWithAuthorizedClient } = useAppSession();
  const { recordActivity } = useStudyLoop();
  const speechRecognitionUnsupportedReason = getSpeechRecognitionUnsupportedReason();
  const socketRef = useRef<WebSocket | null>(null);
  const shouldReconnectRef = useRef(false);
  const voiceCaptureResumeRef = useRef(false);
  const voiceCaptureActiveRef = useRef(false);
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
  const [speechPermissionStatus, setSpeechPermissionStatus] = useState(
    speechRecognitionUnsupportedReason ? "运行环境不支持" : "未决定"
  );
  const [speechSettingsRequired, setSpeechSettingsRequired] = useState(false);
  const [requestingSpeechPermission, setRequestingSpeechPermission] = useState(false);
  const [speechRecognitionAvailable, setSpeechRecognitionAvailable] = useState(
    ExpoSpeechRecognitionModule.isRecognitionAvailable()
  );
  const [voiceCaptureActive, setVoiceCaptureActive] = useState(false);
  const [voiceCaptureStatus, setVoiceCaptureStatus] = useState("未开始");
  const [voiceInterimTranscript, setVoiceInterimTranscript] = useState("");
  const [voiceFinalTranscript, setVoiceFinalTranscript] = useState("");
  const [voiceAudioUri, setVoiceAudioUri] = useState<string | null>(null);
  const [voiceVolume, setVoiceVolume] = useState<number | null>(null);
  const [voiceDeliveryDetail, setVoiceDeliveryDetail] = useState("-");
  const [loading, setLoading] = useState(false);
  const [serverSyncDetail, setServerSyncDetail] = useState("-");
  const [serverSyncAt, setServerSyncAt] = useState<string | null>(null);
  const [lastFailedAction, setLastFailedAction] = useState<LastFailedSpeakingAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const snapshotStorageKey = authSession
    ? buildScopedStorageKey("speaking", "draft", "v1", authSession.userId)
    : null;

  const markSyncSuccess = (statusText: string, detail: string): void => {
    setStatusMessage(statusText);
    setServerSyncDetail(detail);
    setServerSyncAt(new Date().toISOString());
    setLastFailedAction(null);
  };

  const markSyncFailure = (
    action: SpeakingRetryAction,
    detail: string,
    options?: {
      switchPartTarget?: 1 | 2 | 3;
    }
  ): void => {
    setStatusMessage(`${formatSpeakingRetryActionLabel(action)}失败`);
    setServerSyncDetail(detail);
    setServerSyncAt(new Date().toISOString());
    setLastFailedAction({
      action,
      switchPartTarget: action === "switch_part" ? options?.switchPartTarget : undefined
    });
  };

  const closeSocket = (): void => {
    const existing = socketRef.current;
    if (!existing) {
      return;
    }

    socketRef.current = null;
    existing.close();
  };

  const resetVoiceCaptureState = (options?: { clearResumeIntent?: boolean }): void => {
    if (options?.clearResumeIntent ?? true) {
      voiceCaptureResumeRef.current = false;
    }

    setVoiceCaptureActive(false);
    setVoiceCaptureStatus("未开始");
    setVoiceInterimTranscript("");
    setVoiceFinalTranscript("");
    setVoiceAudioUri(null);
    setVoiceVolume(null);
    setVoiceDeliveryDetail("-");
  };

  const abortVoiceCapture = useEffectEvent((reason: string, options?: { preserveResumeIntent?: boolean }) => {
    if (!options?.preserveResumeIntent) {
      voiceCaptureResumeRef.current = false;
    }

    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // Best-effort cleanup when the recognizer is already inactive.
    }

    setVoiceCaptureActive(false);
    setVoiceCaptureStatus(reason);
    setVoiceVolume(null);
  });

  const resetCheckpointState = (): void => {
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // Best-effort cleanup only.
    }

    shouldReconnectRef.current = false;
    pendingRestoreReconnectRef.current = false;
    resetVoiceCaptureState();
    setTaskType(defaultTaskType);
    setScenarioType(defaultScenarioType);
    setTopic(defaultTopic);
    setTranscript("");
    setSessionState(null);
    setResumeToken("");
    setScenarioItems([]);
    setConnectionStatus("未连接");
    setStatusMessage("未开始");
    setServerSyncDetail("-");
    setServerSyncAt(null);
    setLastFailedAction(null);
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

  useEffect(() => {
    return () => {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // Best-effort cleanup only.
      }
      closeSocket();
    };
  }, []);

  useEffect(() => {
    if (!instanceConfig || !authSession) {
      closeSocket();
    }
  }, [authSession, instanceConfig]);

  useEffect(() => {
    voiceCaptureActiveRef.current = voiceCaptureActive;
  }, [voiceCaptureActive]);

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

  const syncSpeechRecognitionPermission = async (): Promise<boolean> => {
    try {
      const recognitionAvailable = ExpoSpeechRecognitionModule.isRecognitionAvailable();
      setSpeechRecognitionAvailable(recognitionAvailable);
      if (!recognitionAvailable) {
        setSpeechPermissionStatus(speechRecognitionUnsupportedReason ? "运行环境不支持" : "不可用");
        setSpeechSettingsRequired(false);
        return false;
      }

      const permission = await ExpoSpeechRecognitionModule.getPermissionsAsync();
      setSpeechPermissionStatus(toPermissionLabel(permission.status));
      setSpeechSettingsRequired(!permission.granted && permission.canAskAgain === false);
      return permission.granted && recognitionAvailable;
    } catch {
      setSpeechPermissionStatus("检查失败");
      setSpeechRecognitionAvailable(false);
      setSpeechSettingsRequired(false);
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

  const ensureVoiceCapturePermission = async (): Promise<boolean> => {
    const microphoneReady = await ensureMicrophonePermission();
    if (!microphoneReady) {
      return false;
    }

    const recognitionAvailable = ExpoSpeechRecognitionModule.isRecognitionAvailable();
    setSpeechRecognitionAvailable(recognitionAvailable);
    if (!recognitionAvailable) {
      setVoiceCaptureStatus(speechRecognitionUnsupportedReason ? "当前运行环境不支持语音识别" : "当前设备不支持语音识别");
      setError(speechRecognitionUnsupportedReason ?? "当前设备不支持语音识别服务，无法开始原生语音输入");
      return false;
    }

    const alreadyGranted = await syncSpeechRecognitionPermission();
    if (alreadyGranted) {
      return true;
    }

    setRequestingSpeechPermission(true);
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      setSpeechPermissionStatus(toPermissionLabel(permission.status));
      setSpeechSettingsRequired(!permission.granted && permission.canAskAgain === false);
      if (!permission.granted) {
        setError("语音识别权限未授予，无法开始原生语音输入");
        return false;
      }

      setError(null);
      setStatusMessage("语音识别权限已授权");
      return true;
    } catch (permissionError) {
      setError(permissionError instanceof Error ? permissionError.message : "申请语音识别权限失败");
      return false;
    } finally {
      setRequestingSpeechPermission(false);
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
    void syncSpeechRecognitionPermission();
  }, []);

  useEffect(() => {
    let currentState = AppState.currentState ?? "active";

    const subscription = AppState.addEventListener("change", (nextState) => {
      const movedToBackground = currentState === "active" && nextState !== "active";
      currentState = nextState;

      if (!movedToBackground) {
        return;
      }

      if (voiceCaptureActiveRef.current) {
        voiceCaptureResumeRef.current = true;
        abortVoiceCapture("应用切到后台，已暂停原生语音输入", {
          preserveResumeIntent: true
        });
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

  const sendTranscriptText = useEffectEvent((text: string, options?: { source?: "manual" | "voice" }): boolean => {
    const normalized = text.trim();
    if (!normalized) {
      setError("转写文本不能为空");
      return false;
    }

    setTranscript(normalized);
    if (options?.source === "voice") {
      setVoiceFinalTranscript(normalized);
    }

    const socket = socketRef.current;
    if (!socket || !isSocketOpen(socket)) {
      if (options?.source === "voice") {
        setVoiceDeliveryDetail("已保留 voice transcript，等待连接后发送");
        setVoiceCaptureStatus("已识别语音，等待实时连接");
        setError(null);
        return false;
      }

      setError("请先连接实时会话");
      return false;
    }

    socket.send(
      JSON.stringify({
        type: "partial_transcript",
        text: normalized,
        part_no: currentPart
      })
    );
    setStatusMessage(options?.source === "voice" ? "已自动发送语音转写" : "已发送转写文本");
    setServerSyncDetail(
      `session ${sessionState?.session_id ?? "-"} / part ${currentPart} / source ${options?.source ?? "manual"} / preview ${formatTranscriptPreview(normalized)}`
    );
    setServerSyncAt(new Date().toISOString());
    setLastFailedAction(null);
    setVoiceDeliveryDetail(options?.source === "voice" ? "已自动发送 voice transcript" : "最近一次发送来自手工转写");
    setError(null);
    return true;
  });

  const startVoiceCapture = async (options?: { skipPermissionCheck?: boolean; autoResumed?: boolean }): Promise<void> => {
    if (!sessionState?.session_id || !resumeToken) {
      setError("请先创建口语会话");
      return;
    }

    if (!isSocketOpen(socketRef.current)) {
      setError("请先连接实时会话");
      return;
    }

    if (!options?.skipPermissionCheck) {
      const granted = await ensureVoiceCapturePermission();
      if (!granted) {
        voiceCaptureResumeRef.current = false;
        return;
      }
    }

    try {
      setVoiceInterimTranscript("");
      setVoiceFinalTranscript("");
      setVoiceAudioUri(null);
      setVoiceVolume(null);
      setVoiceDeliveryDetail("-");
      setVoiceCaptureStatus(options?.autoResumed ? "正在恢复语音输入" : "正在启动语音输入");
      setStatusMessage(options?.autoResumed ? "正在恢复原生语音输入" : "正在启动原生语音输入");
      const contextualStrings = Array.from(
        new Set(
          ["IELTS", "speaking", ...topic.split(/[^A-Za-z]+/).filter((item) => item.length >= 4).slice(0, 6)].map((item) =>
            item.trim()
          )
        )
      ).filter(Boolean);

      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        continuous: false,
        addsPunctuation: true,
        iosTaskHint: "dictation",
        iosVoiceProcessingEnabled: true,
        contextualStrings,
        androidIntentOptions: {
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 1500,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 1000
        },
        recordingOptions: {
          persist: true,
          outputFileName: `speaking-${Date.now()}.wav`
        },
        volumeChangeEventOptions: {
          enabled: true,
          intervalMillis: 250
        }
      });
      setError(null);
    } catch (startError) {
      const message = startError instanceof Error ? startError.message : "启动原生语音输入失败";
      voiceCaptureResumeRef.current = false;
      setVoiceCaptureActive(false);
      setVoiceCaptureStatus("启动语音输入失败");
      setError(message);
    }
  };

  const stopVoiceCapture = (): void => {
    if (!voiceCaptureActive) {
      return;
    }

    try {
      ExpoSpeechRecognitionModule.stop();
      setVoiceCaptureStatus("正在结束语音输入");
      setError(null);
    } catch (stopError) {
      const message = stopError instanceof Error ? stopError.message : "停止语音输入失败";
      setError(message);
    }
  };

  const handleSpeechRecognitionStart = useEffectEvent(() => {
    setVoiceCaptureActive(true);
    setVoiceCaptureStatus("录音中，正在识别");
    setError(null);
  });

  const handleSpeechRecognitionAudioStart = useEffectEvent((event: { uri: string | null }) => {
    setVoiceCaptureStatus("已开始原生录音");
    setVoiceAudioUri(event.uri);
  });

  const handleSpeechRecognitionResult = useEffectEvent((event: { isFinal: boolean; results: Array<{ transcript: string }> }) => {
    const transcriptText = event.results[0]?.transcript?.trim() ?? "";
    if (!transcriptText) {
      return;
    }

    setTranscript(transcriptText);
    if (event.isFinal) {
      setVoiceInterimTranscript("");
      setVoiceFinalTranscript(transcriptText);
      setVoiceCaptureStatus("已识别最终结果");
      sendTranscriptText(transcriptText, {
        source: "voice"
      });
      return;
    }

    setVoiceInterimTranscript(transcriptText);
    setVoiceCaptureStatus("正在识别语音");
  });

  const handleSpeechRecognitionError = useEffectEvent((event: { error: string; message: string }) => {
    voiceCaptureResumeRef.current = false;
    setVoiceCaptureActive(false);
    setVoiceCaptureStatus(`语音识别失败: ${event.error}`);
    setError(event.message);
  });

  const handleSpeechRecognitionEnd = useEffectEvent(() => {
    setVoiceCaptureActive(false);
    setVoiceVolume(null);
    setVoiceCaptureStatus((current) => (current === "会话结束，已停止原生语音输入" ? current : "语音输入已结束"));
  });

  const handleSpeechRecognitionAudioEnd = useEffectEvent((event: { uri: string | null }) => {
    setVoiceAudioUri(event.uri);
  });

  const handleSpeechRecognitionVolumeChange = useEffectEvent((event: { value: number }) => {
    setVoiceVolume(event.value);
  });

  useSpeechRecognitionEvent("start", handleSpeechRecognitionStart);
  useSpeechRecognitionEvent("audiostart", handleSpeechRecognitionAudioStart);
  useSpeechRecognitionEvent("result", handleSpeechRecognitionResult);
  useSpeechRecognitionEvent("error", handleSpeechRecognitionError);
  useSpeechRecognitionEvent("end", handleSpeechRecognitionEnd);
  useSpeechRecognitionEvent("audioend", handleSpeechRecognitionAudioEnd);
  useSpeechRecognitionEvent("volumechange", handleSpeechRecognitionVolumeChange);

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

  const recordSpeakingCompletion = (input: {
    sessionId: string;
    summary?: SpeakingSessionResponse["summary"] | SpeakingSocketPayload["summary"] | null;
    turns?: number;
  }): void => {
    if (!input.summary) {
      return;
    }

    recordActivity({
      dedupeKey: `speaking:${input.sessionId}`,
      skill: "speaking",
      source: "speaking_session_end",
      title: "口语会话已完成",
      summary: `口语完成 ${formatScoreSummary(input.summary)} / turns ${input.turns ?? input.summary.turns ?? 0}`,
      route: "/speaking"
    });
  };

  const createSession = async (): Promise<void> => {
    abortVoiceCapture("会话已重建，已停止原生语音输入");
    closeSocket();
    shouldReconnectRef.current = false;
    setLoading(true);

    try {
      setStatusMessage("正在创建口语会话");
      setServerSyncDetail(`task_type ${taskType} / scenario_type ${taskType === "role_play" ? scenarioType : "-"}`);
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
      markSyncSuccess(
        "已创建实时口语会话",
        `session ${response.session_id} / task_type ${response.task_type} / current_part ${response.current_part ?? 1}`
      );
      setError(null);
    } catch (createError) {
      const message = toRequestErrorMessage(createError, "创建口语会话失败");
      markSyncFailure("create_session", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const loadRolePlayScenarios = async (): Promise<void> => {
    setLoading(true);

    try {
      setStatusMessage("正在拉取角色场景");
      setServerSyncDetail("role_play scenarios");
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
      markSyncSuccess("已拉取角色场景", `scenario_count ${response.items.length}`);
      setError(null);
    } catch (scenarioError) {
      const message = toRequestErrorMessage(scenarioError, "拉取角色场景失败");
      markSyncFailure("load_role_play_scenarios", message);
      setError(message);
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
      if (response.status === "ended" && response.summary) {
        recordSpeakingCompletion({
          sessionId: response.session_id,
          summary: response.summary,
          turns: response.summary.turns ?? response.turns
        });
      }
      applySession({
        ...response,
        resume_token: resumeToken || response.resume_token
      });
      if (response.resume_token) {
        setResumeToken(response.resume_token);
      }
      markSyncSuccess(
        options?.restoreForeground ? "前台恢复后已同步口语会话状态" : "已拉取服务端会话状态",
        `session ${response.session_id} / status ${response.status} / current_part ${response.current_part ?? currentPart}`
      );
      setError(null);
      return response;
    } catch (sessionError) {
      const message = toRequestErrorMessage(sessionError, "拉取会话状态失败");
      markSyncFailure("load_session_status", message);
      setError(message);
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
    setStatusMessage("正在连接实时会话");
    setServerSyncDetail(`session ${sessionState.session_id}`);

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
        markSyncSuccess("实时连接已建立", `session ${sessionState.session_id} / websocket connected`);
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
          markSyncSuccess(
            payload.type === "session_resume" ? "会话已恢复" : "会话已开始",
            `session ${sessionState.session_id} / current_part ${payload.current_part}`
          );
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
          markSyncFailure("connect_session", "会话因心跳超时断开");
          return;
        }

        if (payload.type === "session_end") {
          shouldReconnectRef.current = false;
          resetVoiceCaptureState();
          setVoiceCaptureStatus("会话结束，已停止原生语音输入");
          setConnectionStatus("已结束");
          markSyncSuccess(
            "会话结束",
            `session ${sessionState.session_id ?? "-"} / turns ${payload.summary?.turns ?? sessionState?.summary?.turns ?? sessionState?.turns ?? 0}`
          );
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
          if (sessionState?.session_id) {
            recordSpeakingCompletion({
              sessionId: sessionState.session_id,
              summary: payload.summary,
              turns: payload.summary?.turns ?? sessionState.summary?.turns ?? sessionState.turns
            });
          }
          return;
        }

        if (payload.type === "error") {
          const message = payload.message ?? "实时会话返回错误";
          markSyncFailure("connect_session", message);
          setError(message);
        }
      };

      ws.onerror = () => {
        if (socketRef.current !== ws) {
          return;
        }
        markSyncFailure("connect_session", "实时连接异常");
        setError("实时连接异常");
      };

      ws.onclose = () => {
        if (socketRef.current !== ws) {
          return;
        }
        socketRef.current = null;
        setConnectionStatus((current) => (current === "已结束" ? "已结束" : "已断开"));
        if (voiceCaptureActiveRef.current) {
          abortVoiceCapture("实时连接断开，已停止原生语音输入");
        }
      };
    } catch (connectError) {
      shouldReconnectRef.current = false;
      setConnectionStatus("未连接");
      const message = toRequestErrorMessage(connectError, "连接实时会话失败");
      markSyncFailure("connect_session", message);
      setError(message);
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
      markSyncSuccess(`已切换到 Part ${partNo}`, `session ${sessionState.session_id} / current_part ${partNo}`);
      setError(null);
    } catch (partError) {
      const message = toRequestErrorMessage(partError, "切换 Part 失败");
      markSyncFailure("switch_part", message, {
        switchPartTarget: partNo
      });
      setError(message);
    }
  };

  const sendTranscript = (): void => {
    sendTranscriptText(transcript, {
      source: "manual"
    });
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
    abortVoiceCapture("会话结束，已停止原生语音输入");
    const socket = socketRef.current;
    if (socket && isSocketOpen(socket)) {
      shouldReconnectRef.current = false;
      socket.send(
        JSON.stringify({
          type: "session_end"
        })
      );
      setStatusMessage("正在结束会话");
      setServerSyncDetail(`session ${sessionState?.session_id ?? "-"}`);
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
      setServerSyncDetail(`session ${sessionState.session_id}`);
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.endSpeakingSession(accessToken, sessionState.session_id)
      );
      recordSpeakingCompletion({
        sessionId: response.session_id,
        summary: response.summary,
        turns: response.summary?.turns ?? response.turns
      });
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
      markSyncSuccess(
        "会话结束",
        `session ${response.session_id} / turns ${response.summary?.turns ?? response.turns ?? 0}`
      );
      setError(null);
    } catch (endError) {
      const message = toRequestErrorMessage(endError, "结束会话失败");
      markSyncFailure("end_session", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const createRetrySession = async (): Promise<void> => {
    if (!sessionState?.session_id) {
      setError("请先完成一次会话");
      return;
    }

    abortVoiceCapture("重答会话已创建，已停止原生语音输入");
    closeSocket();
    shouldReconnectRef.current = false;
    setLoading(true);

    try {
      setStatusMessage("正在创建同题再答会话");
      setServerSyncDetail(`session ${sessionState.session_id}`);
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.createSpeakingRetrySession(accessToken, sessionState.session_id)
      );
      applySession(response);
      setResumeToken(response.resume_token ?? "");
      resetLiveFeedback();
      setTranscript("");
      markSyncSuccess(
        "已创建同题再答会话",
        `session ${response.session_id} / source_session_id ${response.source_session_id ?? sessionState.session_id}`
      );
      setError(null);
    } catch (retryError) {
      const message = toRequestErrorMessage(retryError, "创建同题再答失败");
      markSyncFailure("create_retry_session", message);
      setError(message);
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
      setStatusMessage("正在拉取前后对比");
      setServerSyncDetail(`session ${sessionState.session_id}`);
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getSpeakingComparison(accessToken, sessionState.session_id)
      );
      setComparisonText(
        `ΔF${response.delta.fluency} ΔL${response.delta.lexical} ΔG${response.delta.grammar} ΔP${response.delta.pronunciation}`
      );
      markSyncSuccess("已拉取前后对比", comparisonText === "-" ? "comparison loaded" : comparisonText);
      setError(null);
    } catch (compareError) {
      const message = toRequestErrorMessage(compareError, "拉取前后对比失败");
      markSyncFailure("load_comparison", message);
      setError(message);
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
      setStatusMessage("正在拉取会话日志");
      setServerSyncDetail(`session ${sessionState.session_id}`);
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getSpeakingSessionEvents(accessToken, sessionState.session_id)
      );
      setTraceCount(response.items.length);
      setRecentEvents(response.items.slice(-8).map((item) => item.type));
      markSyncSuccess("已拉取会话日志", `event_count ${response.items.length}`);
      setError(null);
    } catch (eventsError) {
      const message = toRequestErrorMessage(eventsError, "拉取会话日志失败");
      markSyncFailure("load_events", message);
      setError(message);
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
      setStatusMessage("正在拉取发音热力图反馈");
      setServerSyncDetail(`session ${sessionState.session_id}`);
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
      markSyncSuccess(
        "已拉取发音热力图反馈",
        `tasks ${response.tasks.length} / replay_segments ${response.turns.reduce((sum, turn) => sum + turn.replay_segments.length, 0)}`
      );
      setError(null);
    } catch (feedbackError) {
      const message = toRequestErrorMessage(feedbackError, "拉取发音反馈失败");
      markSyncFailure("load_pronunciation_feedback", message);
      setError(message);
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
      setStatusMessage("正在追踪纠音任务");
      setServerSyncDetail(`session ${sessionState.session_id} / task ${firstTask.taskId}`);
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.trackSpeakingPronunciationTask(accessToken, sessionState.session_id, firstTask.taskId, "done")
      );
      setPronunciationTasks((current) =>
        current.map((item) => (item.taskId === response.task_id ? { ...item, status: response.status } : item))
      );
      setTrackedTaskText(`${response.task_id}:${response.status}`);
      markSyncSuccess("已标记首个纠音任务完成", `task ${response.task_id}:${response.status}`);
      setError(null);
    } catch (trackError) {
      const message = toRequestErrorMessage(trackError, "追踪纠音任务失败");
      markSyncFailure("track_pronunciation_task", message);
      setError(message);
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

  const retryLastFailedAction = async (): Promise<void> => {
    switch (lastFailedAction?.action) {
      case "create_session":
        await createSession();
        break;
      case "load_role_play_scenarios":
        await loadRolePlayScenarios();
        break;
      case "load_session_status":
        await loadSessionStatus();
        break;
      case "connect_session":
        await connect();
        break;
      case "switch_part":
        await switchPart(lastFailedAction.switchPartTarget ?? currentPart);
        break;
      case "end_session":
        await endSession();
        break;
      case "create_retry_session":
        await createRetrySession();
        break;
      case "load_comparison":
        await loadComparison();
        break;
      case "load_events":
        await loadEvents();
        break;
      case "load_pronunciation_feedback":
        await loadPronunciationFeedback();
        break;
      case "track_pronunciation_task":
        await trackFirstPronunciationTask();
        break;
      default:
        break;
    }
  };

  useAppForegroundEffect(
    async () => {
      void syncMicrophonePermission();
      void syncSpeechRecognitionPermission();
      void setIsAudioActiveAsync(true).catch(() => undefined);

      if (loading || !sessionState?.session_id) {
        return;
      }

      const response = await loadSessionStatus({
        restoreForeground: true,
        skipLoading: true
      });

      if (!response || !shouldReconnectRef.current || response.status === "ended") {
        voiceCaptureResumeRef.current = false;
        return;
      }

      await connect({
        skipPermissionCheck: true
      });

      if (voiceCaptureResumeRef.current) {
        await startVoiceCapture({
          skipPermissionCheck: true,
          autoResumed: true
        });
        voiceCaptureResumeRef.current = false;
      }
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
          <StatusPill
            label={`语音识别${speechPermissionStatus}`}
            tone={speechPermissionStatus === "已授权" ? "success" : "neutral"}
          />
        </ButtonRow>
        <ButtonRow>
          <StatusPill label={speechRecognitionAvailable ? "识别服务可用" : "识别服务不可用"} tone={speechRecognitionAvailable ? "success" : "accent"} />
          <StatusPill label={requestingMicrophonePermission || requestingSpeechPermission ? "申请中" : "待命"} tone="accent" />
        </ButtonRow>
        <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
          实时口语进入连接前会先校验麦克风权限；开始原生语音输入前会额外校验语音识别服务。应用切到后台后会关闭实时连接，并在恢复前台时尝试同步会话状态。
        </Text>
        <ButtonRow>
          <PrimaryButton
            label={requestingMicrophonePermission ? "申请中..." : "授权麦克风"}
            onPress={() => void ensureMicrophonePermission()}
            disabled={requestingMicrophonePermission}
          />
          <SecondaryButton
            label={speechRecognitionUnsupportedReason ? "运行环境不支持" : requestingSpeechPermission ? "申请中..." : "授权语音识别"}
            onPress={() => void ensureVoiceCapturePermission()}
            disabled={requestingSpeechPermission || Boolean(speechRecognitionUnsupportedReason)}
          />
        </ButtonRow>
        {speechRecognitionUnsupportedReason ? (
          <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>{speechRecognitionUnsupportedReason}</Text>
        ) : null}
        {microphoneSettingsRequired || speechSettingsRequired ? (
          <ButtonRow>
            <SecondaryButton
              label="打开系统麦克风设置"
              onPress={() => void openMicrophoneSettings()}
              disabled={requestingMicrophonePermission || requestingSpeechPermission}
              testID="speaking.microphoneOpenSettings"
            />
          </ButtonRow>
        ) : null}
        {microphoneSettingsRequired || speechSettingsRequired ? (
          <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
            系统已阻止麦克风或语音识别权限，请前往系统设置开启后再连接实时口语。
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

      <InfoCard tone={lastFailedAction ? "accent" : "default"}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>服务端同步</Text>
        <ButtonRow>
          <StatusPill
            label={statusMessage}
            tone={lastFailedAction ? "accent" : serverSyncAt ? "success" : "neutral"}
          />
          <StatusPill
            label={
              lastFailedAction ? `待重试 ${formatSpeakingRetryActionLabel(lastFailedAction.action)}` : "链路已就绪"
            }
            tone={lastFailedAction ? "accent" : serverSyncAt ? "success" : "neutral"}
          />
        </ButtonRow>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>server_sync_status: {statusMessage}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>server_sync_at: {formatIsoDateTime(serverSyncAt)}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>server_sync_result: {serverSyncDetail}</Text>
        {lastFailedAction ? (
          <ButtonRow>
            <PrimaryButton
              label="重试上次失败操作"
              onPress={() => void retryLastFailedAction()}
              disabled={loading}
              testID="speaking.retryLastFailedAction"
            />
          </ButtonRow>
        ) : null}
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

      <InfoCard tone={voiceCaptureActive ? "accent" : "default"}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>原生语音输入</Text>
        <ButtonRow>
          <StatusPill label={voiceCaptureActive ? "录音中" : "待命"} tone={voiceCaptureActive ? "accent" : "neutral"} />
          <StatusPill label={voiceCaptureStatus} tone={voiceCaptureActive ? "accent" : "neutral"} />
        </ButtonRow>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>voice_interim: {voiceInterimTranscript || "-"}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>voice_final: {voiceFinalTranscript || "-"}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>voice_audio_uri: {voiceAudioUri ?? "-"}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>voice_volume: {formatVoiceVolume(voiceVolume)}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>voice_delivery: {voiceDeliveryDetail}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
          原生语音输入会把真实麦克风采集交给系统识别生成 transcript；在实时连接已建立时，最终结果会自动发送到当前 speaking session。
        </Text>
        <ButtonRow>
          <PrimaryButton
            label={voiceCaptureActive ? "语音输入中..." : "开始语音输入"}
            onPress={() => void startVoiceCapture()}
            disabled={voiceCaptureActive || !sessionState || !isSocketOpen(socketRef.current) || !speechRecognitionAvailable}
          />
          <SecondaryButton label="停止语音输入" onPress={stopVoiceCapture} disabled={!voiceCaptureActive} />
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
        <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
          原生语音识别会自动填充该字段；如识别结果需要修正，仍可在此手工编辑后重新发送。
        </Text>
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

      <StudyLoopNextStepCard
        visible={sessionState?.status === "ended"}
        currentRoute="/speaking"
        secondaryRoute="/home"
        secondaryLabel="返回首页"
        testIDPrefix="speaking.studyLoopNext"
      />

      {error ? <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{error}</Text> : null}
    </AppScreen>
  );
}
