import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("S7 admin dual-review workflow", () => {
  const nextEmail = () => `candidate-${crypto.randomUUID()}@example.com`;

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

  const registerAndLoginUser = async () => {
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
    return login.json() as {
      access_token: string;
      user_id: string;
    };
  };

  const loginAdmin = async (email: string, password: string): Promise<string> => {
    const login = await context.app.inject({
      method: "POST",
      url: "/v1/admin/auth/login",
      payload: {
        email,
        password
      }
    });
    expect(login.statusCode).toBe(200);
    return login.json().access_token as string;
  };

  test("supports dual-review approval and enforces second approver", async () => {
    const userForFreeze = await registerAndLoginUser();
    const userForAdjust = await registerAndLoginUser();

    const opsToken = await loginAdmin("ops@example.com", "OpsPass123");
    const financeToken = await loginAdmin("finance@example.com", "FinancePass123");
    const superToken = await loginAdmin("admin@example.com", "AdminPass123");

    const freezeReview = await context.app.inject({
      method: "POST",
      url: "/v1/admin/reviews",
      headers: {
        authorization: `Bearer ${opsToken}`
      },
      payload: {
        operation_type: "user_freeze",
        request_reason: "risk control requires second review",
        target_user_id: userForFreeze.user_id,
        freeze: {
          reason: "risk control freeze"
        }
      }
    });
    expect(freezeReview.statusCode).toBe(201);
    const freezeReviewId = freezeReview.json().review_id as string;

    const selfApprove = await context.app.inject({
      method: "POST",
      url: `/v1/admin/reviews/${freezeReviewId}/approve`,
      headers: {
        authorization: `Bearer ${opsToken}`
      },
      payload: {
        comment: "self approve should fail"
      }
    });
    expect(selfApprove.statusCode).toBe(409);

    const forbiddenApprove = await context.app.inject({
      method: "POST",
      url: `/v1/admin/reviews/${freezeReviewId}/approve`,
      headers: {
        authorization: `Bearer ${financeToken}`
      },
      payload: {
        comment: "finance cannot freeze users"
      }
    });
    expect(forbiddenApprove.statusCode).toBe(403);

    const approvedFreeze = await context.app.inject({
      method: "POST",
      url: `/v1/admin/reviews/${freezeReviewId}/approve`,
      headers: {
        authorization: `Bearer ${superToken}`
      },
      payload: {
        comment: "approved by super admin"
      }
    });
    expect(approvedFreeze.statusCode).toBe(200);
    expect(approvedFreeze.json().status).toBe("approved");
    expect(approvedFreeze.json().execution.success).toBe(true);
    expect(approvedFreeze.json().execution.result.status).toBe("frozen");

    const frozenUser = context.store.usersById.get(userForFreeze.user_id);
    expect(frozenUser?.status).toBe("frozen");

    const adjustReview = await context.app.inject({
      method: "POST",
      url: "/v1/admin/reviews",
      headers: {
        authorization: `Bearer ${financeToken}`
      },
      payload: {
        operation_type: "entitlement_adjust",
        request_reason: "manual entitlement correction requires review",
        target_user_id: userForAdjust.user_id,
        entitlement_adjust: {
          reason: "customer escalation",
          set_tier: "pro",
          delta_days: 30
        }
      }
    });
    expect(adjustReview.statusCode).toBe(201);
    const adjustReviewId = adjustReview.json().review_id as string;

    const approvedAdjust = await context.app.inject({
      method: "POST",
      url: `/v1/admin/reviews/${adjustReviewId}/approve`,
      headers: {
        authorization: `Bearer ${superToken}`
      },
      payload: {
        comment: "approved by super admin"
      }
    });
    expect(approvedAdjust.statusCode).toBe(200);
    expect(approvedAdjust.json().status).toBe("approved");
    expect(approvedAdjust.json().execution.result.entitlement_tier).toBe("pro");

    const entitlement = context.store.subscriptionEntitlementsByUserId.get(userForAdjust.user_id);
    expect(entitlement?.tier).toBe("pro");

    const contentItem = Array.from(context.store.contentItemsById.values())[0];
    expect(contentItem).toBeDefined();

    const publishReview = await context.app.inject({
      method: "POST",
      url: "/v1/admin/reviews",
      headers: {
        authorization: `Bearer ${opsToken}`
      },
      payload: {
        operation_type: "content_publish",
        request_reason: "content release requires dual review",
        target_content_item_id: contentItem.id,
        content_publish: {
          note: "publish from review workflow"
        }
      }
    });
    expect(publishReview.statusCode).toBe(201);
    const publishReviewId = publishReview.json().review_id as string;

    const approvedPublish = await context.app.inject({
      method: "POST",
      url: `/v1/admin/reviews/${publishReviewId}/approve`,
      headers: {
        authorization: `Bearer ${superToken}`
      }
    });
    expect(approvedPublish.statusCode).toBe(200);
    expect(approvedPublish.json().status).toBe("approved");
    expect(approvedPublish.json().execution.result.status).toBe("published");
  });

  test("supports rejection and review list query", async () => {
    const user = await registerAndLoginUser();
    const financeToken = await loginAdmin("finance@example.com", "FinancePass123");
    const superToken = await loginAdmin("admin@example.com", "AdminPass123");

    const review = await context.app.inject({
      method: "POST",
      url: "/v1/admin/reviews",
      headers: {
        authorization: `Bearer ${financeToken}`
      },
      payload: {
        operation_type: "entitlement_adjust",
        request_reason: "request should be rejected for audit trail",
        target_user_id: user.user_id,
        entitlement_adjust: {
          reason: "temporary request",
          set_tier: "pro"
        }
      }
    });
    expect(review.statusCode).toBe(201);
    const reviewId = review.json().review_id as string;

    const rejected = await context.app.inject({
      method: "POST",
      url: `/v1/admin/reviews/${reviewId}/reject`,
      headers: {
        authorization: `Bearer ${superToken}`
      },
      payload: {
        comment: "insufficient business justification"
      }
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().status).toBe("rejected");

    const approvedAfterReject = await context.app.inject({
      method: "POST",
      url: `/v1/admin/reviews/${reviewId}/approve`,
      headers: {
        authorization: `Bearer ${superToken}`
      }
    });
    expect(approvedAfterReject.statusCode).toBe(409);

    const listRejected = await context.app.inject({
      method: "GET",
      url: "/v1/admin/reviews?status=rejected",
      headers: {
        authorization: `Bearer ${superToken}`
      }
    });
    expect(listRejected.statusCode).toBe(200);
    expect(listRejected.json().items.some((item: { review_id: string }) => item.review_id === reviewId)).toBe(true);
  });
});
