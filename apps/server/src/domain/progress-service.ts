import { randomUUID } from "node:crypto";
import { appendAudit } from "./audit.js";
import { nowIso } from "./time.js";
import { InMemoryStore } from "./store.js";
import type { UserProgressSnapshot } from "./types.js";

type SyncInput = {
  userId: string;
  deviceId?: string;
  clientUpdatedAt: string;
  progress: {
    listeningCompleted: number;
    speakingCompleted: number;
    readingCompleted: number;
    writingCompleted: number;
    totalStudyMinutes: number;
    streakDays: number;
  };
};

const PROGRESS_FIELDS = [
  "listeningCompleted",
  "speakingCompleted",
  "readingCompleted",
  "writingCompleted",
  "totalStudyMinutes",
  "streakDays"
] as const;

type ProgressField = (typeof PROGRESS_FIELDS)[number];

export class ProgressService {
  constructor(private readonly store: InMemoryStore) {}

  getProgress(userId: string): UserProgressSnapshot {
    const existing = this.store.userProgressByUserId.get(userId);
    if (existing) {
      return existing;
    }

    const baseline: UserProgressSnapshot = {
      userId,
      listeningCompleted: 0,
      speakingCompleted: 0,
      readingCompleted: 0,
      writingCompleted: 0,
      totalStudyMinutes: 0,
      streakDays: 0,
      serverVersion: 1,
      updatedAt: nowIso()
    };

    this.store.userProgressByUserId.set(userId, baseline);
    return baseline;
  }

  syncProgress(input: SyncInput): {
    snapshot: UserProgressSnapshot;
    conflictCount: number;
    staleRequest: boolean;
  } {
    const snapshot = this.getProgress(input.userId);
    const clientUpdatedAtEpoch = new Date(input.clientUpdatedAt).getTime();
    if (Number.isNaN(clientUpdatedAtEpoch)) {
      throw new Error("INVALID_CLIENT_TIMESTAMP");
    }

    const serverUpdatedAtEpoch = new Date(snapshot.updatedAt).getTime();
    const staleRequest = Boolean(snapshot.lastSyncedDeviceId) && clientUpdatedAtEpoch < serverUpdatedAtEpoch;

    const nextSnapshot: UserProgressSnapshot = {
      ...snapshot
    };

    let conflictCount = 0;
    if (staleRequest) {
      for (const field of PROGRESS_FIELDS) {
        const incomingValue = this.sanitizeProgressValue(input.progress[field]);
        const serverValue = nextSnapshot[field];
        if (incomingValue === serverValue) {
          continue;
        }

        const conflict = {
          id: randomUUID(),
          userId: input.userId,
          deviceId: input.deviceId,
          field,
          incomingValue,
          serverValue,
          clientUpdatedAt: input.clientUpdatedAt,
          serverUpdatedAt: snapshot.updatedAt,
          createdAt: nowIso()
        };
        this.store.progressConflicts.push(conflict);
        conflictCount += 1;

        appendAudit(this.store, "progress_conflict", {
          userId: input.userId,
          metadata: {
            deviceId: input.deviceId,
            field,
            incomingValue,
            serverValue,
            clientUpdatedAt: input.clientUpdatedAt,
            serverUpdatedAt: snapshot.updatedAt
          }
        });
      }
    } else {
      for (const field of PROGRESS_FIELDS) {
        nextSnapshot[field] = this.sanitizeProgressValue(input.progress[field]);
      }
      nextSnapshot.serverVersion = snapshot.serverVersion + 1;
      nextSnapshot.updatedAt = nowIso();
      nextSnapshot.lastSyncedDeviceId = input.deviceId;
      this.store.userProgressByUserId.set(input.userId, nextSnapshot);
    }

    appendAudit(this.store, "progress_synced", {
      userId: input.userId,
      metadata: {
        staleRequest,
        conflictCount,
        deviceId: input.deviceId,
        serverVersion: nextSnapshot.serverVersion
      }
    });

    return {
      snapshot: nextSnapshot,
      conflictCount,
      staleRequest
    };
  }

  getConflictHistory(userId: string): Array<{
    id: string;
    field: string;
    incomingValue: number;
    serverValue: number;
    clientUpdatedAt: string;
    serverUpdatedAt: string;
    createdAt: string;
    deviceId?: string;
  }> {
    return this.store.progressConflicts
      .filter((item) => item.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  removeUserProgressData(userId: string): { removedSnapshot: boolean; removedConflicts: number } {
    const removedSnapshot = this.store.userProgressByUserId.delete(userId);

    const remain = this.store.progressConflicts.filter((item) => item.userId !== userId);
    const removedConflicts = this.store.progressConflicts.length - remain.length;
    this.store.progressConflicts.splice(0, this.store.progressConflicts.length, ...remain);

    return {
      removedSnapshot,
      removedConflicts
    };
  }

  private sanitizeProgressValue(value: number): number {
    if (!Number.isFinite(value) || value < 0) {
      return 0;
    }
    return Math.trunc(value);
  }
}
