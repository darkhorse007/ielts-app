import { randomUUID } from "node:crypto";
import { appendAudit } from "./audit.js";
import { hashPassword, randomToken, sha256, signAccessToken, verifyAccessToken, verifyPassword } from "./crypto.js";
import type { ServiceConfig } from "./config.js";
import { addSeconds, isPast, nowIso } from "./time.js";
import { InMemoryStore } from "./store.js";
import type { SystemRole } from "./types.js";

type RegisterInput = {
  email?: string;
  phone?: string;
  password: string;
  displayName?: string;
};

type LoginInput = {
  identifier: string;
  password: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
};

type RefreshInput = {
  refreshToken: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
};

type LogoutInput = {
  accessToken: string;
  refreshToken?: string;
};

export class AuthService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly config: ServiceConfig
  ) {}

  register(input: RegisterInput): { userId: string } {
    const email = input.email?.trim().toLowerCase();
    const phone = input.phone?.trim();

    if (email && this.store.userIdByEmail.has(email)) {
      throw new Error("EMAIL_ALREADY_EXISTS");
    }
    if (phone && this.store.userIdByPhone.has(phone)) {
      throw new Error("PHONE_ALREADY_EXISTS");
    }

    const now = nowIso();
    const userId = randomUUID();
    const user = {
      id: userId,
      email,
      phone,
      displayName: input.displayName,
      systemRoles: this.resolveSystemRoles(email),
      passwordHash: hashPassword(input.password),
      status: "active" as const,
      createdAt: now,
      updatedAt: now
    };

    this.store.usersById.set(userId, user);
    if (email) {
      this.store.userIdByEmail.set(email, userId);
    }
    if (phone) {
      this.store.userIdByPhone.set(phone, userId);
    }

    appendAudit(this.store, "auth_register", {
      userId,
      metadata: {
        registerBy: email ? "email" : "phone"
      }
    });

    return { userId };
  }

  login(input: LoginInput): {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    userId: string;
    sessionId: string;
  } {
    const normalizedIdentifier = input.identifier.trim().toLowerCase();
    this.assertNotRateLimited(normalizedIdentifier);

    const userId = this.findUserIdByIdentifier(normalizedIdentifier);
    if (!userId) {
      this.recordLoginFailure(normalizedIdentifier, "identifier_not_found");
      throw new Error("INVALID_CREDENTIALS");
    }

    const user = this.store.usersById.get(userId);
    if (!user) {
      this.recordLoginFailure(normalizedIdentifier, "user_not_found");
      throw new Error("INVALID_CREDENTIALS");
    }

    if (user.status !== "active") {
      this.recordLoginFailure(normalizedIdentifier, "user_not_active", userId);
      throw new Error("USER_DISABLED");
    }

    const passwordResult = verifyPassword(input.password, user.passwordHash);
    if (!passwordResult.valid) {
      this.recordLoginFailure(normalizedIdentifier, "password_mismatch", userId);
      throw new Error("INVALID_CREDENTIALS");
    }

    if (passwordResult.needsRehash) {
      user.passwordHash = hashPassword(input.password);
      user.updatedAt = nowIso();
      this.store.usersById.set(user.id, user);
    }

    this.store.failedLoginByIdentifier.delete(normalizedIdentifier);

    const existingSessions = this.getActiveSessionsForUser(user.id);
    const deviceId = input.deviceId?.trim();
    if (existingSessions.length > 0 && deviceId) {
      const knownDevice = existingSessions.some((session) => session.deviceId === deviceId);
      if (!knownDevice) {
        appendAudit(this.store, "anomalous_login", {
          userId: user.id,
          metadata: {
            currentDeviceId: deviceId,
            activeSessionCount: existingSessions.length
          }
        });
      }
    }

    const sessionId = randomUUID();
    const refreshToken = randomToken(48);
    const refreshHash = sha256(refreshToken);
    const now = nowIso();

    const session = {
      id: sessionId,
      userId: user.id,
      refreshTokenHash: refreshHash,
      deviceId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      expiresAt: addSeconds(now, this.config.refreshTokenTtlSeconds),
      createdAt: now,
      updatedAt: now
    };

    this.store.sessionsById.set(session.id, session);
    this.store.sessionIdByRefreshHash.set(refreshHash, session.id);

    const accessToken = signAccessToken(
      {
        userId: user.id,
        sessionId: session.id
      },
      this.config.accessTokenTtlSeconds,
      this.config.authSecret
    );

    appendAudit(this.store, "auth_login_success", {
      userId: user.id,
      sessionId: session.id,
      metadata: {
        deviceId,
        ipAddress: input.ipAddress
      }
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.accessTokenTtlSeconds,
      userId: user.id,
      sessionId: session.id
    };
  }

  refresh(input: RefreshInput): {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    userId: string;
    sessionId: string;
  } {
    this.purgeExpiredBlacklistTokens();

    const refreshHash = sha256(input.refreshToken);
    if (this.store.refreshBlacklist.has(refreshHash)) {
      appendAudit(this.store, "auth_refresh_rejected", {
        metadata: {
          reason: "blacklisted"
        }
      });
      throw new Error("INVALID_REFRESH_TOKEN");
    }

    const sessionId = this.store.sessionIdByRefreshHash.get(refreshHash);
    if (!sessionId) {
      appendAudit(this.store, "auth_refresh_rejected", {
        metadata: {
          reason: "unknown_token"
        }
      });
      throw new Error("INVALID_REFRESH_TOKEN");
    }

    const session = this.store.sessionsById.get(sessionId);
    if (!session || session.revokedAt) {
      appendAudit(this.store, "auth_refresh_rejected", {
        metadata: {
          reason: "revoked_or_missing",
          sessionId
        }
      });
      throw new Error("INVALID_REFRESH_TOKEN");
    }

    const user = this.store.usersById.get(session.userId);
    if (!user || user.status === "deleted") {
      this.revokeSession(session.id, "user_deleted");
      appendAudit(this.store, "auth_refresh_rejected", {
        userId: session.userId,
        sessionId,
        metadata: {
          reason: "user_deleted"
        }
      });
      throw new Error("INVALID_REFRESH_TOKEN");
    }

    if (isPast(session.expiresAt)) {
      session.revokedAt = nowIso();
      this.store.sessionsById.set(session.id, session);
      this.store.sessionIdByRefreshHash.delete(refreshHash);
      appendAudit(this.store, "auth_refresh_rejected", {
        userId: session.userId,
        sessionId,
        metadata: {
          reason: "expired"
        }
      });
      throw new Error("INVALID_REFRESH_TOKEN");
    }

    const oldHash = session.refreshTokenHash;
    const now = nowIso();
    const nextRefreshToken = randomToken(48);
    const nextRefreshHash = sha256(nextRefreshToken);

    session.refreshTokenHash = nextRefreshHash;
    session.updatedAt = now;
    session.deviceId = input.deviceId ?? session.deviceId;
    session.ipAddress = input.ipAddress ?? session.ipAddress;
    session.userAgent = input.userAgent ?? session.userAgent;
    this.store.sessionsById.set(session.id, session);

    this.store.sessionIdByRefreshHash.delete(oldHash);
    this.store.sessionIdByRefreshHash.set(nextRefreshHash, session.id);

    this.store.refreshBlacklist.set(oldHash, {
      tokenHash: oldHash,
      expiresAt: session.expiresAt
    });

    const accessToken = signAccessToken(
      {
        userId: session.userId,
        sessionId: session.id
      },
      this.config.accessTokenTtlSeconds,
      this.config.authSecret
    );

    appendAudit(this.store, "auth_refresh", {
      userId: session.userId,
      sessionId: session.id,
      metadata: {
        rotatedAt: now
      }
    });

    return {
      accessToken,
      refreshToken: nextRefreshToken,
      expiresIn: this.config.accessTokenTtlSeconds,
      userId: session.userId,
      sessionId: session.id
    };
  }

  logout(input: LogoutInput): void {
    const payload = verifyAccessToken(input.accessToken, this.config.authSecret);
    if (!payload) {
      throw new Error("INVALID_ACCESS_TOKEN");
    }

    const session = this.store.sessionsById.get(payload.sessionId);
    if (!session || session.userId !== payload.userId) {
      throw new Error("SESSION_NOT_FOUND");
    }

    const now = nowIso();
    session.revokedAt = now;
    session.updatedAt = now;
    this.store.sessionsById.set(session.id, session);

    this.store.sessionIdByRefreshHash.delete(session.refreshTokenHash);
    this.store.refreshBlacklist.set(session.refreshTokenHash, {
      tokenHash: session.refreshTokenHash,
      expiresAt: session.expiresAt
    });

    if (input.refreshToken) {
      const explicitHash = sha256(input.refreshToken);
      this.store.refreshBlacklist.set(explicitHash, {
        tokenHash: explicitHash,
        expiresAt: session.expiresAt
      });
      this.store.sessionIdByRefreshHash.delete(explicitHash);
    }

    appendAudit(this.store, "auth_logout", {
      userId: session.userId,
      sessionId: session.id,
      metadata: {
        explicitRefreshTokenProvided: Boolean(input.refreshToken)
      }
    });
  }

  verifyAccessToken(token: string): { userId: string; sessionId: string } {
    const payload = verifyAccessToken(token, this.config.authSecret);
    if (!payload) {
      throw new Error("INVALID_ACCESS_TOKEN");
    }

    const session = this.store.sessionsById.get(payload.sessionId);
    const user = this.store.usersById.get(payload.userId);
    if (!session || session.revokedAt || session.userId !== payload.userId || !user || user.status === "deleted") {
      throw new Error("INVALID_ACCESS_TOKEN");
    }

    return {
      userId: payload.userId,
      sessionId: payload.sessionId
    };
  }

  getSystemRoles(userId: string): SystemRole[] {
    const user = this.store.usersById.get(userId);
    if (!user) {
      return ["learner"];
    }
    return user.systemRoles;
  }

  revokeAllSessionsForUser(userId: string): number {
    let revokedCount = 0;
    for (const session of this.store.sessionsById.values()) {
      if (session.userId !== userId || session.revokedAt) {
        continue;
      }
      this.revokeSession(session.id, "bulk_revoke");
      revokedCount += 1;
    }
    return revokedCount;
  }

  getUserById(userId: string): {
    id: string;
    email?: string;
    phone?: string;
    displayName?: string;
    systemRoles: SystemRole[];
    status: string;
    deletionRequestedAt?: string;
    deletedAt?: string;
    createdAt: string;
    updatedAt: string;
  } {
    const user = this.store.usersById.get(userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      displayName: user.displayName,
      systemRoles: user.systemRoles,
      status: user.status,
      deletionRequestedAt: user.deletionRequestedAt,
      deletedAt: user.deletedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  setSystemRoles(input: {
    userId: string;
    roles: SystemRole[];
    operatorUserId: string;
  }): {
    userId: string;
    roles: SystemRole[];
    updatedAt: string;
  } {
    const user = this.store.usersById.get(input.userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }
    const normalized = new Set<SystemRole>(input.roles);
    normalized.add("learner");
    user.systemRoles = [...normalized];
    user.updatedAt = nowIso();
    this.store.usersById.set(user.id, user);

    appendAudit(this.store, "system_user_roles_updated", {
      userId: input.operatorUserId,
      metadata: {
        targetUserId: input.userId,
        roles: user.systemRoles
      }
    });

    return {
      userId: user.id,
      roles: user.systemRoles,
      updatedAt: user.updatedAt
    };
  }

  querySystemRoleAudit(input?: {
    targetUserId?: string;
    operatorUserId?: string;
    page?: number;
    pageSize?: number;
  }): {
    items: Array<{
      id: string;
      operatorUserId?: string;
      targetUserId?: string;
      roles: SystemRole[];
      createdAt: string;
    }>;
    total: number;
    page: number;
    pageSize: number;
  } {
    const normalizeInt = (value: number | undefined, fallback: number, max: number): number => {
      if (!Number.isFinite(value) || !Number.isInteger(value)) {
        return fallback;
      }
      return Math.max(1, Math.min(max, value as number));
    };
    const page = normalizeInt(input?.page, 1, 1000000);
    const pageSize = normalizeInt(input?.pageSize, 20, 100);

    const filtered = this.store.auditEvents
      .filter((item) => item.type === "system_user_roles_updated")
      .filter((item) =>
        input?.targetUserId ? String(item.metadata.targetUserId ?? "") === input.targetUserId : true
      )
      .filter((item) => (input?.operatorUserId ? String(item.userId ?? "") === input.operatorUserId : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize).map((item) => {
        const roles = Array.isArray(item.metadata.roles)
          ? item.metadata.roles.filter((role): role is SystemRole =>
              role === "learner" || role === "qa" || role === "ops" || role === "admin"
            )
          : [];
        return {
          id: item.id,
          operatorUserId: item.userId,
          targetUserId: typeof item.metadata.targetUserId === "string" ? item.metadata.targetUserId : undefined,
          roles,
          createdAt: item.createdAt
        };
      }),
      total: filtered.length,
      page,
      pageSize
    };
  }

  private findUserIdByIdentifier(identifier: string): string | undefined {
    return this.store.userIdByEmail.get(identifier) ?? this.store.userIdByPhone.get(identifier);
  }

  private assertNotRateLimited(identifier: string): void {
    const counter = this.store.failedLoginByIdentifier.get(identifier);
    if (!counter) {
      return;
    }

    const nowMs = Date.now();
    const windowMs = this.config.loginFailureWindowSeconds * 1000;

    if (nowMs - counter.firstFailedAt > windowMs) {
      this.store.failedLoginByIdentifier.delete(identifier);
      return;
    }

    if (counter.count >= this.config.loginFailureLimit) {
      appendAudit(this.store, "auth_login_rate_limited", {
        metadata: {
          identifier
        }
      });
      throw new Error("LOGIN_RATE_LIMITED");
    }
  }

  private recordLoginFailure(identifier: string, reason: string, userId?: string): void {
    const nowMs = Date.now();
    const windowMs = this.config.loginFailureWindowSeconds * 1000;
    const current = this.store.failedLoginByIdentifier.get(identifier);

    if (!current || nowMs - current.firstFailedAt > windowMs) {
      this.store.failedLoginByIdentifier.set(identifier, {
        count: 1,
        firstFailedAt: nowMs
      });
    } else {
      current.count += 1;
      this.store.failedLoginByIdentifier.set(identifier, current);
    }

    appendAudit(this.store, "auth_login_failure", {
      userId,
      metadata: {
        identifier,
        reason
      }
    });
  }

  private getActiveSessionsForUser(userId: string): Array<{ id: string; deviceId?: string }> {
    const result: Array<{ id: string; deviceId?: string }> = [];
    for (const session of this.store.sessionsById.values()) {
      if (session.userId !== userId) {
        continue;
      }
      if (session.revokedAt || isPast(session.expiresAt)) {
        continue;
      }
      result.push({ id: session.id, deviceId: session.deviceId });
    }
    return result;
  }

  private revokeSession(sessionId: string, reason: string): void {
    const session = this.store.sessionsById.get(sessionId);
    if (!session || session.revokedAt) {
      return;
    }

    const now = nowIso();
    session.revokedAt = now;
    session.updatedAt = now;
    this.store.sessionsById.set(session.id, session);

    this.store.sessionIdByRefreshHash.delete(session.refreshTokenHash);
    this.store.refreshBlacklist.set(session.refreshTokenHash, {
      tokenHash: session.refreshTokenHash,
      expiresAt: session.expiresAt
    });

    appendAudit(this.store, "auth_logout", {
      userId: session.userId,
      sessionId: session.id,
      metadata: {
        reason,
        systemRevoked: true
      }
    });
  }

  private purgeExpiredBlacklistTokens(): void {
    for (const [hash, entry] of this.store.refreshBlacklist.entries()) {
      if (isPast(entry.expiresAt)) {
        this.store.refreshBlacklist.delete(hash);
      }
    }
  }

  private resolveSystemRoles(email?: string): SystemRole[] {
    if (!email) {
      return ["learner"];
    }
    const roles = new Set<SystemRole>(["learner"]);
    if (email.startsWith("qa-")) {
      roles.add("qa");
    }
    if (email.startsWith("ops-")) {
      roles.add("ops");
    }
    if (email.startsWith("admin-")) {
      roles.add("admin");
    }
    return [...roles];
  }
}
