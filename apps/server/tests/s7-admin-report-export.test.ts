import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("S7 admin report export workflow", () => {
  const nextEmail = () => `report-${crypto.randomUUID()}@example.com`;

  const build = async () => {
    const server = buildServer();
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

  const loginAdmin = async (
    email: string,
    password: string
  ): Promise<{
    token: string;
    adminUserId: string;
  }> => {
    const login = await context.app.inject({
      method: "POST",
      url: "/v1/admin/auth/login",
      payload: {
        email,
        password
      }
    });
    expect(login.statusCode).toBe(200);
    return {
      token: login.json().access_token as string,
      adminUserId: login.json().admin_user_id as string
    };
  };

  const registerUser = async (): Promise<{
    userId: string;
    email: string;
  }> => {
    const email = nextEmail();
    const register = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "StrongPass123"
      }
    });
    expect(register.statusCode).toBe(201);
    return {
      userId: register.json().user_id as string,
      email
    };
  };

  test("supports operation report export with time+role filter, masking, and download audit trail", async () => {
    const ops = await loginAdmin("ops@example.com", "OpsPass123");
    const superAdmin = await loginAdmin("admin@example.com", "AdminPass123");
    const user = await registerUser();

    const fromAt = new Date().toISOString();

    const frozen = await context.app.inject({
      method: "POST",
      url: `/v1/admin/users/${user.userId}/freeze`,
      headers: {
        authorization: `Bearer ${ops.token}`
      },
      payload: {
        reason: "risk control freeze"
      }
    });
    expect(frozen.statusCode).toBe(200);

    const toAt = new Date(Date.now() + 60_000).toISOString();

    const financeScoped = await context.app.inject({
      method: "POST",
      url: "/v1/admin/reports/export",
      headers: {
        authorization: `Bearer ${superAdmin.token}`
      },
      payload: {
        report_type: "operation",
        from_at: fromAt,
        to_at: toAt,
        role: "finance"
      }
    });
    expect(financeScoped.statusCode).toBe(201);
    expect(financeScoped.json().row_count).toBe(0);

    const opsScoped = await context.app.inject({
      method: "POST",
      url: "/v1/admin/reports/export",
      headers: {
        authorization: `Bearer ${superAdmin.token}`
      },
      payload: {
        report_type: "operation",
        from_at: fromAt,
        to_at: toAt,
        role: "ops"
      }
    });
    expect(opsScoped.statusCode).toBe(201);
    expect(opsScoped.json().row_count).toBe(1);
    expect(opsScoped.json().masked_fields).toEqual(expect.arrayContaining(["actor_email_masked", "target_user_id_masked"]));

    const exportId = opsScoped.json().export_id as string;
    const downloaded = await context.app.inject({
      method: "GET",
      url: `/v1/admin/reports/exports/${exportId}/download`,
      headers: {
        authorization: `Bearer ${superAdmin.token}`
      }
    });
    expect(downloaded.statusCode).toBe(200);
    expect(downloaded.json().download_count).toBe(1);
    expect(downloaded.json().row_count).toBe(1);
    expect(downloaded.json().content).toContain("admin_user_frozen");

    const maskedEmail = "o***s@example.com";
    const maskedUserId = `${user.userId.slice(0, 4)}***${user.userId.slice(-4)}`;
    expect(downloaded.json().content).toContain(maskedEmail);
    expect(downloaded.json().content).toContain(maskedUserId);
    expect(downloaded.json().content).not.toContain("ops@example.com");
    expect(downloaded.json().content).not.toContain(user.userId);
    expect(downloaded.json().last_downloaded_at).toBeTypeOf("string");

    const audit = await context.app.inject({
      method: "GET",
      url: `/v1/admin/audit-logs?type=admin_report_downloaded&actor_admin_user_id=${superAdmin.adminUserId}`,
      headers: {
        authorization: `Bearer ${superAdmin.token}`
      }
    });
    expect(audit.statusCode).toBe(200);
    const matching = audit
      .json()
      .items.find(
        (item: { metadata: { exportId?: string; adminUserId?: string } }) =>
          item.metadata.exportId === exportId && item.metadata.adminUserId === superAdmin.adminUserId
      );
    expect(matching).toBeDefined();
  });

  test("supports business report export with finance role and validates report range", async () => {
    const finance = await loginAdmin("finance@example.com", "FinancePass123");
    const user = await registerUser();
    const fromAt = new Date().toISOString();

    const adjusted = await context.app.inject({
      method: "POST",
      url: `/v1/admin/entitlements/${user.userId}/adjust`,
      headers: {
        authorization: `Bearer ${finance.token}`
      },
      payload: {
        reason: "manual correction",
        set_tier: "pro",
        delta_days: 30
      }
    });
    expect(adjusted.statusCode).toBe(200);

    const toAt = new Date(Date.now() + 60_000).toISOString();

    const exported = await context.app.inject({
      method: "POST",
      url: "/v1/admin/reports/export",
      headers: {
        authorization: `Bearer ${finance.token}`
      },
      payload: {
        report_type: "business",
        from_at: fromAt,
        to_at: toAt,
        role: "finance"
      }
    });
    expect(exported.statusCode).toBe(201);
    expect(exported.json().row_count).toBe(1);
    expect(exported.json().masked_fields).toEqual(["user_id_masked"]);

    const downloaded = await context.app.inject({
      method: "GET",
      url: `/v1/admin/reports/exports/${exported.json().export_id as string}/download`,
      headers: {
        authorization: `Bearer ${finance.token}`
      }
    });
    expect(downloaded.statusCode).toBe(200);
    expect(downloaded.json().content).toContain("entitlement_adjustment");
    expect(downloaded.json().content).toContain(`${user.userId.slice(0, 4)}***${user.userId.slice(-4)}`);
    expect(downloaded.json().content).not.toContain(user.userId);

    const invalidRange = await context.app.inject({
      method: "POST",
      url: "/v1/admin/reports/export",
      headers: {
        authorization: `Bearer ${finance.token}`
      },
      payload: {
        report_type: "business",
        from_at: toAt,
        to_at: fromAt
      }
    });
    expect(invalidRange.statusCode).toBe(400);
    expect(invalidRange.json().code).toBe("REPORT_RANGE_INVALID");
  });

  test("rejects unauthenticated export and returns not-found for unknown export id", async () => {
    const unauthenticated = await context.app.inject({
      method: "POST",
      url: "/v1/admin/reports/export",
      payload: {
        report_type: "operation"
      }
    });
    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json().code).toBe("ADMIN_UNAUTHORIZED");

    const superAdmin = await loginAdmin("admin@example.com", "AdminPass123");
    const notFound = await context.app.inject({
      method: "GET",
      url: `/v1/admin/reports/exports/${crypto.randomUUID()}/download`,
      headers: {
        authorization: `Bearer ${superAdmin.token}`
      }
    });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json().code).toBe("REPORT_EXPORT_NOT_FOUND");
  });
});
