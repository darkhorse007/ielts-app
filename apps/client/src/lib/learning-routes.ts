import type { StudyPlanResponse } from "./api-types";

export type WebLearningRoute = "/practice/listening" | "/practice/reading" | "/speaking-live" | "/writing";

export type StudyPlanTask = StudyPlanResponse["weeks"][number]["tasks"][number];

const getOrderedPlanTasks = (plan: Pick<StudyPlanResponse, "weeks"> | null | undefined): StudyPlanTask[] => {
  if (!plan) {
    return [];
  }

  return [...plan.weeks]
    .sort((left, right) => left.week_no - right.week_no)
    .flatMap((week) => [...week.tasks].sort((left, right) => left.day_of_week - right.day_of_week));
};

const formatSkillActionLabel = (skill: StudyPlanTask["skill"]): string => {
  switch (skill) {
    case "listening":
      return "进入听力训练";
    case "reading":
      return "进入阅读训练";
    case "speaking":
      return "进入口语训练";
    case "writing":
      return "进入写作训练";
    default:
      return "进入当前训练";
  }
};

export const selectNextActionablePlanTask = (
  plan: Pick<StudyPlanResponse, "weeks"> | null | undefined
): StudyPlanTask | null => {
  let firstTodoTask: StudyPlanTask | null = null;

  for (const task of getOrderedPlanTasks(plan)) {
    if (task.status === "doing") {
      return task;
    }

    if (task.status === "todo" && !firstTodoTask) {
      firstTodoTask = task;
    }
  }

  return firstTodoTask;
};

export const resolveLearningRouteForSkill = (skill: StudyPlanTask["skill"]): WebLearningRoute => {
  switch (skill) {
    case "listening":
      return "/practice/listening";
    case "reading":
      return "/practice/reading";
    case "speaking":
      return "/speaking-live";
    case "writing":
      return "/writing";
    default:
      return "/practice/reading";
  }
};

export const resolveLearningRouteForPlanTask = (
  task: StudyPlanTask | null | undefined
): {
  route: WebLearningRoute;
  actionLabel: string;
} | null => {
  if (!task) {
    return null;
  }

  return {
    route: resolveLearningRouteForSkill(task.skill),
    actionLabel: formatSkillActionLabel(task.skill)
  };
};
