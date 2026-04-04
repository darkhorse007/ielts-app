import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("account minor guardian routes", () => {
  const nextEmail = () => `minor-guardian-${crypto.randomUUID()}@example.com`;

  const build = async () => {
    const server = buildServer({
      enableInternalDebugRoutes: true
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

  const minutesAgo = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();

  const registerAndLogin = async (email = nextEmail()) => {
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
        device_id: "iphone"
      }
    });
    expect(login.statusCode).toBe(200);

    return {
      email,
      userId: register.json().user_id as string,
      accessToken: login.json().access_token as string
    };
  };

  test("persists minor guardian profile state and acknowledgment through authenticated account routes", async () => {
    const user = await registerAndLogin();
    const accessToken = user.accessToken;

    const initialProfile = await context.app.inject({
      method: "GET",
      url: "/v1/users/me/profile",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(initialProfile.statusCode).toBe(200);
    expect(initialProfile.json().system_roles).toEqual(["learner"]);
    expect(initialProfile.json().minor_guardian).toMatchObject({
      age_band: "unknown"
    });

    const updated = await context.app.inject({
      method: "PUT",
      url: "/v1/users/me/minor-guardian",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        age_band: "under_18",
        source: "account"
      }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().minor_guardian).toMatchObject({
      age_band: "under_18",
      source: "account"
    });

    const supportRequest = await context.app.inject({
      method: "POST",
      url: "/v1/users/me/minor-guardian/support-requests",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        topic: "data_deletion",
        contact_channel: "email",
        contact_value: "guardian@example.com",
        message: "请协助了解监护人如何发起删除与导出。"
      }
    });
    expect(supportRequest.statusCode).toBe(201);
    expect(supportRequest.json().request).toMatchObject({
      topic: "data_deletion",
      contact_channel: "email",
      contact_value: "guardian@example.com",
      status: "pending_review"
    });

    const supportRequestList = await context.app.inject({
      method: "GET",
      url: "/v1/users/me/minor-guardian/support-requests",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(supportRequestList.statusCode).toBe(200);
    expect(supportRequestList.json().total_count).toBe(1);
    expect(supportRequestList.json().items[0]).toMatchObject({
      topic: "data_deletion",
      contact_channel: "email"
    });

    const acknowledged = await context.app.inject({
      method: "POST",
      url: "/v1/users/me/minor-guardian/acknowledge",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(acknowledged.statusCode).toBe(200);
    expect(acknowledged.json().minor_guardian).toMatchObject({
      age_band: "under_18",
      guardian_notice_accepted_user_id: user.userId
    });
    expect(typeof acknowledged.json().minor_guardian.guardian_notice_accepted_at).toBe("string");

    const profile = await context.app.inject({
      method: "GET",
      url: "/v1/users/me/profile",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().system_roles).toEqual(["learner"]);
    expect(profile.json().minor_guardian).toMatchObject({
      age_band: "under_18",
      source: "account",
      guardian_notice_accepted_user_id: user.userId
    });
  });

  test("lists and updates guardian support requests through internal debug routes", async () => {
    const firstUser = await registerAndLogin();
    const secondUser = await registerAndLogin();
    const opsUser = await registerAndLogin(`ops-reviewer-${crypto.randomUUID()}@example.com`);

    const firstMinorGuardian = await context.app.inject({
      method: "PUT",
      url: "/v1/users/me/minor-guardian",
      headers: {
        authorization: `Bearer ${firstUser.accessToken}`
      },
      payload: {
        age_band: "under_18",
        source: "account"
      }
    });
    expect(firstMinorGuardian.statusCode).toBe(200);

    const firstSupportRequest = await context.app.inject({
      method: "POST",
      url: "/v1/users/me/minor-guardian/support-requests",
      headers: {
        authorization: `Bearer ${firstUser.accessToken}`
      },
      payload: {
        topic: "usage_concern",
        contact_channel: "phone",
        contact_value: "13800000000",
        message: "希望客服联系监护人确认未成年学习时长限制。"
      }
    });
    expect(firstSupportRequest.statusCode).toBe(201);
    const firstRequestId = firstSupportRequest.json().request.request_id as string;

    const secondSupportRequest = await context.app.inject({
      method: "POST",
      url: "/v1/users/me/minor-guardian/support-requests",
      headers: {
        authorization: `Bearer ${secondUser.accessToken}`
      },
      payload: {
        topic: "account_review",
        contact_channel: "email",
        contact_value: "guardian2@example.com",
        message: "需要了解账号审查和导出申请处理进度。"
      }
    });
    expect(secondSupportRequest.statusCode).toBe(201);
    const secondRequestId = secondSupportRequest.json().request.request_id as string;

    const firstUserRecord = context.store.usersById.get(firstUser.userId);
    expect(firstUserRecord?.minorGuardianSupportRequests).toBeDefined();
    if (firstUserRecord?.minorGuardianSupportRequests?.[0]) {
      firstUserRecord.minorGuardianSupportRequests[0].updatedAt = minutesAgo(95);
    }
    const secondUserRecord = context.store.usersById.get(secondUser.userId);
    expect(secondUserRecord?.minorGuardianSupportRequests).toBeDefined();
    if (secondUserRecord?.minorGuardianSupportRequests?.[0]) {
      secondUserRecord.minorGuardianSupportRequests[0].updatedAt = minutesAgo(130);
    }

    const internalListForbidden = await context.app.inject({
      method: "GET",
      url: "/internal/minor-guardian/support-requests",
      headers: {
        authorization: `Bearer ${firstUser.accessToken}`
      }
    });
    expect(internalListForbidden.statusCode).toBe(403);
    expect(internalListForbidden.json().code).toBe("FORBIDDEN");

    const internalList = await context.app.inject({
      method: "GET",
      url: "/internal/minor-guardian/support-requests",
      headers: {
        authorization: `Bearer ${opsUser.accessToken}`
      }
    });
    expect(internalList.statusCode).toBe(200);
    expect(internalList.json().total_count).toBe(2);
    expect(internalList.json().status_summary).toMatchObject({
      pending_review: 2,
      contacted: 0,
      closed: 0
    });
    expect(internalList.json().sla_summary).toMatchObject({
      within_sla: 0,
      due_soon: 1,
      breached: 1
    });
    const listedFirstRequest = (internalList.json().items as Array<Record<string, unknown>>).find(
      (item) => item.request_id === firstRequestId
    );
    expect(listedFirstRequest).toBeDefined();
    expect(listedFirstRequest).toMatchObject({
      user_id: firstUser.userId,
      user_status: "active",
      minor_guardian_age_band: "under_18",
      status: "pending_review",
      sla_state: "due_soon"
    });
    expect(listedFirstRequest).not.toHaveProperty("handled_by");

    const updateToContacted = await context.app.inject({
      method: "PATCH",
      url: `/internal/minor-guardian/support-requests/${firstRequestId}`,
      headers: {
        authorization: `Bearer ${opsUser.accessToken}`
      },
      payload: {
        status: "contacted",
        handled_by: "ops-reviewer-1",
        operator_note: "已通过电话联系监护人，等待回执。"
      }
    });
    expect(updateToContacted.statusCode).toBe(200);
    expect(updateToContacted.json().request).toMatchObject({
      request_id: firstRequestId,
      user_id: firstUser.userId,
      status: "contacted",
      handled_by: "ops-reviewer-1",
      operator_note: "已通过电话联系监护人，等待回执。"
    });

    const contactedList = await context.app.inject({
      method: "GET",
      url: "/internal/minor-guardian/support-requests?status=contacted",
      headers: {
        authorization: `Bearer ${opsUser.accessToken}`
      }
    });
    expect(contactedList.statusCode).toBe(200);
    expect(contactedList.json().total_count).toBe(1);
    expect(contactedList.json().status_summary).toMatchObject({
      pending_review: 1,
      contacted: 1,
      closed: 0
    });
    expect(contactedList.json().sla_summary).toMatchObject({
      within_sla: 1,
      due_soon: 0,
      breached: 1
    });
    expect(contactedList.json().items[0]).toMatchObject({
      request_id: firstRequestId,
      status: "contacted",
      sla_state: "within_sla"
    });

    const breachedList = await context.app.inject({
      method: "GET",
      url: "/internal/minor-guardian/support-requests?sla_state=breached",
      headers: {
        authorization: `Bearer ${opsUser.accessToken}`
      }
    });
    expect(breachedList.statusCode).toBe(200);
    expect(breachedList.json().total_count).toBe(1);
    expect(breachedList.json().items[0]).toMatchObject({
      topic: "account_review",
      sla_state: "breached"
    });

    const handledByList = await context.app.inject({
      method: "GET",
      url: "/internal/minor-guardian/support-requests?handled_by=ops-reviewer-1",
      headers: {
        authorization: `Bearer ${opsUser.accessToken}`
      }
    });
    expect(handledByList.statusCode).toBe(200);
    expect(handledByList.json().total_count).toBe(1);
    expect(handledByList.json().status_summary).toMatchObject({
      pending_review: 0,
      contacted: 1,
      closed: 0
    });
    expect(handledByList.json().items[0]).toMatchObject({
      request_id: firstRequestId,
      handled_by: "ops-reviewer-1"
    });

    const unassignedList = await context.app.inject({
      method: "GET",
      url: "/internal/minor-guardian/support-requests?unassigned=true",
      headers: {
        authorization: `Bearer ${opsUser.accessToken}`
      }
    });
    expect(unassignedList.statusCode).toBe(200);
    expect(unassignedList.json().total_count).toBe(1);
    expect(unassignedList.json().status_summary).toMatchObject({
      pending_review: 1,
      contacted: 0,
      closed: 0
    });
    expect(unassignedList.json().items[0]).toMatchObject({
      topic: "account_review",
      contact_value: "guardian2@example.com"
    });

    const slaPriorityList = await context.app.inject({
      method: "GET",
      url: "/internal/minor-guardian/support-requests?order_by=sla_priority_desc",
      headers: {
        authorization: `Bearer ${opsUser.accessToken}`
      }
    });
    expect(slaPriorityList.statusCode).toBe(200);
    expect(slaPriorityList.json()).toMatchObject({
      total_count: 2,
      ordered_by: "sla_priority_desc"
    });
    expect(slaPriorityList.json().items[0]).toMatchObject({
      request_id: secondRequestId,
      sla_state: "breached"
    });
    expect(slaPriorityList.json().items[1]).toMatchObject({
      request_id: firstRequestId,
      sla_state: "within_sla"
    });

    const paginatedFirstPage = await context.app.inject({
      method: "GET",
      url: "/internal/minor-guardian/support-requests?page=1&page_size=1",
      headers: {
        authorization: `Bearer ${opsUser.accessToken}`
      }
    });
    expect(paginatedFirstPage.statusCode).toBe(200);
    expect(paginatedFirstPage.json()).toMatchObject({
      total_count: 2,
      page: 1,
      page_size: 1,
      has_next_page: true,
      ordered_by: "updated_at_desc",
      status_summary: {
        pending_review: 1,
        contacted: 1,
        closed: 0
      }
    });
    expect(paginatedFirstPage.json().items[0]).toMatchObject({
      request_id: firstRequestId,
      status: "contacted"
    });

    const paginatedSecondPage = await context.app.inject({
      method: "GET",
      url: "/internal/minor-guardian/support-requests?page=2&page_size=1",
      headers: {
        authorization: `Bearer ${opsUser.accessToken}`
      }
    });
    expect(paginatedSecondPage.statusCode).toBe(200);
    expect(paginatedSecondPage.json()).toMatchObject({
      total_count: 2,
      page: 2,
      page_size: 1,
      has_next_page: false,
      ordered_by: "updated_at_desc",
      status_summary: {
        pending_review: 1,
        contacted: 1,
        closed: 0
      }
    });
    expect(paginatedSecondPage.json().items[0]).toMatchObject({
      topic: "account_review",
      contact_value: "guardian2@example.com"
    });

    const exportedContacted = await context.app.inject({
      method: "GET",
      url: "/internal/minor-guardian/support-requests/export?status=contacted",
      headers: {
        authorization: `Bearer ${opsUser.accessToken}`
      }
    });
    expect(exportedContacted.statusCode).toBe(200);
    expect(exportedContacted.headers["content-type"]).toContain("text/csv");
    expect(exportedContacted.headers["content-disposition"]).toContain("minor-guardian-support-requests-");
    expect(exportedContacted.body).toContain("request_id,user_id,user_email");
    expect(exportedContacted.body).toContain(firstRequestId);
    expect(exportedContacted.body).not.toContain("guardian2@example.com");

    const queriedByContact = await context.app.inject({
      method: "GET",
      url: "/internal/minor-guardian/support-requests?q=guardian2@example.com",
      headers: {
        authorization: `Bearer ${opsUser.accessToken}`
      }
    });
    expect(queriedByContact.statusCode).toBe(200);
    expect(queriedByContact.json().total_count).toBe(1);
    expect(queriedByContact.json().status_summary).toMatchObject({
      pending_review: 1,
      contacted: 0,
      closed: 0
    });
    expect(queriedByContact.json().items[0]).toMatchObject({
      topic: "account_review",
      contact_value: "guardian2@example.com"
    });

    const bulkClosed = await context.app.inject({
      method: "PATCH",
      url: "/internal/minor-guardian/support-requests/bulk",
      headers: {
        authorization: `Bearer ${opsUser.accessToken}`
      },
      payload: {
        request_ids: [firstRequestId, secondRequestId],
        status: "closed",
        handled_by: "ops-reviewer-2",
        operator_note: "已统一完成监护人回访并关闭工单。"
      }
    });
    expect(bulkClosed.statusCode).toBe(200);
    expect(bulkClosed.json()).toMatchObject({
      updated_count: 2,
      request_ids: [firstRequestId, secondRequestId]
    });
    expect(bulkClosed.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          request_id: firstRequestId,
          status: "closed",
          handled_by: "ops-reviewer-2",
          operator_note: "已统一完成监护人回访并关闭工单。"
        }),
        expect.objectContaining({
          request_id: secondRequestId,
          status: "closed",
          handled_by: "ops-reviewer-2",
          minor_guardian_age_band: "unknown"
        })
      ])
    );

    const closedList = await context.app.inject({
      method: "GET",
      url: "/internal/minor-guardian/support-requests?status=closed",
      headers: {
        authorization: `Bearer ${opsUser.accessToken}`
      }
    });
    expect(closedList.statusCode).toBe(200);
    expect(closedList.json().total_count).toBe(2);
    expect(closedList.json().status_summary).toMatchObject({
      pending_review: 0,
      contacted: 0,
      closed: 2
    });

    const invalidPage = await context.app.inject({
      method: "GET",
      url: "/internal/minor-guardian/support-requests?page=0",
      headers: {
        authorization: `Bearer ${opsUser.accessToken}`
      }
    });
    expect(invalidPage.statusCode).toBe(400);
    expect(invalidPage.json().code).toBe("VALIDATION_ERROR");

    const invalidAssignment = await context.app.inject({
      method: "GET",
      url: "/internal/minor-guardian/support-requests?handled_by=ops-reviewer-1&unassigned=true",
      headers: {
        authorization: `Bearer ${opsUser.accessToken}`
      }
    });
    expect(invalidAssignment.statusCode).toBe(400);
    expect(invalidAssignment.json().code).toBe("VALIDATION_ERROR");

    const invalidRollback = await context.app.inject({
      method: "PATCH",
      url: `/internal/minor-guardian/support-requests/${firstRequestId}`,
      headers: {
        authorization: `Bearer ${opsUser.accessToken}`
      },
      payload: {
        status: "pending_review",
        handled_by: "ops-reviewer-2"
      }
    });
    expect(invalidRollback.statusCode).toBe(409);
    expect(invalidRollback.json().code).toBe("MINOR_GUARDIAN_SUPPORT_REQUEST_STATUS_TRANSITION_INVALID");
  });
});
