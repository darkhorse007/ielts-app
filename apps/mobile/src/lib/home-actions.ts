import type { ResumeCheckpointScope, ResumeCheckpointSummary } from "./resume-checkpoints";
import type { StudyLoopRecommendation } from "../state/study-loop";

export type HomeActionItem = {
  id: string;
  title: string;
  detail: string;
  route: string;
  actionLabel: string;
  source: "resume" | "study_loop";
  sourceLabel: string;
  priorityLabel: string;
  resumeScope?: ResumeCheckpointScope;
};

const createActionId = (source: HomeActionItem["source"], route: string, title: string): string =>
  `${source}:${route}:${title}`;

export const buildTodayActionList = (input: {
  primaryStudyAction: StudyLoopRecommendation;
  resumeCheckpoints: ResumeCheckpointSummary[];
}): HomeActionItem[] => {
  const items: HomeActionItem[] = [];
  const seen = new Set<string>();

  const appendAction = (item: HomeActionItem | null): void => {
    if (!item) {
      return;
    }

    const dedupeKey = `${item.route}:${item.title}:${item.actionLabel}`;
    if (seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    items.push(item);
  };

  const latestResumeCheckpoint = input.resumeCheckpoints[0] ?? null;
  appendAction(
    latestResumeCheckpoint
      ? {
          id: createActionId("resume", latestResumeCheckpoint.route, latestResumeCheckpoint.title),
          title: latestResumeCheckpoint.title,
          detail: latestResumeCheckpoint.detail,
          route: latestResumeCheckpoint.route,
          actionLabel: "继续上次中断",
          source: "resume",
          sourceLabel: "恢复",
          priorityLabel: "P0",
          resumeScope: latestResumeCheckpoint.scope
        }
      : null
  );

  appendAction({
    id: createActionId("study_loop", input.primaryStudyAction.route, input.primaryStudyAction.title),
    title: input.primaryStudyAction.title,
    detail: input.primaryStudyAction.detail,
    route: input.primaryStudyAction.route,
    actionLabel: input.primaryStudyAction.actionLabel,
    source: "study_loop",
    sourceLabel: "主线",
    priorityLabel: "P1"
  });

  input.resumeCheckpoints.slice(1, 3).forEach((item) => {
    appendAction({
      id: createActionId("resume", item.route, item.title),
      title: item.title,
      detail: item.detail,
      route: item.route,
      actionLabel: item.title,
      source: "resume",
      sourceLabel: "恢复",
      priorityLabel: "P2",
      resumeScope: item.scope
    });
  });

  return items.slice(0, 4);
};
