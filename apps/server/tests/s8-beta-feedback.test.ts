import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("S8 beta channel and feedback workflow", () => {
  const addHours = (value: string, hours: number): string => new Date(Date.parse(value) + hours * 60 * 60 * 1000).toISOString();

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

  const registerAndLogin = async (prefix = "beta"): Promise<{
    userId: string;
    accessToken: string;
  }> => {
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
    const userId = register.json().user_id as string;

    const login = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: email,
        password: "StrongPass123",
        device_id: "web"
      }
    });
    expect(login.statusCode).toBe(200);
    return {
      userId,
      accessToken: login.json().access_token as string
    };
  };

  test("supports beta whitelist management, auto release mapping, and one-click priority escalation", async () => {
    const releaseManager = await registerAndLogin("admin-release-manager");
    const betaUser = await registerAndLogin("ops-beta-user");

    const whitelist = await context.app.inject({
      method: "PUT",
      url: `/v1/system/beta/whitelist/${betaUser.userId}`,
      headers: {
        authorization: `Bearer ${releaseManager.accessToken}`
      },
      payload: {
        release_id: "REL-S8-BETA-001",
        status: "active",
        note: "invited to beta"
      }
    });
    expect(whitelist.statusCode).toBe(200);
    expect(whitelist.json().release_id).toBe("REL-S8-BETA-001");

    const whitelistList = await context.app.inject({
      method: "GET",
      url: `/v1/system/beta/whitelist?user_id=${betaUser.userId}`,
      headers: {
        authorization: `Bearer ${releaseManager.accessToken}`
      }
    });
    expect(whitelistList.statusCode).toBe(200);
    expect(whitelistList.json().total).toBe(1);

    const submitted = await context.app.inject({
      method: "POST",
      url: "/v1/system/beta/feedback",
      headers: {
        authorization: `Bearer ${betaUser.accessToken}`
      },
      payload: {
        title: "Beta build crash on dashboard",
        description: "Open dashboard tab and app crashes instantly.",
        category: "bug",
        severity: "high",
        app_version: "ios-beta-1.0.0"
      }
    });
    expect(submitted.statusCode).toBe(201);
    expect(submitted.json().release_id).toBe("REL-S8-BETA-001");
    expect(submitted.json().priority).toBe("high");
    const feedbackId = submitted.json().feedback_id as string;

    const queried = await context.app.inject({
      method: "GET",
      url: "/v1/system/beta/feedback?release_id=REL-S8-BETA-001",
      headers: {
        authorization: `Bearer ${releaseManager.accessToken}`
      }
    });
    expect(queried.statusCode).toBe(200);
    expect(queried.json().total).toBe(1);
    expect(queried.json().items[0].feedback_id).toBe(feedbackId);

    const escalated = await context.app.inject({
      method: "POST",
      url: `/v1/system/beta/feedback/${feedbackId}/escalate`,
      headers: {
        authorization: `Bearer ${releaseManager.accessToken}`
      },
      payload: {
        priority: "critical",
        reason: "one-click escalation after triage"
      }
    });
    expect(escalated.statusCode).toBe(200);
    expect(escalated.json().priority).toBe("critical");
    expect(escalated.json().status).toBe("triaged");
    expect(escalated.json().escalated_by_user_id).toBe(releaseManager.userId);

    const criticalOnly = await context.app.inject({
      method: "GET",
      url: "/v1/system/beta/feedback?priority=critical",
      headers: {
        authorization: `Bearer ${releaseManager.accessToken}`
      }
    });
    expect(criticalOnly.statusCode).toBe(200);
    expect(criticalOnly.json().total).toBe(1);

    const audit = await context.app.inject({
      method: "GET",
      url: "/internal/audit-events"
    });
    expect(audit.statusCode).toBe(200);
    const types = (audit.json().items as Array<{ type: string }>).map((item) => item.type);
    expect(types).toContain("beta_whitelist_upserted");
    expect(types).toContain("beta_feedback_submitted");
    expect(types).toContain("beta_feedback_priority_escalated");
  });

  test("blocks non-beta users from feedback submission and handles unknown feedback escalation", async () => {
    const user = await registerAndLogin("admin-triage");

    const denied = await context.app.inject({
      method: "POST",
      url: "/v1/system/beta/feedback",
      headers: {
        authorization: `Bearer ${user.accessToken}`
      },
      payload: {
        title: "Need feature",
        description: "Please add quick sync.",
        category: "other",
        severity: "low"
      }
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().code).toBe("BETA_ACCESS_DENIED");

    const notFoundEscalation = await context.app.inject({
      method: "POST",
      url: `/v1/system/beta/feedback/${crypto.randomUUID()}/escalate`,
      headers: {
        authorization: `Bearer ${user.accessToken}`
      },
      payload: {
        priority: "high",
        reason: "manual escalation"
      }
    });
    expect(notFoundEscalation.statusCode).toBe(404);
    expect(notFoundEscalation.json().code).toBe("BETA_FEEDBACK_NOT_FOUND");
  });

  test("exports beta cohort metrics and csv evidence from persisted analytics, whitelist and feedback data", async () => {
    const releaseManager = await registerAndLogin("admin-cohort-manager");
    const activeUser = await registerAndLogin("ops-cohort-active");
    const inactiveUser = await registerAndLogin("ops-cohort-inactive");
    const disabledUser = await registerAndLogin("ops-cohort-disabled");
    const managerAuth = {
      authorization: `Bearer ${releaseManager.accessToken}`
    };

    const activeWhitelist = await context.app.inject({
      method: "PUT",
      url: `/v1/system/beta/whitelist/${activeUser.userId}`,
      headers: managerAuth,
      payload: {
        release_id: "REL-S8-COHORT-001",
        status: "active"
      }
    });
    expect(activeWhitelist.statusCode).toBe(200);

    const inactiveWhitelist = await context.app.inject({
      method: "PUT",
      url: `/v1/system/beta/whitelist/${inactiveUser.userId}`,
      headers: managerAuth,
      payload: {
        release_id: "REL-S8-COHORT-001",
        status: "active"
      }
    });
    expect(inactiveWhitelist.statusCode).toBe(200);

    const disabledWhitelist = await context.app.inject({
      method: "PUT",
      url: `/v1/system/beta/whitelist/${disabledUser.userId}`,
      headers: managerAuth,
      payload: {
        release_id: "REL-S8-COHORT-001",
        status: "disabled"
      }
    });
    expect(disabledWhitelist.statusCode).toBe(200);

    const activeInviteAt = activeWhitelist.json().created_at as string;
    const inactiveInviteAt = inactiveWhitelist.json().created_at as string;

    const activeAnalytics = await context.app.inject({
      method: "POST",
      url: "/v1/analytics/events/batch",
      headers: {
        authorization: `Bearer ${activeUser.accessToken}`
      },
      payload: {
        events: [
          {
            platform: "web",
            event_type: "onboarding_submitted",
            trace_id: "cohort-active-01",
            created_at: addHours(activeInviteAt, 1)
          },
          {
            platform: "web",
            event_type: "diagnostic_completed",
            trace_id: "cohort-active-02",
            created_at: addHours(activeInviteAt, 2)
          },
          {
            platform: "ios",
            event_type: "practice_submitted",
            trace_id: "cohort-active-03",
            created_at: addHours(activeInviteAt, 72)
          },
          {
            platform: "ios",
            event_type: "writing_evaluated",
            trace_id: "cohort-active-04",
            created_at: addHours(activeInviteAt, 156)
          },
          {
            platform: "ios",
            event_type: "mock_exam_submitted",
            trace_id: "cohort-active-05",
            created_at: addHours(activeInviteAt, 192)
          }
        ]
      }
    });
    expect(activeAnalytics.statusCode).toBe(202);
    expect(activeAnalytics.json().accepted_count).toBe(5);

    const inactiveAnalytics = await context.app.inject({
      method: "POST",
      url: "/v1/analytics/events/batch",
      headers: {
        authorization: `Bearer ${inactiveUser.accessToken}`
      },
      payload: {
        events: [
          {
            platform: "web",
            event_type: "onboarding_submitted",
            trace_id: "cohort-inactive-01",
            created_at: addHours(inactiveInviteAt, 4)
          }
        ]
      }
    });
    expect(inactiveAnalytics.statusCode).toBe(202);
    expect(inactiveAnalytics.json().accepted_count).toBe(1);

    const criticalFeedback = await context.app.inject({
      method: "POST",
      url: "/v1/system/beta/feedback",
      headers: {
        authorization: `Bearer ${activeUser.accessToken}`
      },
      payload: {
        title: "critical cohort blocker",
        description: "core flow still has release blocker",
        category: "bug",
        severity: "high"
      }
    });
    expect(criticalFeedback.statusCode).toBe(201);

    const criticalFeedbackId = criticalFeedback.json().feedback_id as string;
    const criticalEscalation = await context.app.inject({
      method: "POST",
      url: `/v1/system/beta/feedback/${criticalFeedbackId}/escalate`,
      headers: managerAuth,
      payload: {
        priority: "critical",
        reason: "beta cohort export should count unresolved critical"
      }
    });
    expect(criticalEscalation.statusCode).toBe(200);

    const highFeedback = await context.app.inject({
      method: "POST",
      url: "/v1/system/beta/feedback",
      headers: {
        authorization: `Bearer ${inactiveUser.accessToken}`
      },
      payload: {
        title: "high severity feedback",
        description: "still unresolved after SLA window",
        category: "performance",
        severity: "high"
      }
    });
    expect(highFeedback.statusCode).toBe(201);

    const highFeedbackId = highFeedback.json().feedback_id as string;
    const staleFeedback = context.releaseRepository.betaFeedbacksById.get(highFeedbackId);
    expect(staleFeedback).toBeTruthy();
    if (!staleFeedback) {
      throw new Error("Expected beta feedback to be present in repository");
    }
    const staleCreatedAt = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    staleFeedback.createdAt = staleCreatedAt;
    staleFeedback.updatedAt = staleCreatedAt;
    context.releaseRepository.betaFeedbacksById.set(staleFeedback.id, staleFeedback);

    const metrics = await context.app.inject({
      method: "GET",
      url: "/v1/system/beta/cohort/metrics?release_id=REL-S8-COHORT-001",
      headers: managerAuth
    });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.json().invited_users).toBe(2);
    expect(metrics.json().disabled_users).toBe(1);
    expect(metrics.json().eligible_active_users).toBe(2);
    expect(metrics.json().internal_feedback_total).toBe(2);
    expect(metrics.json().unresolved_critical_feedback).toBe(1);
    expect(metrics.json().unresolved_high_feedback_older_than_48h).toBe(1);
    expect(metrics.json().invited_to_activation_users).toBe(1);
    expect(metrics.json().invited_to_activation_rate).toBe(50);
    expect(metrics.json().d7_retained_users).toBe(1);
    expect(metrics.json().d7_retention_rate).toBe(50);
    expect(metrics.json().week1_task_completed_users).toBe(1);
    expect(metrics.json().week1_task_completion_rate).toBe(50);
    expect(metrics.json().first_mock_completed_users).toBe(1);
    expect(metrics.json().first_mock_completion_rate).toBe(50);

    const jsonExport = await context.app.inject({
      method: "GET",
      url: "/v1/system/beta/cohort/export?release_id=REL-S8-COHORT-001",
      headers: managerAuth
    });
    expect(jsonExport.statusCode).toBe(200);
    expect(jsonExport.json().metrics.invited_users).toBe(2);
    expect(jsonExport.json().users).toHaveLength(3);
    const activeRow = (jsonExport.json().users as Array<Record<string, unknown>>).find(
      (item) => item.user_id === activeUser.userId
    );
    expect(activeRow).toBeTruthy();
    expect(activeRow?.activation_qualified).toBe(true);
    expect(activeRow?.d7_retained).toBe(true);
    expect(activeRow?.week1_core_learning_event_count).toBe(3);
    expect(activeRow?.first_mock_completion_qualified).toBe(true);
    expect(activeRow?.highest_open_feedback_priority).toBe("critical");

    const disabledRow = (jsonExport.json().users as Array<Record<string, unknown>>).find(
      (item) => item.user_id === disabledUser.userId
    );
    expect(disabledRow?.whitelist_status).toBe("disabled");

    const csvExport = await context.app.inject({
      method: "GET",
      url: "/v1/system/beta/cohort/export?release_id=REL-S8-COHORT-001&format=csv",
      headers: managerAuth
    });
    expect(csvExport.statusCode).toBe(200);
    expect(csvExport.headers["content-type"]).toContain("text/csv");
    expect(csvExport.headers["content-disposition"]).toContain("beta-cohort-REL-S8-COHORT-001");
    expect(csvExport.body).toContain("release_id,REL-S8-COHORT-001");
    expect(csvExport.body).toContain(activeUser.userId);
    expect(csvExport.body).toContain("highest_open_feedback_priority");
    expect(csvExport.body).toContain("critical");
  });
});
