import { randomUUID } from "node:crypto";
import { nowIso } from "./time.js";
import type { AuditEventType } from "./types.js";
import { InMemoryStore } from "./store.js";

export const appendAudit = (
  store: InMemoryStore,
  type: AuditEventType,
  payload: {
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }
): void => {
  store.auditEvents.push({
    id: randomUUID(),
    type,
    userId: payload.userId,
    sessionId: payload.sessionId,
    metadata: payload.metadata ?? {},
    createdAt: nowIso()
  });
};
