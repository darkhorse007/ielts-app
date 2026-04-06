export type ProgressFollowUpRoute = "/practice/listening" | "/practice/reading" | "/speaking-live" | "/writing";

export type ProgressFollowUpSnapshot = {
  version: 1;
  title: string;
  detail: string;
  route: ProgressFollowUpRoute;
  actionLabel: string;
  updatedAt: string;
};

export type ProgressFollowUpInput = Omit<ProgressFollowUpSnapshot, "version" | "updatedAt">;

export const buildProgressFollowUpStorageKey = (userId: string): string => `ielts.progress_follow_up.${userId}`;

export const saveProgressFollowUp = (userId: string, snapshot: ProgressFollowUpInput): void => {
  try {
    localStorage.setItem(
      buildProgressFollowUpStorageKey(userId),
      JSON.stringify({
        version: 1,
        ...snapshot,
        updatedAt: new Date().toISOString()
      } satisfies ProgressFollowUpSnapshot)
    );
  } catch {
    // Follow-up cache is best-effort and must not break successful training submission flows.
  }
};

export const loadProgressFollowUp = (userId: string): ProgressFollowUpSnapshot | null => {
  const raw = localStorage.getItem(buildProgressFollowUpStorageKey(userId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ProgressFollowUpSnapshot> | null;
    if (
      parsed?.version !== 1 ||
      typeof parsed.title !== "string" ||
      typeof parsed.detail !== "string" ||
      typeof parsed.route !== "string" ||
      typeof parsed.actionLabel !== "string" ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }

    return parsed as ProgressFollowUpSnapshot;
  } catch {
    return null;
  }
};

export const clearProgressFollowUp = (userId: string): void => {
  localStorage.removeItem(buildProgressFollowUpStorageKey(userId));
};

export const consumeProgressFollowUp = (userId: string): ProgressFollowUpSnapshot | null => {
  const snapshot = loadProgressFollowUp(userId);
  clearProgressFollowUp(userId);
  return snapshot;
};
