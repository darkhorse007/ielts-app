import { useEffect, useEffectEvent, useState } from "react";
import { ApiClient, runSpeakingWebSocketSmoke } from "../lib/api-client";
import type { UserProfileResponse } from "../lib/api-types";
import { resolveLearningRouteForPlanTask, selectNextActionablePlanTask } from "../lib/learning-routes";
import {
  clearAllResumeCheckpoints,
  clearResumeCheckpoint,
  loadResumeCheckpoints,
  type ResumeCheckpointSummary
} from "../lib/resume-checkpoints";
import { useAppSession } from "../state/app-session";
import { useAppForegroundEffect } from "./use-app-foreground-effect";

export type HomePlanTaskAction = {
  title: string;
  detail: string;
  route: string;
  actionLabel: string;
};

export const useHomeConsoleController = ({
  studyLoopReady,
  latestStudyLoopUpdatedAt
}: {
  studyLoopReady: boolean;
  latestStudyLoopUpdatedAt: string;
}) => {
  const { defaultInstanceConfig, instanceConfig, session, logout, runWithAuthorizedClient } = useAppSession();
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [profileStatus, setProfileStatus] = useState("等待拉取");
  const [healthStatus, setHealthStatus] = useState("未检查");
  const [socketStatus, setSocketStatus] = useState("未检查");
  const [planTaskAction, setPlanTaskAction] = useState<HomePlanTaskAction | null>(null);
  const [resumeCheckpoints, setResumeCheckpoints] = useState<ResumeCheckpointSummary[]>([]);

  const loadProfile = useEffectEvent(async () => {
    if (!session) {
      setProfile(null);
      setProfileStatus("未登录");
      return;
    }

    setProfileStatus("正在拉取 /v1/users/me/profile");
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) => apiClient.getProfile(accessToken));
      setProfile(response);
      setProfileStatus("已同步");
    } catch (error) {
      setProfileStatus(error instanceof Error ? error.message : "资料获取失败");
    }
  });

  const loadPlanTaskAction = useEffectEvent(async () => {
    if (!session) {
      setPlanTaskAction(null);
      return;
    }

    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) => apiClient.fetchActivePlan(accessToken));
      const nextTask = selectNextActionablePlanTask(response);
      const learningRoute = resolveLearningRouteForPlanTask(nextTask);
      if (!nextTask || !learningRoute) {
        setPlanTaskAction(null);
        return;
      }

      setPlanTaskAction({
        title: "直接进入当前计划任务",
        detail: `当前计划下一步：${nextTask.title}`,
        route: learningRoute.route,
        actionLabel: learningRoute.actionLabel
      });
    } catch {
      setPlanTaskAction(null);
    }
  });

  const loadResumeCheckpoint = useEffectEvent(async () => {
    if (!session) {
      setResumeCheckpoints([]);
      return;
    }

    const nextResumeCheckpoints = await loadResumeCheckpoints(session.userId);
    setResumeCheckpoints(nextResumeCheckpoints);
  });

  const refreshHomeState = useEffectEvent(async () => {
    await Promise.allSettled([loadProfile(), loadPlanTaskAction(), loadResumeCheckpoint()]);
  });

  useEffect(() => {
    void refreshHomeState();
  }, [session]);

  useEffect(() => {
    if (!session || !studyLoopReady || !latestStudyLoopUpdatedAt) {
      return;
    }

    void loadResumeCheckpoint();
  }, [latestStudyLoopUpdatedAt, loadResumeCheckpoint, session, studyLoopReady]);

  useAppForegroundEffect(
    async () => {
      await refreshHomeState();
    },
    {
      enabled: Boolean(session)
    }
  );

  const dismissResumeCheckpoint = async (scope: ResumeCheckpointSummary["scope"]): Promise<void> => {
    if (!session) {
      return;
    }

    await clearResumeCheckpoint(session.userId, scope);
    await loadResumeCheckpoint();
  };

  const dismissAllResumeCheckpoints = async (): Promise<void> => {
    if (!session || resumeCheckpoints.length === 0) {
      return;
    }

    await clearAllResumeCheckpoints(session.userId);
    await loadResumeCheckpoint();
  };

  const checkHealth = async (): Promise<void> => {
    if (!instanceConfig) {
      setHealthStatus("请先配置实例");
      return;
    }

    setHealthStatus("正在检查 /health");
    try {
      const apiClient = new ApiClient(instanceConfig.apiBaseUrl);
      const health = await apiClient.health();
      setHealthStatus(`API 连通: ${health.status}`);
    } catch (error) {
      setHealthStatus(error instanceof Error ? error.message : "API 检查失败");
    }
  };

  const checkSpeakingSocket = async (): Promise<void> => {
    if (!instanceConfig) {
      setSocketStatus("请先配置实例");
      return;
    }

    if (!session) {
      setSocketStatus("请先登录");
      return;
    }

    setSocketStatus("正在创建 session 并连接 WebSocket");
    try {
      const result = await runWithAuthorizedClient(async (apiClient, accessToken) => {
        const sessionResponse = await apiClient.createSpeakingSession(accessToken, {
          topic: "Mobile smoke connection",
          task_type: "core_training"
        });
        if (!sessionResponse.resume_token) {
          throw new Error("服务端未返回 resume_token，无法建立口语 WebSocket smoke");
        }

        try {
          return await runSpeakingWebSocketSmoke({
            wsBaseUrl: instanceConfig.wsBaseUrl,
            sessionId: sessionResponse.session_id,
            resumeToken: sessionResponse.resume_token
          });
        } finally {
          try {
            await apiClient.endSpeakingSession(accessToken, sessionResponse.session_id);
          } catch {
            // Best-effort cleanup for smoke sessions.
          }
        }
      });

      setSocketStatus(`WS 连通: ${result.type} / part ${result.currentPart}`);
    } catch (error) {
      setSocketStatus(error instanceof Error ? error.message : "WS smoke 失败");
    }
  };

  const signOut = async (): Promise<void> => {
    await logout();
  };

  return {
    defaultInstanceConfig,
    instanceConfig,
    session,
    profile,
    profileStatus,
    healthStatus,
    socketStatus,
    planTaskAction,
    resumeCheckpoints,
    loadProfile,
    dismissResumeCheckpoint,
    dismissAllResumeCheckpoints,
    checkHealth,
    checkSpeakingSocket,
    signOut
  };
};
