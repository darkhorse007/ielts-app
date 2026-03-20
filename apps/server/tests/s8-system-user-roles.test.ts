import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("S8 system user role management workflow", () => {
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

  const registerAndLogin = async (prefix = "learner"): Promise<{ userId: string; accessToken: string }> => {
    const email = `${prefix}-${crypto.randomUUID()}@example.com`;
    const register = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "StrongPass123"
      }
    });
    expect(register.statusCode).toBe(201);

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
      userId: register.json().user_id as string,
      accessToken: login.json().access_token as string
    };
  };

  test("allows admin to manage system roles and query role audit logs", async () => {
    const learner = await registerAndLogin("learner");
    const admin = await registerAndLogin("admin");

    const setRoles = await context.app.inject({
      method: "PUT",
      url: `/v1/system/users/${learner.userId}/roles`,
      headers: {
        authorization: `Bearer ${admin.accessToken}`
      },
      payload: {
        roles: ["qa", "ops", "qa"]
      }
    });
    expect(setRoles.statusCode).toBe(200);
    const setRolesBody = setRoles.json();
    expect(setRolesBody.roles).toContain("learner");
    expect(setRolesBody.roles).toContain("qa");
    expect(setRolesBody.roles).toContain("ops");
    expect(new Set(setRolesBody.roles).size).toBe(setRolesBody.roles.length);

    const getRoles = await context.app.inject({
      method: "GET",
      url: `/v1/system/users/${learner.userId}/roles`,
      headers: {
        authorization: `Bearer ${admin.accessToken}`
      }
    });
    expect(getRoles.statusCode).toBe(200);
    expect(getRoles.json().roles).toContain("learner");
    expect(getRoles.json().roles).toContain("qa");
    expect(getRoles.json().roles).toContain("ops");

    const listAudit = await context.app.inject({
      method: "GET",
      url: "/v1/system/users/roles/audit?page=1&page_size=20",
      headers: {
        authorization: `Bearer ${admin.accessToken}`
      }
    });
    expect(listAudit.statusCode).toBe(200);
    expect(listAudit.json().total).toBeGreaterThan(0);
    const matched = (listAudit.json().items as Array<Record<string, unknown>>).find(
      (item) => item.target_user_id === learner.userId
    );
    expect(matched).toBeDefined();
    expect(matched?.operator_user_id).toBe(admin.userId);
    expect(matched?.roles).toContain("qa");

    const filteredAudit = await context.app.inject({
      method: "GET",
      url: `/v1/system/users/roles/audit?target_user_id=${learner.userId}&operator_user_id=${admin.userId}`,
      headers: {
        authorization: `Bearer ${admin.accessToken}`
      }
    });
    expect(filteredAudit.statusCode).toBe(200);
    expect(filteredAudit.json().total).toBeGreaterThan(0);
    for (const item of filteredAudit.json().items as Array<Record<string, unknown>>) {
      expect(item.target_user_id).toBe(learner.userId);
      expect(item.operator_user_id).toBe(admin.userId);
    }
  });

  test("rejects non-admin role management and role-audit query", async () => {
    const learner = await registerAndLogin("learner");
    const qa = await registerAndLogin("qa");

    const getRolesForbidden = await context.app.inject({
      method: "GET",
      url: `/v1/system/users/${learner.userId}/roles`,
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      }
    });
    expect(getRolesForbidden.statusCode).toBe(403);

    const setRolesForbidden = await context.app.inject({
      method: "PUT",
      url: `/v1/system/users/${learner.userId}/roles`,
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      },
      payload: {
        roles: ["qa"]
      }
    });
    expect(setRolesForbidden.statusCode).toBe(403);

    const listAuditForbidden = await context.app.inject({
      method: "GET",
      url: "/v1/system/users/roles/audit",
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      }
    });
    expect(listAuditForbidden.statusCode).toBe(403);
  });

  test("returns validation and not-found for role management paths", async () => {
    const admin = await registerAndLogin("admin");

    const missingUser = await context.app.inject({
      method: "GET",
      url: `/v1/system/users/${crypto.randomUUID()}/roles`,
      headers: {
        authorization: `Bearer ${admin.accessToken}`
      }
    });
    expect(missingUser.statusCode).toBe(404);
    expect(missingUser.json().code).toBe("USER_NOT_FOUND");

    const invalidPayload = await context.app.inject({
      method: "PUT",
      url: `/v1/system/users/${crypto.randomUUID()}/roles`,
      headers: {
        authorization: `Bearer ${admin.accessToken}`
      },
      payload: {
        roles: ["super_admin"]
      }
    });
    expect(invalidPayload.statusCode).toBe(400);
    expect(invalidPayload.json().code).toBe("VALIDATION_ERROR");

    const invalidQuery = await context.app.inject({
      method: "GET",
      url: "/v1/system/users/roles/audit?target_user_id=invalid",
      headers: {
        authorization: `Bearer ${admin.accessToken}`
      }
    });
    expect(invalidQuery.statusCode).toBe(400);
    expect(invalidQuery.json().code).toBe("VALIDATION_ERROR");
  });
});
