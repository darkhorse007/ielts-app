import { buildScopedStorageKey, clearStoredJson, loadStoredJson } from "./storage";

type ResumeSnapshot = {
  updatedAt?: string;
};

export type ResumeCheckpointScope = "diagnostic" | "listening" | "reading" | "speaking" | "writing" | "mock-exam";

type ResumeCheckpointDescriptor = {
  scope: ResumeCheckpointScope;
  route: "/diagnostic" | "/listening" | "/reading" | "/speaking" | "/writing" | "/mock-exam";
  title: string;
  detail: string;
};

export type ResumeCheckpointSummary = ResumeCheckpointDescriptor & {
  updatedAt: string;
};

const resumeCheckpointDescriptors: ResumeCheckpointDescriptor[] = [
  {
    scope: "mock-exam",
    route: "/mock-exam",
    title: "继续模考",
    detail: "上次模考仍有本地中间态可恢复。"
  },
  {
    scope: "speaking",
    route: "/speaking",
    title: "继续口语训练",
    detail: "上次实时口语会话仍有本地中间态可恢复。"
  },
  {
    scope: "writing",
    route: "/writing",
    title: "继续写作批改",
    detail: "上次写作草稿与改写内容仍保留在本地。"
  },
  {
    scope: "reading",
    route: "/reading",
    title: "继续阅读训练",
    detail: "上次阅读训练仍有本地作答与计时快照。"
  },
  {
    scope: "listening",
    route: "/listening",
    title: "继续听力训练",
    detail: "上次听力训练仍有本地作答与播放快照。"
  },
  {
    scope: "diagnostic",
    route: "/diagnostic",
    title: "继续首次诊断",
    detail: "上次诊断仍有未完成题目可恢复。"
  }
];

const buildResumeCheckpointStorageKey = (scope: ResumeCheckpointScope, userId: string): string =>
  buildScopedStorageKey(scope, "draft", "v1", userId);

const toTimestamp = (value?: string): number => {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

export const loadResumeCheckpoints = async (userId: string): Promise<ResumeCheckpointSummary[]> => {
  const snapshots = await Promise.all(
    resumeCheckpointDescriptors.map(async (descriptor) => {
      const key = buildResumeCheckpointStorageKey(descriptor.scope, userId);
      const snapshot = await loadStoredJson<ResumeSnapshot>(key);
      const updatedAt = snapshot?.updatedAt;
      if (!updatedAt) {
        return null;
      }

      return {
        ...descriptor,
        updatedAt
      } satisfies ResumeCheckpointSummary;
    })
  );

  const availableSnapshots = snapshots.filter((item): item is ResumeCheckpointSummary => Boolean(item));
  return availableSnapshots.sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt));
};

export const loadLatestResumeCheckpoint = async (userId: string): Promise<ResumeCheckpointSummary | null> => {
  return (await loadResumeCheckpoints(userId))[0] ?? null;
};

export const clearResumeCheckpoint = async (
  userId: string,
  scope: ResumeCheckpointScope
): Promise<void> => {
  await clearStoredJson(buildResumeCheckpointStorageKey(scope, userId));
};

export const clearAllResumeCheckpoints = async (userId: string): Promise<void> => {
  await Promise.all(
    resumeCheckpointDescriptors.map((descriptor) => clearStoredJson(buildResumeCheckpointStorageKey(descriptor.scope, userId)))
  );
};
