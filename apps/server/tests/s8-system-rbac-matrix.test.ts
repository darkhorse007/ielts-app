import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

type SystemRole = "learner" | "qa" | "ops" | "admin";

describe("S8 system RBAC permission matrix", () => {
  const nextEmail = (prefix: string) => `${prefix}-${crypto.randomUUID()}@example.com`;

  const build = async () => {
    const server = buildServer({
      systemRbacEnforced: true
    });
    await server.app.ready();
    return server;
  };

  let context: Awaited<ReturnType<typeof build>>;

  beforeEach(async () => {
    context = await build();
  });

  afterEach(async () => {
    await context.app.close();
  });

  const registerAndLogin = async (prefix: string): Promise<{ userId: string; accessToken: string }> => {
    const email = nextEmail(prefix);
    const register = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "StrongPass123"
      }
    });
    expect(register.statusCode).toBe(201);
    const userId = register.json().user_id as string;

    const login = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: email,
        password: "StrongPass123",
        device_id: "qa-web"
      }
    });
    expect(login.statusCode).toBe(200);

    return {
      userId,
      accessToken: login.json().access_token as string
    };
  };

  test("enforces release/stability/beta permissions by role matrix", async () => {
    const learner = await registerAndLogin("learner-rbac");
    const qa = await registerAndLogin("qa-rbac");
    const ops = await registerAndLogin("ops-rbac");
    const admin = await registerAndLogin("admin-rbac");

    const roles: Record<SystemRole, { userId: string; accessToken: string }> = {
      learner,
      qa,
      ops,
      admin
    };

    const releaseMetricsExpected: Record<SystemRole, number> = {
      learner: 403,
      qa: 403,
      ops: 403,
      admin: 200
    };

    for (const role of Object.keys(roles) as SystemRole[]) {
      const result = await context.app.inject({
        method: "GET",
        url: "/v1/system/release/metrics",
        headers: {
          authorization: `Bearer ${roles[role].accessToken}`
        }
      });
      expect(result.statusCode).toBe(releaseMetricsExpected[role]);
      if (result.statusCode === 403) {
        expect(result.json().code).toBe("FORBIDDEN");
      } else {
        expect(result.json().storage_resilience).toBeTruthy();
      }
    }

    const stabilityManageExpected: Record<SystemRole, number> = {
      learner: 403,
      qa: 201,
      ops: 403,
      admin: 201
    };

    let readableRunId = "";
    for (const role of Object.keys(roles) as SystemRole[]) {
      const started = await context.app.inject({
        method: "POST",
        url: "/v1/system/stability/soak-tests/start",
        headers: {
          authorization: `Bearer ${roles[role].accessToken}`
        },
        payload: {
          release_id: `REL-S8-RBAC-MANAGE-${role}-${crypto.randomUUID().slice(0, 8)}`,
          planned_duration_hours: 72
        }
      });
      expect(started.statusCode).toBe(stabilityManageExpected[role]);
      if (started.statusCode === 403) {
        expect(started.json().code).toBe("FORBIDDEN");
      } else if (!readableRunId) {
        readableRunId = started.json().run_id as string;
      }
    }
    expect(readableRunId).not.toBe("");

    const stabilityReadExpected: Record<SystemRole, number> = {
      learner: 403,
      qa: 200,
      ops: 200,
      admin: 200
    };

    for (const role of Object.keys(roles) as SystemRole[]) {
      const listed = await context.app.inject({
        method: "GET",
        url: `/v1/system/stability/alerts?run_id=${readableRunId}&status=open`,
        headers: {
          authorization: `Bearer ${roles[role].accessToken}`
        }
      });
      expect(listed.statusCode).toBe(stabilityReadExpected[role]);
      if (listed.statusCode === 403) {
        expect(listed.json().code).toBe("FORBIDDEN");
      } else {
        expect(typeof listed.json().total).toBe("number");
      }
    }

    const betaManageExpected: Record<SystemRole, number> = {
      learner: 403,
      qa: 403,
      ops: 200,
      admin: 200
    };

    for (const role of Object.keys(roles) as SystemRole[]) {
      const upserted = await context.app.inject({
        method: "PUT",
        url: `/v1/system/beta/whitelist/${learner.userId}`,
        headers: {
          authorization: `Bearer ${roles[role].accessToken}`
        },
        payload: {
          release_id: "REL-S8-RBAC-BETA-001",
          status: "active",
          note: `set by ${role}`
        }
      });
      expect(upserted.statusCode).toBe(betaManageExpected[role]);
      if (upserted.statusCode === 403) {
        expect(upserted.json().code).toBe("FORBIDDEN");
      } else {
        expect(upserted.json().release_id).toBe("REL-S8-RBAC-BETA-001");
      }
    }

    const betaReadExpected: Record<SystemRole, number> = {
      learner: 403,
      qa: 403,
      ops: 200,
      admin: 200
    };

    for (const role of Object.keys(roles) as SystemRole[]) {
      const listed = await context.app.inject({
        method: "GET",
        url: `/v1/system/beta/whitelist?user_id=${learner.userId}&page=1&page_size=20`,
        headers: {
          authorization: `Bearer ${roles[role].accessToken}`
        }
      });
      expect(listed.statusCode).toBe(betaReadExpected[role]);
      if (listed.statusCode === 403) {
        expect(listed.json().code).toBe("FORBIDDEN");
      } else {
        expect(typeof listed.json().total).toBe("number");
      }
    }
  });

  test("enforces RBAC by default and supports explicit opt-out", async () => {
    const defaultServer = buildServer();
    await defaultServer.app.ready();

    try {
      const email = `qa-default-${crypto.randomUUID()}@example.com`;
      const password = "StrongPass123";
      await defaultServer.app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email,
          password
        }
      });
      const login = await defaultServer.app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: {
          identifier: email,
          password,
          device_id: "qa-web"
        }
      });
      expect(login.statusCode).toBe(200);

      const forbidden = await defaultServer.app.inject({
        method: "GET",
        url: "/v1/system/release/metrics",
        headers: {
          authorization: `Bearer ${login.json().access_token as string}`
        }
      });
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json().code).toBe("FORBIDDEN");
    } finally {
      await defaultServer.app.close();
    }

    const relaxedServer = buildServer({
      systemRbacEnforced: false
    });
    await relaxedServer.app.ready();

    try {
      const email = `qa-relaxed-${crypto.randomUUID()}@example.com`;
      const password = "StrongPass123";
      await relaxedServer.app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email,
          password
        }
      });
      const login = await relaxedServer.app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: {
          identifier: email,
          password,
          device_id: "qa-web"
        }
      });
      expect(login.statusCode).toBe(200);

      const allowed = await relaxedServer.app.inject({
        method: "GET",
        url: "/v1/system/release/metrics",
        headers: {
          authorization: `Bearer ${login.json().access_token as string}`
        }
      });
      expect(allowed.statusCode).toBe(200);
    } finally {
      await relaxedServer.app.close();
    }
  });
});
