import { useEffect, useState } from "react";
import type { ApiClient } from "../lib/api-client";
import { resolveLearningRouteForSkill } from "../lib/learning-routes";
import { consumeProgressFollowUp } from "../lib/progress-follow-up";
import { TokenStorage } from "../lib/token-storage";

type ProgressSnapshot = {
  listening_completed: number;
  speaking_completed: number;
  reading_completed: number;
  writing_completed: number;
  total_study_minutes: number;
  streak_days: number;
};

type ProgressFollowUpAction = {
  title: string;
  detail: string;
  route: string;
  actionLabel: string;
  secondaryRoute: string;
  secondaryLabel: string;
};

type ProgressSkill = "listening" | "speaking" | "reading" | "writing";

type ProgressPageProps = {
  apiClient: Pick<ApiClient, "getProgress" | "syncProgress" | "getProgressConflicts">;
  tokenStorage: TokenStorage;
};

const formatSkillLabel = (skill: ProgressSkill): string => {
  switch (skill) {
    case "listening":
      return "听力";
    case "speaking":
      return "口语";
    case "reading":
      return "阅读";
    case "writing":
      return "写作";
    default:
      return skill;
  }
};

const buildPlanFollowUpAction = (detail: string): ProgressFollowUpAction => ({
  title: "回看学习计划",
  detail,
  route: "/plan",
  actionLabel: "回到学习计划",
  secondaryRoute: "/home",
  secondaryLabel: "返回首页"
});

const resolveFollowUpSkill = (
  previousSnapshot: ProgressSnapshot | null,
  nextSnapshot: ProgressSnapshot
): ProgressSkill | null => {
  if (!previousSnapshot) {
    return null;
  }

  const skillDeltas: Array<{ skill: ProgressSkill; delta: number }> = [
    {
      skill: "listening" as const,
      delta: nextSnapshot.listening_completed - previousSnapshot.listening_completed
    },
    {
      skill: "speaking" as const,
      delta: nextSnapshot.speaking_completed - previousSnapshot.speaking_completed
    },
    {
      skill: "reading" as const,
      delta: nextSnapshot.reading_completed - previousSnapshot.reading_completed
    },
    {
      skill: "writing" as const,
      delta: nextSnapshot.writing_completed - previousSnapshot.writing_completed
    }
  ].filter((item) => item.delta > 0);

  if (skillDeltas.length !== 1) {
    return null;
  }

  return skillDeltas[0]?.skill ?? null;
};

const buildTrainingFollowUpAction = (skill: ProgressSkill): ProgressFollowUpAction => {
  const skillLabel = formatSkillLabel(skill);

  return {
    title: `继续${skillLabel}训练`,
    detail: `${skillLabel}进度已写回服务端，下一步可返回训练页继续推进。`,
    route: resolveLearningRouteForSkill(skill),
    actionLabel: `回到${skillLabel}训练`,
    secondaryRoute: "/plan",
    secondaryLabel: "查看学习计划"
  };
};

const buildExplicitFollowUpAction = ({
  title,
  detail,
  route,
  actionLabel
}: {
  title: string;
  detail: string;
  route: string;
  actionLabel: string;
}): ProgressFollowUpAction => ({
  title,
  detail,
  route,
  actionLabel,
  secondaryRoute: "/plan",
  secondaryLabel: "查看学习计划"
});

export const ProgressPage = ({ apiClient, tokenStorage }: ProgressPageProps) => {
  const [listeningCompleted, setListeningCompleted] = useState("0");
  const [speakingCompleted, setSpeakingCompleted] = useState("0");
  const [readingCompleted, setReadingCompleted] = useState("0");
  const [writingCompleted, setWritingCompleted] = useState("0");
  const [totalStudyMinutes, setTotalStudyMinutes] = useState("0");
  const [streakDays, setStreakDays] = useState("0");
  const [conflictCount, setConflictCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState("未同步");
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  const [followUpAction, setFollowUpAction] = useState<ProgressFollowUpAction>(
    buildPlanFollowUpAction("先同步最新进度，再回计划页继续当前主线。")
  );
  const [error, setError] = useState<string | null>(null);

  const applySnapshot = (snapshot: ProgressSnapshot): void => {
    setListeningCompleted(String(snapshot.listening_completed));
    setSpeakingCompleted(String(snapshot.speaking_completed));
    setReadingCompleted(String(snapshot.reading_completed));
    setWritingCompleted(String(snapshot.writing_completed));
    setTotalStudyMinutes(String(snapshot.total_study_minutes));
    setStreakDays(String(snapshot.streak_days));
  };

  const load = async (): Promise<void> => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      setError("会话已失效，请重新登录");
      return;
    }

    try {
      const snapshot = await apiClient.getProgress(accessToken);
      applySnapshot(snapshot);
      setSnapshot(snapshot);
      setStatusMessage("已加载服务端进度");
      setFollowUpAction(buildPlanFollowUpAction("已加载当前服务端进度，下一步可回计划页继续主线。"));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载失败");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const sync = async (): Promise<void> => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      setError("会话已失效，请重新登录");
      return;
    }

    setError(null);
    try {
      const previousSnapshot = snapshot;
      const response = await apiClient.syncProgress(accessToken, {
        device_id: "web-client",
        client_updated_at: new Date().toISOString(),
        progress: {
          listening_completed: Number(listeningCompleted) || 0,
          speaking_completed: Number(speakingCompleted) || 0,
          reading_completed: Number(readingCompleted) || 0,
          writing_completed: Number(writingCompleted) || 0,
          total_study_minutes: Number(totalStudyMinutes) || 0,
          streak_days: Number(streakDays) || 0
        }
      });

      applySnapshot(response);
      setSnapshot(response);
      const conflicts = await apiClient.getProgressConflicts(accessToken);
      setConflictCount(conflicts.items.length);
      setStatusMessage(response.stale_request ? "同步请求为旧版本，使用服务端数据" : "同步成功");
      if (response.stale_request) {
        setFollowUpAction(buildPlanFollowUpAction("服务端进度已覆盖本地修改，下一步先回计划页核对当前任务。"));
        return;
      }

      if (conflicts.items.length > 0) {
        setFollowUpAction(
          buildPlanFollowUpAction(`检测到 ${conflicts.items.length} 条进度冲突，下一步先回计划页确认主线任务。`)
        );
        return;
      }

      const userId = tokenStorage.getUserId();
      const explicitFollowUp = userId ? consumeProgressFollowUp(userId) : null;
      if (explicitFollowUp) {
        setFollowUpAction(buildExplicitFollowUpAction(explicitFollowUp));
        return;
      }

      const followUpSkill = resolveFollowUpSkill(previousSnapshot, response);
      if (followUpSkill) {
        setFollowUpAction(buildTrainingFollowUpAction(followUpSkill));
      } else {
        setFollowUpAction(buildPlanFollowUpAction("进度已同步，下一步回计划页查看是否需要调整任务。"));
      }
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "同步失败");
    }
  };

  return (
    <section>
      <h1>学习进度同步</h1>
      {error ? <p role="alert">{error}</p> : null}

      <label htmlFor="progress-listening">听力完成数</label>
      <input
        id="progress-listening"
        value={listeningCompleted}
        onChange={(event) => setListeningCompleted(event.target.value)}
      />

      <label htmlFor="progress-speaking">口语完成数</label>
      <input
        id="progress-speaking"
        value={speakingCompleted}
        onChange={(event) => setSpeakingCompleted(event.target.value)}
      />

      <label htmlFor="progress-reading">阅读完成数</label>
      <input
        id="progress-reading"
        value={readingCompleted}
        onChange={(event) => setReadingCompleted(event.target.value)}
      />

      <label htmlFor="progress-writing">写作完成数</label>
      <input
        id="progress-writing"
        value={writingCompleted}
        onChange={(event) => setWritingCompleted(event.target.value)}
      />

      <label htmlFor="progress-minutes">总学习分钟数</label>
      <input
        id="progress-minutes"
        value={totalStudyMinutes}
        onChange={(event) => setTotalStudyMinutes(event.target.value)}
      />

      <label htmlFor="progress-streak">连续学习天数</label>
      <input
        id="progress-streak"
        value={streakDays}
        onChange={(event) => setStreakDays(event.target.value)}
      />

      <button type="button" onClick={sync}>
        同步进度
      </button>

      <p>status: {statusMessage}</p>
      <p>conflicts: {conflictCount}</p>

      <section>
        <h2>{followUpAction.title}</h2>
        <p>{followUpAction.detail}</p>
        <p>
          <a href={followUpAction.route}>{followUpAction.actionLabel}</a> |{" "}
          <a href={followUpAction.secondaryRoute}>{followUpAction.secondaryLabel}</a>
        </p>
      </section>
    </section>
  );
};
