import { Redirect, router } from "expo-router";
import { setAudioModeAsync, setIsAudioActiveAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import coreSegment0 from "../assets/audio/listening/core/segment-0.m4a";
import coreSegment1 from "../assets/audio/listening/core/segment-1.m4a";
import coreSegment2 from "../assets/audio/listening/core/segment-2.m4a";
import coreSegment3 from "../assets/audio/listening/core/segment-3.m4a";
import dictationSegment0 from "../assets/audio/listening/dictation/segment-0.m4a";
import dictationSegment1 from "../assets/audio/listening/dictation/segment-1.m4a";
import dictationSegment2 from "../assets/audio/listening/dictation/segment-2.m4a";
import dictationSegment3 from "../assets/audio/listening/dictation/segment-3.m4a";
import { ApiNetworkError, ApiRequestError } from "../src/lib/api-client";
import { trackMobileAnalyticsEvent } from "../src/lib/analytics";
import type { PlaybackStateResponse, PracticeSessionResponse } from "../src/lib/api-types";
import { useAppForegroundEffect } from "../src/hooks/use-app-foreground-effect";
import { buildScopedStorageKey, clearStoredJson, loadStoredJson, saveStoredJson } from "../src/lib/storage";
import { useAppSession } from "../src/state/app-session";
import { useStudyLoop } from "../src/state/study-loop";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, StatusPill, TextField } from "../src/ui/primitives";
import { StudyLoopNextStepCard } from "../src/ui/study-loop-next-step-card";
import { colors, radii, spacing } from "../src/ui/theme";

type ListeningTaskType = "core_training" | "dictation";
type ListeningSnapshot = {
  version: 1;
  taskType: ListeningTaskType;
  session: PracticeSessionResponse | null;
  answers: Record<string, string>;
  playbackRate: string;
  segmentIndex: string;
  positionSeconds: string;
  replayWrongOnly: boolean;
  queueCount: number;
  lastPlaybackSnapshot: PlaybackStateResponse | null;
  updatedAt: string;
};

const defaultTaskType: ListeningTaskType = "core_training";
const defaultPlaybackRate = "1";
const defaultSegmentIndex = "0";
const defaultPositionSeconds = "0";
const listeningSegmentSources: Record<ListeningTaskType, [string | number, string | number, string | number, string | number]> = {
  core_training: [coreSegment0, coreSegment1, coreSegment2, coreSegment3],
  dictation: [dictationSegment0, dictationSegment1, dictationSegment2, dictationSegment3]
};

const isDefaultListeningSnapshot = (snapshot: ListeningSnapshot): boolean =>
  snapshot.taskType === defaultTaskType &&
  snapshot.session === null &&
  Object.keys(snapshot.answers).length === 0 &&
  snapshot.playbackRate === defaultPlaybackRate &&
  snapshot.segmentIndex === defaultSegmentIndex &&
  snapshot.positionSeconds === defaultPositionSeconds &&
  snapshot.replayWrongOnly === false &&
  snapshot.queueCount === 0 &&
  snapshot.lastPlaybackSnapshot === null;

const formatCheckpointTime = (value: string): string =>
  new Date(value).toLocaleTimeString("zh-CN", {
    hour12: false
  });

const listeningTaskOptions: Array<{
  value: ListeningTaskType;
  label: string;
  description: string;
}> = [
  {
    value: "core_training",
    label: "核心题型",
    description: "用于常规听力题训练与提交评分"
  },
  {
    value: "dictation",
    label: "句级听写",
    description: "用于句级听写与拼写纠错反馈"
  }
];

const asNumber = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const applyPlaybackState = (
  playback: PlaybackStateResponse,
  setPlaybackRate: (value: string) => void,
  setSegmentIndex: (value: string) => void,
  setPositionSeconds: (value: string) => void,
  setReplayWrongOnly: (value: boolean) => void
): void => {
  setPlaybackRate(String(playback.playback_rate));
  setSegmentIndex(String(playback.segment_index));
  setPositionSeconds(String(playback.position_seconds));
  setReplayWrongOnly(playback.replay_wrong_only);
};

const renderQuestionLabel = (question: PracticeSessionResponse["questions"][number]): string =>
  question.audio_segment_index === undefined
    ? `[${question.type}] ${question.prompt}`
    : `[${question.type}] S${question.audio_segment_index} · ${question.prompt}`;

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

const clampSegmentIndex = (value: number, maxIndex: number): number => Math.min(Math.max(Math.trunc(value), 0), Math.max(maxIndex, 0));

const clampPlaybackRateForPlayer = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(Math.max(value, 0.5), 2);
};

const formatPlaybackInput = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

const formatPlaybackProgress = (value: number): string => `${formatPlaybackInput(value)}s`;

const toNativePlayerStatusLabel = (status: {
  isLoaded: boolean;
  isBuffering: boolean;
  didJustFinish: boolean;
  playing: boolean;
  currentTime: number;
}): string => {
  if (!status.isLoaded) {
    return "未装载";
  }

  if (status.isBuffering) {
    return "缓冲中";
  }

  if (status.didJustFinish) {
    return "已播完";
  }

  if (status.playing) {
    return "播放中";
  }

  if (status.currentTime > 0) {
    return "已暂停";
  }

  return "待播放";
};

type ListeningRetryAction =
  | "create_session"
  | "submit"
  | "save_playback"
  | "load_playback"
  | "add_retry_queue";

const formatListeningRetryActionLabel = (value: ListeningRetryAction): string => {
  switch (value) {
    case "create_session":
      return "创建训练";
    case "submit":
      return "提交答案";
    case "save_playback":
      return "保存播放状态";
    case "load_playback":
      return "加载播放状态";
    case "add_retry_queue":
      return "加入重练队列";
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

export default function ListeningScreen() {
  const { session: authSession, runWithAuthorizedClient } = useAppSession();
  const { recordActivity } = useStudyLoop();
  const snapshotSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSnapshotPersistRef = useRef(false);
  const playbackResumeRef = useRef(false);
  const playerCurrentTimeRef = useRef(0);
  const playerPlayingRef = useRef(false);
  const [taskType, setTaskType] = useState<ListeningTaskType>(defaultTaskType);
  const [session, setSession] = useState<PracticeSessionResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState("未开始");
  const [checkpointStatus, setCheckpointStatus] = useState("本地会话未恢复");
  const [checkpointReady, setCheckpointReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverSyncDetail, setServerSyncDetail] = useState("-");
  const [serverSyncAt, setServerSyncAt] = useState<string | null>(null);
  const [lastFailedAction, setLastFailedAction] = useState<ListeningRetryAction | null>(null);
  const [playbackRate, setPlaybackRate] = useState(defaultPlaybackRate);
  const [segmentIndex, setSegmentIndex] = useState(defaultSegmentIndex);
  const [positionSeconds, setPositionSeconds] = useState(defaultPositionSeconds);
  const [replayWrongOnly, setReplayWrongOnly] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [lastPlaybackSnapshot, setLastPlaybackSnapshot] = useState<PlaybackStateResponse | null>(null);
  const activeListeningTaskType: ListeningTaskType = session?.task_type === "dictation" ? "dictation" : taskType;
  const bundleSegmentMaxIndex = listeningSegmentSources[activeListeningTaskType].length - 1;
  const maxSessionSegmentIndex = session
    ? session.questions.reduce((current, question) => Math.max(current, question.audio_segment_index ?? 0), 0)
    : bundleSegmentMaxIndex;
  const maxPlayableSegmentIndex = Math.max(maxSessionSegmentIndex, bundleSegmentMaxIndex);
  const resolvedSegmentIndex = clampSegmentIndex(asNumber(segmentIndex, 0), maxPlayableSegmentIndex);
  const currentSegmentSource = session ? listeningSegmentSources[activeListeningTaskType][resolvedSegmentIndex] : null;
  const currentSegmentQuestion =
    session?.questions.find((question) => (question.audio_segment_index ?? 0) === resolvedSegmentIndex) ?? null;
  const player = useAudioPlayer(null, {
    updateInterval: 250,
    keepAudioSessionActive: true
  });
  const nativePlaybackStatus = useAudioPlayerStatus(player);
  const snapshotStorageKey = authSession ? buildScopedStorageKey("listening", "draft", "v1", authSession.userId) : null;

  const markSyncSuccess = (statusText: string, detail: string): void => {
    setStatusMessage(statusText);
    setServerSyncDetail(detail);
    setServerSyncAt(new Date().toISOString());
    setLastFailedAction(null);
  };

  const markSyncFailure = (action: ListeningRetryAction, detail: string): void => {
    setStatusMessage(`${formatListeningRetryActionLabel(action)}失败`);
    setServerSyncDetail(detail);
    setServerSyncAt(new Date().toISOString());
    setLastFailedAction(action);
  };

  const resetSnapshotState = (): void => {
    setTaskType(defaultTaskType);
    setSession(null);
    setAnswers({});
    setStatusMessage("未开始");
    setServerSyncDetail("-");
    setServerSyncAt(null);
    setLastFailedAction(null);
    setCheckpointStatus("本地会话未恢复");
    setError(null);
    setPlaybackRate(defaultPlaybackRate);
    setSegmentIndex(defaultSegmentIndex);
    setPositionSeconds(defaultPositionSeconds);
    setReplayWrongOnly(false);
    setQueueCount(0);
    setLastPlaybackSnapshot(null);
  };

  const persistSnapshot = useEffectEvent(async (snapshot: ListeningSnapshot) => {
    if (!snapshotStorageKey) {
      return;
    }

    if (isDefaultListeningSnapshot(snapshot)) {
      await clearStoredJson(snapshotStorageKey);
      setCheckpointStatus("已启用自动保存");
      return;
    }

    await saveStoredJson(snapshotStorageKey, snapshot);
    setCheckpointStatus(`已自动保存 ${formatCheckpointTime(snapshot.updatedAt)}`);
  });

  useEffect(() => {
    let cancelled = false;

    resetSnapshotState();
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
      const snapshot = await loadStoredJson<ListeningSnapshot>(snapshotStorageKey);
      if (cancelled) {
        return;
      }

      if (snapshot?.version === 1) {
        setTaskType(snapshot.taskType);
        setSession(snapshot.session);
        setAnswers(snapshot.answers);
        setPlaybackRate(snapshot.playbackRate);
        setSegmentIndex(snapshot.segmentIndex);
        setPositionSeconds(snapshot.positionSeconds);
        setReplayWrongOnly(snapshot.replayWrongOnly);
        setQueueCount(snapshot.queueCount);
        setLastPlaybackSnapshot(snapshot.lastPlaybackSnapshot);
        setStatusMessage(snapshot.session ? "已恢复本地听力会话" : "未开始");
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

  useEffect(() => {
    if (!checkpointReady) {
      return;
    }

    if (skipNextSnapshotPersistRef.current) {
      skipNextSnapshotPersistRef.current = false;
      return;
    }

    const snapshot: ListeningSnapshot = {
      version: 1,
      taskType,
      session,
      answers,
      playbackRate,
      segmentIndex,
      positionSeconds,
      replayWrongOnly,
      queueCount,
      lastPlaybackSnapshot,
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
    answers,
    checkpointReady,
    lastPlaybackSnapshot,
    persistSnapshot,
    playbackRate,
    positionSeconds,
    queueCount,
    replayWrongOnly,
    segmentIndex,
    session,
    taskType
  ]);

  useEffect(() => {
    playerCurrentTimeRef.current = nativePlaybackStatus.currentTime;
    playerPlayingRef.current = nativePlaybackStatus.playing;
  }, [nativePlaybackStatus.currentTime, nativePlaybackStatus.playing]);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false
    }).catch(() => undefined);

    return () => {
      try {
        player.pause();
      } catch {
        // Best-effort cleanup only.
      }
      void setIsAudioActiveAsync(false).catch(() => undefined);
    };
  }, [player]);

  useEffect(() => {
    if (!currentSegmentSource) {
      return;
    }

    try {
      player.pause();
      player.replace(currentSegmentSource);
      player.setPlaybackRate(clampPlaybackRateForPlayer(asNumber(playbackRate, 1)));
    } catch {
      // Best-effort source replacement only.
    }

    void player.seekTo(Math.max(0, asNumber(positionSeconds, 0))).catch(() => undefined);
  }, [currentSegmentSource, player]);

  useEffect(() => {
    try {
      player.setPlaybackRate(clampPlaybackRateForPlayer(asNumber(playbackRate, 1)));
    } catch {
      // Best-effort rate sync only.
    }
  }, [player, playbackRate]);

  useEffect(() => {
    if (!nativePlaybackStatus.didJustFinish) {
      return;
    }

    setPositionSeconds(formatPlaybackInput(nativePlaybackStatus.duration));
    setStatusMessage("当前音频段播放完成");
  }, [nativePlaybackStatus.didJustFinish, nativePlaybackStatus.duration]);

  useEffect(() => {
    if (!nativePlaybackStatus.mediaServicesDidReset) {
      return;
    }

    setError("系统音频服务已重置，请重新加载当前段后再播放");
  }, [nativePlaybackStatus.mediaServicesDidReset]);

  useEffect(() => {
    let currentState = AppState.currentState ?? "active";

    const subscription = AppState.addEventListener("change", (nextState) => {
      const movedToBackground = currentState === "active" && nextState !== "active";
      currentState = nextState;

      if (!movedToBackground) {
        return;
      }

      if (playerPlayingRef.current) {
        playbackResumeRef.current = true;
        try {
          player.pause();
        } catch {
          // Best-effort pause only.
        }
        setPositionSeconds(formatPlaybackInput(playerCurrentTimeRef.current));
        setStatusMessage("应用切到后台，已暂停真实播放器");
      }

      void setIsAudioActiveAsync(false).catch(() => undefined);
    });

    return () => {
      subscription.remove();
    };
  }, [player]);

  const updateAnswer = (questionId: string, value: string): void => {
    setAnswers((current) => ({
      ...current,
      [questionId]: value
    }));
  };

  const playCurrentSegment = async (): Promise<void> => {
    if (!session || !currentSegmentSource) {
      setError("请先创建听力训练");
      return;
    }

    const requestedPosition = Math.max(0, asNumber(positionSeconds, playerCurrentTimeRef.current));

    try {
      await setIsAudioActiveAsync(true);
      await player.seekTo(requestedPosition);
      player.setPlaybackRate(clampPlaybackRateForPlayer(asNumber(playbackRate, 1)));
      player.play();
      playbackResumeRef.current = false;
      setStatusMessage("真实播放器已开始播放");
      setError(null);
    } catch (playError) {
      setError(playError instanceof Error ? playError.message : "启动真实播放器失败");
    }
  };

  const pauseCurrentSegment = (): void => {
    try {
      player.pause();
      setPositionSeconds(formatPlaybackInput(playerCurrentTimeRef.current));
      setStatusMessage("真实播放器已暂停");
      setError(null);
    } catch (pauseError) {
      setError(pauseError instanceof Error ? pauseError.message : "暂停真实播放器失败");
    }
  };

  const seekCurrentSegment = async (): Promise<void> => {
    if (!session) {
      setError("请先创建听力训练");
      return;
    }

    const requestedPosition = Math.max(0, asNumber(positionSeconds, 0));

    try {
      await player.seekTo(requestedPosition);
      setPositionSeconds(formatPlaybackInput(requestedPosition));
      setStatusMessage("已定位到指定播放位置");
      setError(null);
    } catch (seekError) {
      setError(seekError instanceof Error ? seekError.message : "定位播放位置失败");
    }
  };

  const jumpSegment = (direction: -1 | 1): void => {
    if (!session) {
      setError("请先创建听力训练");
      return;
    }

    const nextSegmentIndex = clampSegmentIndex(resolvedSegmentIndex + direction, maxPlayableSegmentIndex);
    setSegmentIndex(String(nextSegmentIndex));
    setPositionSeconds("0");
    setStatusMessage(`已切换到音频段 S${nextSegmentIndex}`);
    setError(null);
  };

  const syncPlayerProgressToDraft = (): void => {
    setPositionSeconds(formatPlaybackInput(playerCurrentTimeRef.current));
    setStatusMessage("已同步真实播放器进度");
    setError(null);
  };

  const createSession = async (): Promise<void> => {
    try {
      player.pause();
    } catch {
      // Best-effort cleanup only.
    }

    setLoading(true);
    try {
      setStatusMessage("正在创建听力训练");
      setServerSyncDetail(`task_type ${taskType}`);
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.createPracticeSession(accessToken, {
          skill: "listening",
          task_type: taskType
        })
      );

      setSession(response);
      setAnswers({});
      setQueueCount(0);
      setLastPlaybackSnapshot(null);
      setPlaybackRate("1");
      setSegmentIndex("0");
      setPositionSeconds("0");
      setReplayWrongOnly(false);
      playbackResumeRef.current = false;
      markSyncSuccess(
        response.task_type === "dictation"
          ? `已创建听写训练，句量 ${response.questions.length}`
          : `已创建听力训练，题量 ${response.questions.length}`,
        `session ${response.session_id} / task_type ${response.task_type} / question_count ${response.questions.length}`
      );
      setError(null);
    } catch (createError) {
      const message = toRequestErrorMessage(createError, "创建听力训练失败");
      markSyncFailure("create_session", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const submit = async (): Promise<void> => {
    if (!session) {
      setError("请先创建听力训练");
      return;
    }

    setLoading(true);
    try {
      setStatusMessage("正在提交听力答案");
      setServerSyncDetail(`session ${session.session_id} / answer_count ${session.questions.length}`);
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.submitPracticeSession(
          accessToken,
          session.session_id,
          session.questions.map((question) => ({
            question_id: question.question_id,
            answer: answers[question.question_id] ?? ""
          }))
        )
      );

      setSession(response);
      recordActivity({
        skill: "listening",
        source: "practice_submission",
        title: "听力训练已提交",
        summary: `听力提交 ${response.submission?.score_breakdown.correct_count ?? 0}/${response.submission?.score_breakdown.total_questions ?? 0}，accuracy ${Math.round((response.submission?.score_breakdown.accuracy ?? 0) * 100)}%`,
        route: "/listening"
      });
      void trackMobileAnalyticsEvent(runWithAuthorizedClient, {
        eventType: "practice_submitted",
        skill: "listening",
        createdAt: response.submission?.submitted_at,
        metadata: {
          sessionId: response.session_id,
          taskType: response.task_type,
          questionCount: response.questions.length,
          correctCount: response.submission?.score_breakdown.correct_count ?? 0,
          totalQuestions: response.submission?.score_breakdown.total_questions ?? 0,
          accuracy: response.submission?.score_breakdown.accuracy ?? 0
        }
      });
      markSyncSuccess(
        `提交完成，正确 ${response.submission?.score_breakdown.correct_count ?? 0}/${response.submission?.score_breakdown.total_questions ?? 0}`,
        `session ${response.session_id} / accuracy ${Math.round((response.submission?.score_breakdown.accuracy ?? 0) * 100)}%`
      );
      setError(null);
    } catch (submitError) {
      const message = toRequestErrorMessage(submitError, "提交听力答案失败");
      markSyncFailure("submit", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const savePlayback = async (): Promise<void> => {
    if (!session) {
      setError("请先创建听力训练");
      return;
    }

    const effectiveSegmentIndex = resolvedSegmentIndex;
    const effectivePositionSeconds = playerPlayingRef.current ? playerCurrentTimeRef.current : Math.max(0, asNumber(positionSeconds, 0));

    setSegmentIndex(String(effectiveSegmentIndex));
    setPositionSeconds(formatPlaybackInput(effectivePositionSeconds));
    setLoading(true);
    try {
      setStatusMessage("正在保存播放状态");
      setServerSyncDetail(`session ${session.session_id} / segment ${effectiveSegmentIndex} / position ${formatPlaybackProgress(effectivePositionSeconds)}`);
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.updatePlaybackState(accessToken, session.session_id, {
          playback_rate: asNumber(playbackRate, 1),
          segment_index: effectiveSegmentIndex,
          position_seconds: effectivePositionSeconds,
          replay_wrong_only: replayWrongOnly
        })
      );

      applyPlaybackState(response, setPlaybackRate, setSegmentIndex, setPositionSeconds, setReplayWrongOnly);
      setLastPlaybackSnapshot(response);
      markSyncSuccess(
        response.recovered ? "播放状态已恢复到安全值" : "播放状态已保存",
        `playback_rate ${response.playback_rate} / segment ${response.segment_index} / recovered ${response.recovered ? "yes" : "no"}`
      );
      setError(null);
    } catch (playbackError) {
      const message = toRequestErrorMessage(playbackError, "保存播放状态失败");
      markSyncFailure("save_playback", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const loadPlayback = async (options?: { skipLoading?: boolean; restoreForeground?: boolean }): Promise<PlaybackStateResponse | null> => {
    if (!session) {
      setError("请先创建听力训练");
      return null;
    }

    if (!options?.skipLoading) {
      setLoading(true);
    }
    try {
      setStatusMessage(options?.restoreForeground ? "正在恢复播放状态" : "正在加载播放状态");
      setServerSyncDetail(`session ${session.session_id}`);
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getPlaybackState(accessToken, session.session_id)
      );

      applyPlaybackState(response, setPlaybackRate, setSegmentIndex, setPositionSeconds, setReplayWrongOnly);
      setLastPlaybackSnapshot(response);
      markSyncSuccess(
        response.recovered
          ? options?.restoreForeground
            ? "前台恢复后已恢复播放状态"
            : "已加载并恢复播放状态"
          : options?.restoreForeground
            ? "前台恢复后已同步播放状态"
            : "已加载播放状态",
        `playback_rate ${response.playback_rate} / segment ${response.segment_index} / recovered ${response.recovered ? "yes" : "no"}`
      );
      setError(null);
      return response;
    } catch (loadError) {
      const message = toRequestErrorMessage(loadError, "加载播放状态失败");
      markSyncFailure("load_playback", message);
      setError(message);
      return null;
    } finally {
      if (!options?.skipLoading) {
        setLoading(false);
      }
    }
  };

  const addRetryQueue = async (): Promise<void> => {
    if (!session?.submission) {
      setError("请先提交一次听力训练");
      return;
    }

    setLoading(true);
    try {
      setStatusMessage("正在加入重练队列");
      setServerSyncDetail(`session ${session.session_id}`);
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.addRetryQueue(accessToken, session.session_id)
      );
      setQueueCount(response.items.length);
      markSyncSuccess(
        `已加入重练队列 ${response.items.length} 题`,
        `session ${session.session_id} / retry_items ${response.items.length}`
      );
      setError(null);
    } catch (queueError) {
      const message = toRequestErrorMessage(queueError, "加入重练队列失败");
      markSyncFailure("add_retry_queue", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const clearLocalCheckpoint = async (): Promise<void> => {
    if (snapshotSaveTimeoutRef.current) {
      clearTimeout(snapshotSaveTimeoutRef.current);
      snapshotSaveTimeoutRef.current = null;
    }

    if (snapshotStorageKey) {
      await clearStoredJson(snapshotStorageKey);
    }
    try {
      player.pause();
    } catch {
      // Best-effort cleanup only.
    }
    playbackResumeRef.current = false;
    skipNextSnapshotPersistRef.current = true;
    resetSnapshotState();
    setCheckpointReady(true);
    setCheckpointStatus("本地会话已清空");
    setStatusMessage("已清空本地听力会话");
  };

  const retryLastFailedAction = async (): Promise<void> => {
    switch (lastFailedAction) {
      case "create_session":
        await createSession();
        break;
      case "submit":
        await submit();
        break;
      case "save_playback":
        await savePlayback();
        break;
      case "load_playback":
        await loadPlayback();
        break;
      case "add_retry_queue":
        await addRetryQueue();
        break;
      default:
        break;
    }
  };

  useAppForegroundEffect(
    async () => {
      if (loading || !session?.session_id) {
        return;
      }

      void setIsAudioActiveAsync(true).catch(() => undefined);
      const response = await loadPlayback({
        restoreForeground: true,
        skipLoading: true
      });
      if (playbackResumeRef.current && response) {
        setStatusMessage("已恢复最近播放状态，可继续播放");
      }
      playbackResumeRef.current = false;
    },
    {
      enabled: Boolean(session?.session_id)
    }
  );

  if (!authSession) {
    return <Redirect href="/login" />;
  }

  return (
    <AppScreen
      eyebrow="Listening"
      title="听力训练已进入移动端"
      subtitle="当前已接上 listening session、原生音频播放器、播放状态保存/恢复，以及错题加入 retry queue。句级听写也会回显拼写与 chunk 级反馈。"
    >
      <InfoCard tone="accent">
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>训练形态</Text>
        <View style={{ gap: 10 }}>
          {listeningTaskOptions.map((option) => {
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
        <ButtonRow>
          <PrimaryButton label={loading ? "处理中..." : "创建训练"} onPress={() => void createSession()} disabled={loading} />
          <SecondaryButton label="返回首页" onPress={() => router.replace("/home")} disabled={loading} />
        </ButtonRow>
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>当前 session</Text>
        <ButtonRow>
          <StatusPill label={session?.status ?? "未创建"} tone={session ? "success" : "neutral"} />
          <StatusPill label={statusMessage} tone={session ? "accent" : "neutral"} />
        </ButtonRow>
        <View style={{ gap: 6, marginTop: 10 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>session_id: {session?.session_id ?? "-"}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>task_type: {session?.task_type ?? taskType}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>question_count: {session?.questions.length ?? 0}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>retry_queue_count: {queueCount}</Text>
        </View>
      </InfoCard>

      <InfoCard tone={lastFailedAction ? "accent" : "default"}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>服务端同步</Text>
        <ButtonRow>
          <StatusPill
            label={statusMessage}
            tone={lastFailedAction ? "accent" : serverSyncAt ? "success" : "neutral"}
          />
          <StatusPill
            label={lastFailedAction ? `待重试 ${formatListeningRetryActionLabel(lastFailedAction)}` : "链路已就绪"}
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
              testID="listening.retryLastFailedAction"
            />
          </ButtonRow>
        ) : null}
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>本地会话恢复</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>checkpoint_status: {checkpointStatus}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          restore_target: {session?.session_id ? `session ${session.session_id}` : "当前尚无本地听力 checkpoint"}
        </Text>
        <ButtonRow>
          <PrimaryButton label="加载播放状态" onPress={() => void loadPlayback()} disabled={loading || !session} />
          <SecondaryButton label="清空本地会话" onPress={() => void clearLocalCheckpoint()} disabled={loading || !checkpointReady} />
        </ButtonRow>
      </InfoCard>

      {session ? (
        <InfoCard>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>答题区</Text>
          <View style={{ gap: 14 }}>
            {session.questions.map((question) => (
              <View key={question.question_id} style={{ gap: 8 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700", lineHeight: 22 }}>
                  {renderQuestionLabel(question)}
                </Text>
                {question.options?.length ? (
                  <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                    options: {question.options.join(" / ")}
                  </Text>
                ) : null}
                <TextField
                  label={`答案 ${question.question_id.slice(0, 8)}`}
                  value={answers[question.question_id] ?? ""}
                  onChangeText={(value) => updateAnswer(question.question_id, value)}
                  placeholder="输入答案"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>
            ))}
          </View>
          <ButtonRow>
            <PrimaryButton label={loading ? "处理中..." : "提交答案"} onPress={() => void submit()} disabled={loading} />
            <SecondaryButton
              label="加入重练队列"
              onPress={() => void addRetryQueue()}
              disabled={loading || !session.submission}
            />
          </ButtonRow>
        </InfoCard>
      ) : null}

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>播放状态</Text>
        <ButtonRow>
          <StatusPill label={toNativePlayerStatusLabel(nativePlaybackStatus)} tone={nativePlaybackStatus.playing ? "success" : "neutral"} />
          <StatusPill label={`S${resolvedSegmentIndex}`} tone={session ? "accent" : "neutral"} />
        </ButtonRow>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>
          native_current_time: {formatPlaybackProgress(nativePlaybackStatus.currentTime)}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          native_duration: {formatPlaybackProgress(nativePlaybackStatus.duration)}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          native_playback_rate: {nativePlaybackStatus.playbackRate.toFixed(2)}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
          segment_prompt: {currentSegmentQuestion?.prompt ?? "当前 session 尚未装载可播放段落"}
        </Text>
        <TextField
          label="播放倍速"
          value={playbackRate}
          onChangeText={setPlaybackRate}
          placeholder="1"
          keyboardType="decimal-pad"
        />
        <TextField
          label="句段索引"
          value={segmentIndex}
          onChangeText={setSegmentIndex}
          placeholder="0"
          keyboardType="number-pad"
        />
        <TextField
          label="播放位置（秒）"
          value={positionSeconds}
          onChangeText={setPositionSeconds}
          placeholder="0"
          keyboardType="decimal-pad"
        />
        <Pressable
          onPress={() => setReplayWrongOnly((current) => !current)}
          style={{
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: replayWrongOnly ? colors.cardAccentBorder : colors.cardBorder,
            backgroundColor: replayWrongOnly ? colors.cardAccent : colors.card,
            padding: spacing.md
          }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>
            {replayWrongOnly ? "仅重听错题: 开" : "仅重听错题: 关"}
          </Text>
        </Pressable>
        <ButtonRow>
          <PrimaryButton label={nativePlaybackStatus.playing ? "播放中..." : "播放当前段"} onPress={() => void playCurrentSegment()} disabled={loading || !session} />
          <SecondaryButton label="暂停播放" onPress={pauseCurrentSegment} disabled={!session || !nativePlaybackStatus.playing} />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton label="定位到当前输入位置" onPress={() => void seekCurrentSegment()} disabled={loading || !session} />
          <SecondaryButton label="同步当前进度" onPress={syncPlayerProgressToDraft} disabled={!session} />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton label="上一段" onPress={() => jumpSegment(-1)} disabled={!session || resolvedSegmentIndex <= 0} />
          <SecondaryButton
            label="下一段"
            onPress={() => jumpSegment(1)}
            disabled={!session || resolvedSegmentIndex >= maxPlayableSegmentIndex}
          />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton label="保存播放状态" onPress={() => void savePlayback()} disabled={loading || !session} />
          <SecondaryButton label="加载播放状态" onPress={() => void loadPlayback()} disabled={loading || !session} />
        </ButtonRow>
        <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
          真实播放器会使用移动端内置 listening 样例音频；切到后台时会暂停播放，并在回前台时拉取最近一次 playback 状态用于继续学习。
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          last_replayed_question_id: {lastPlaybackSnapshot?.last_replayed_question_id ?? "-"}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          last_recovered_at: {lastPlaybackSnapshot?.last_recovered_at ?? "-"}
        </Text>
      </InfoCard>

      {error ? <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{error}</Text> : null}

      {session?.submission ? (
        <InfoCard>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>提交结果</Text>
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700" }}>
            正确 {session.submission.score_breakdown.correct_count}/{session.submission.score_breakdown.total_questions}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            accuracy: {Math.round(session.submission.score_breakdown.accuracy * 100)}%
          </Text>
          <View style={{ gap: 10, marginTop: 8 }}>
            {session.submission.question_results.map((item) => (
              <View
                key={item.question_id}
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
                  {item.is_correct ? "正确" : "需回看"} · {item.question_id.slice(0, 8)}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>你的答案: {item.user_answer || "-"}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>正确答案: {item.correct_answer}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                  explanation: {item.explanation}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  error_tags: {item.error_tags.length ? item.error_tags.join(", ") : "-"}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  actions: {item.improvement_actions.length ? item.improvement_actions.join(", ") : "-"}
                </Text>
                {item.dictation_feedback ? (
                  <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                    dictation: spelling {item.dictation_feedback.spelling_mismatches.length} · missing{" "}
                    {item.dictation_feedback.missing_chunks.length} · extra {item.dictation_feedback.extra_chunks.length}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </InfoCard>
      ) : null}

      {session?.submission?.dictation_summary ? (
        <InfoCard tone="accent">
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>听写摘要</Text>
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>
            sentence_count: {session.submission.dictation_summary.total_sentences}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
            spelling_top:
            {session.submission.dictation_summary.high_frequency_spelling_errors.length
              ? ` ${session.submission.dictation_summary.high_frequency_spelling_errors
                  .map((item) => `${item.token}(${item.count})`)
                  .join(", ")}`
              : " -"}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
            chunk_top:
            {session.submission.dictation_summary.high_frequency_chunk_errors.length
              ? ` ${session.submission.dictation_summary.high_frequency_chunk_errors
                  .map((item) => `${item.chunk}(${item.count})`)
                  .join(", ")}`
              : " -"}
          </Text>
        </InfoCard>
      ) : null}

      <StudyLoopNextStepCard
        visible={Boolean(session?.submission)}
        currentRoute="/listening"
        secondaryRoute="/home"
        secondaryLabel="返回首页"
        testIDPrefix="listening.studyLoopNext"
      />
    </AppScreen>
  );
}
