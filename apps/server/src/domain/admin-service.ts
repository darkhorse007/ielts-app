import { randomUUID } from "node:crypto";
import { appendAudit } from "./audit.js";
import { sha256 } from "./crypto.js";
import { addSeconds, nowIso } from "./time.js";
import { InMemoryStore } from "./store.js";
import type { AdminRoleCode, AdminSession, AdminUser } from "./types.js";

const ADMIN_ACCESS_TTL_SECONDS = 3600;
const MAX_FAILED = 5;
const FAILED_WINDOW_MS = 10 * 60 * 1000;

type AdminPermission =
  | "orders:read"
  | "entitlement:adjust"
  | "entitlement:rollback"
  | "coupon:manage"
  | "users:manage"
  | "content:publish"
  | "audit:read"
  | "release:manage";

const ROLE_PERMISSIONS: Record<AdminRoleCode, AdminPermission[]> = {
  super_admin: [
    "orders:read",
    "entitlement:adjust",
    "entitlement:rollback",
    "coupon:manage",
    "users:manage",
    "content:publish",
    "audit:read",
    "release:manage"
  ],
  finance: ["orders:read", "entitlement:adjust", "entitlement:rollback", "coupon:manage", "audit:read"],
  ops: ["orders:read", "users:manage", "content:publish", "audit:read", "release:manage"]
};

const ROLE_MENUS: Record<AdminRoleCode, string[]> = {
  super_admin: ["dashboard", "orders", "entitlements", "coupons", "risk", "users", "content", "release", "audit"],
  finance: ["orders", "entitlements", "coupons", "audit"],
  ops: ["orders", "users", "content", "release", "audit"]
};

export class AdminService {
  constructor(private readonly store: InMemoryStore) {
    this.seedAdminsIfNeeded();
  }

  login(input: {
    email: string;
    password: string;
    ipAddress?: string;
    userAgent?: string;
  }): {
    accessToken: string;
    expiresIn: number;
    adminUserId: string;
    email: string;
    displayName: string;
    roles: AdminRoleCode[];
    menus: string[];
  } {
    const email = input.email.trim().toLowerCase();
    this.assertNotRateLimited(email);

    const adminId = this.store.adminUserIdByEmail.get(email);
    const admin = adminId ? this.store.adminUsersById.get(adminId) : undefined;
    if (!admin || admin.passwordHash !== sha256(input.password) || admin.status !== "active") {
      this.recordFailedLogin(email);
      appendAudit(this.store, "admin_login_failure", {
        metadata: {
          email,
          ipAddress: input.ipAddress
        }
      });
      throw new Error("INVALID_ADMIN_CREDENTIALS");
    }
    this.store.adminFailedLoginByEmail.delete(email);

    const token = randomUUID().replaceAll("-", "");
    const session: AdminSession = {
      token,
      adminUserId: admin.id,
      expiresAt: addSeconds(nowIso(), ADMIN_ACCESS_TTL_SECONDS),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.store.adminSessionsByToken.set(token, session);

    appendAudit(this.store, "admin_login_success", {
      metadata: {
        adminUserId: admin.id,
        roles: admin.roles,
        ipAddress: input.ipAddress
      }
    });

    return {
      accessToken: token,
      expiresIn: ADMIN_ACCESS_TTL_SECONDS,
      adminUserId: admin.id,
      email: admin.email,
      displayName: admin.displayName,
      roles: admin.roles,
      menus: this.getMenus(admin.roles)
    };
  }

  verifyAccessToken(token: string): {
    adminUserId: string;
    roles: AdminRoleCode[];
    email: string;
  } {
    const session = this.store.adminSessionsByToken.get(token);
    if (!session) {
      throw new Error("ADMIN_UNAUTHORIZED");
    }
    if (Date.now() > new Date(session.expiresAt).getTime()) {
      this.store.adminSessionsByToken.delete(token);
      throw new Error("ADMIN_UNAUTHORIZED");
    }

    const admin = this.store.adminUsersById.get(session.adminUserId);
    if (!admin || admin.status !== "active") {
      throw new Error("ADMIN_UNAUTHORIZED");
    }

    session.updatedAt = nowIso();
    return {
      adminUserId: admin.id,
      roles: admin.roles,
      email: admin.email
    };
  }

  assertPermission(auth: { roles: AdminRoleCode[] }, permission: AdminPermission): void {
    const allowed = auth.roles.some((role) => ROLE_PERMISSIONS[role].includes(permission));
    if (!allowed) {
      throw new Error("ADMIN_FORBIDDEN");
    }
  }

  getMenus(roles: AdminRoleCode[]): string[] {
    return Array.from(new Set(roles.flatMap((role) => ROLE_MENUS[role])));
  }

  private seedAdminsIfNeeded(): void {
    if (this.store.adminUsersById.size > 0) {
      return;
    }

    const now = nowIso();
    const seed: AdminUser[] = [
      {
        id: randomUUID(),
        email: "admin@example.com",
        passwordHash: sha256("AdminPass123"),
        displayName: "Super Admin",
        status: "active",
        roles: ["super_admin"],
        createdAt: now,
        updatedAt: now
      },
      {
        id: randomUUID(),
        email: "finance@example.com",
        passwordHash: sha256("FinancePass123"),
        displayName: "Finance Admin",
        status: "active",
        roles: ["finance"],
        createdAt: now,
        updatedAt: now
      },
      {
        id: randomUUID(),
        email: "ops@example.com",
        passwordHash: sha256("OpsPass123"),
        displayName: "Ops Admin",
        status: "active",
        roles: ["ops"],
        createdAt: now,
        updatedAt: now
      }
    ];

    for (const admin of seed) {
      this.store.adminUsersById.set(admin.id, admin);
      this.store.adminUserIdByEmail.set(admin.email, admin.id);
    }
  }

  private assertNotRateLimited(email: string): void {
    const state = this.store.adminFailedLoginByEmail.get(email);
    if (!state) {
      return;
    }
    const now = Date.now();
    if (now - state.firstFailedAt > FAILED_WINDOW_MS) {
      this.store.adminFailedLoginByEmail.delete(email);
      return;
    }
    if (state.count >= MAX_FAILED) {
      throw new Error("ADMIN_LOGIN_RATE_LIMITED");
    }
  }

  private recordFailedLogin(email: string): void {
    const now = Date.now();
    const state = this.store.adminFailedLoginByEmail.get(email);
    if (!state || now - state.firstFailedAt > FAILED_WINDOW_MS) {
      this.store.adminFailedLoginByEmail.set(email, {
        count: 1,
        firstFailedAt: now
      });
      return;
    }
    state.count += 1;
  }
}
