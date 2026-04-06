import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { buildScopedStorageKey, clearStoredJson, loadStoredJson, saveStoredJson } from "../lib/storage";
import { useAppSession } from "./app-session";

export type StudyLoopSkill = "listening" | "reading" | "writing" | "speaking" | "mock_exam" | "diagnostic";
export type StudyLoopSource =
  | "practice_submission"
  | "writing_evaluation"
  | "writing_rewrite"
  | "speaking_session_end"
  | "mock_exam_report"
  | "diagnostic_completion";

export type StudyLoopActivity = {
  id: string;
  dedupeKey?: string;
  skill: StudyLoopSkill;
  source: StudyLoopSource;
  title: string;
  summary: string;
  route: string;
  planPending: boolean;
  progressPending: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StudyLoopRecommendation = {
  title: string;
  detail: string;
  route: string;
  actionLabel: string;
};

type StudyLoopSnapshot = {
  version: 1;
  activities: StudyLoopActivity[];
};

type RecordStudyLoopActivityInput = {
  dedupeKey?: string;
  skill: StudyLoopSkill;
  source: StudyLoopSource;
  title: string;
  summary: string;
  route: string;
  planPending?: boolean;
  progressPending?: boolean;
};

type StudyLoopContextValue = {
  ready: boolean;
  activities: StudyLoopActivity[];
  pendingPlanRefreshCount: number;
  pendingProgressRefreshCount: number;
  recordActivity: (input: RecordStudyLoopActivityInput) => void;
  acknowledgePlanRefresh: () => void;
  acknowledgeProgressRefresh: () => void;
};

const MAX_STUDY_LOOP_ACTIVITIES = 12;

const createActivityId = (): string =>
  `study-loop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const defaultContextValue: StudyLoopContextValue = {
  ready: true,
  activities: [],
  pendingPlanRefreshCount: 0,
  pendingProgressRefreshCount: 0,
  recordActivity: () => undefined,
  acknowledgePlanRefresh: () => undefined,
  acknowledgeProgressRefresh: () => undefined
};

const StudyLoopContext = createContext<StudyLoopContextValue>(defaultContextValue);

export const formatStudyLoopSkillLabel = (skill: StudyLoopSkill): string => {
  switch (skill) {
    case "listening":
      return "听力";
    case "reading":
      return "阅读";
    case "writing":
      return "写作";
    case "speaking":
      return "口语";
    case "mock_exam":
      return "模考";
    case "diagnostic":
      return "诊断";
    default:
      return skill;
  }
};

export const buildStudyLoopRecommendation = (activities: StudyLoopActivity[]): StudyLoopRecommendation => {
  const latestPlanPending = activities.find((item) => item.planPending);
  if (latestPlanPending) {
    return {
      title: "先回看学习计划",
      detail: `${formatStudyLoopSkillLabel(latestPlanPending.skill)}结果刚更新，先消化计划侧变化。`,
      route: "/plan",
      actionLabel: "前往学习计划"
    };
  }

  const latestProgressPending = activities.find((item) => item.progressPending);
  if (latestProgressPending) {
    return {
      title: "继续同步学习进度",
      detail: `${formatStudyLoopSkillLabel(latestProgressPending.skill)}结果已产出，下一步核对进度统计。`,
      route: "/progress",
      actionLabel: "前往学习进度"
    };
  }

  const latestActivity = activities[0];
  if (latestActivity) {
    return {
      title: "继续最近训练",
      detail: `最近完成了${formatStudyLoopSkillLabel(latestActivity.skill)}，可以回到原页面继续。`,
      route: latestActivity.route,
      actionLabel: "回到最近训练"
    };
  }

  return {
    title: "开始今天的学习主线",
    detail: "先做首次诊断，或直接进入当前计划。",
    route: "/diagnostic",
    actionLabel: "进入首次诊断"
  };
};

export const StudyLoopProvider = ({ children }: PropsWithChildren) => {
  const { session } = useAppSession();
  const storageKey = session ? buildScopedStorageKey("study-loop", "activities", "v1", session.userId) : null;
  const [ready, setReady] = useState(false);
  const [activities, setActivities] = useState<StudyLoopActivity[]>([]);

  useEffect(() => {
    let cancelled = false;

    setReady(false);

    if (!storageKey) {
      setActivities([]);
      setReady(true);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const snapshot = await loadStoredJson<StudyLoopSnapshot>(storageKey);
      if (cancelled) {
        return;
      }

      setActivities(snapshot?.version === 1 ? snapshot.activities : []);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !ready) {
      return;
    }

    if (activities.length === 0) {
      void clearStoredJson(storageKey);
      return;
    }

    void saveStoredJson(storageKey, {
      version: 1,
      activities
    } satisfies StudyLoopSnapshot);
  }, [activities, ready, storageKey]);

  const recordActivity = (input: RecordStudyLoopActivityInput): void => {
    const now = new Date().toISOString();

    setActivities((current) => {
      const existingIndex = input.dedupeKey
        ? current.findIndex((item) => item.dedupeKey === input.dedupeKey)
        : -1;

      const nextActivity: StudyLoopActivity =
        existingIndex >= 0
          ? {
              ...current[existingIndex],
              skill: input.skill,
              source: input.source,
              title: input.title,
              summary: input.summary,
              route: input.route,
              planPending: input.planPending ?? true,
              progressPending: input.progressPending ?? true,
              updatedAt: now
            }
          : {
              id: createActivityId(),
              dedupeKey: input.dedupeKey,
              skill: input.skill,
              source: input.source,
              title: input.title,
              summary: input.summary,
              route: input.route,
              planPending: input.planPending ?? true,
              progressPending: input.progressPending ?? true,
              createdAt: now,
              updatedAt: now
            };

      const withoutExisting =
        existingIndex >= 0 ? current.filter((_, itemIndex) => itemIndex !== existingIndex) : current;

      return [nextActivity, ...withoutExisting].slice(0, MAX_STUDY_LOOP_ACTIVITIES);
    });
  };

  const acknowledgePlanRefresh = (): void => {
    setActivities((current) =>
      current.map((item) =>
        item.planPending
          ? {
              ...item,
              planPending: false,
              updatedAt: new Date().toISOString()
            }
          : item
      )
    );
  };

  const acknowledgeProgressRefresh = (): void => {
    setActivities((current) =>
      current.map((item) =>
        item.progressPending
          ? {
              ...item,
              progressPending: false,
              updatedAt: new Date().toISOString()
            }
          : item
      )
    );
  };

  const value = useMemo<StudyLoopContextValue>(
    () => ({
      ready,
      activities,
      pendingPlanRefreshCount: activities.filter((item) => item.planPending).length,
      pendingProgressRefreshCount: activities.filter((item) => item.progressPending).length,
      recordActivity,
      acknowledgePlanRefresh,
      acknowledgeProgressRefresh
    }),
    [activities, ready]
  );

  return <StudyLoopContext.Provider value={value}>{children}</StudyLoopContext.Provider>;
};

export const useStudyLoop = (): StudyLoopContextValue => useContext(StudyLoopContext);
