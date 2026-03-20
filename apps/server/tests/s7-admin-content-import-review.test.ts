import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("S7 admin content import and review workflow", () => {
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

  test("supports batch import with validation failures and review publish flow", async () => {
    const opsToken = await loginAdmin("ops@example.com", "OpsPass123");

    const imported = await context.app.inject({
      method: "POST",
      url: "/v1/admin/content/import/batches",
      headers: {
        authorization: `Bearer ${opsToken}`
      },
      payload: {
        template_version: "template-v1",
        items: [
          {
            title: "Imported Reading Set X",
            skill: "reading",
            payload: {
              question_count: 12
            }
          },
          {
            title: "Broken Listening Set X",
            skill: "listening",
            payload: {
              question_count: 0
            }
          }
        ]
      }
    });
    expect(imported.statusCode).toBe(201);
    expect(imported.json().imported_count).toBe(1);
    expect(imported.json().failed_count).toBe(1);
    const itemId = imported.json().imported_items[0].item_id as string;

    const publishBeforeReview = await context.app.inject({
      method: "POST",
      url: `/v1/admin/content/items/${itemId}/publish`,
      headers: {
        authorization: `Bearer ${opsToken}`
      },
      payload: {
        note: "should fail without review"
      }
    });
    expect(publishBeforeReview.statusCode).toBe(409);
    expect(publishBeforeReview.json().code).toBe("CONTENT_REVIEW_REQUIRED");

    const reviewed = await context.app.inject({
      method: "POST",
      url: `/v1/admin/content/items/${itemId}/review`,
      headers: {
        authorization: `Bearer ${opsToken}`
      },
      payload: {
        decision: "approve",
        note: "approved by reviewer",
        auto_publish: true
      }
    });
    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json().review_status).toBe("approved");
    expect(reviewed.json().published).toBe(true);
    expect(reviewed.json().status).toBe("published");
  });

  test("supports rollback of imported batch and blocks rollback for published items", async () => {
    const opsToken = await loginAdmin("ops@example.com", "OpsPass123");

    const imported = await context.app.inject({
      method: "POST",
      url: "/v1/admin/content/import/batches",
      headers: {
        authorization: `Bearer ${opsToken}`
      },
      payload: {
        template_version: "template-v1",
        items: [
          {
            title: "Imported Reading Set Y",
            skill: "reading",
            payload: {
              question_count: 10
            }
          },
          {
            title: "Imported Speaking Set Y",
            skill: "speaking",
            payload: {
              question_count: 8
            }
          }
        ]
      }
    });
    expect(imported.statusCode).toBe(201);
    const batchId = imported.json().batch_id as string;
    const firstItemId = imported.json().imported_items[0].item_id as string;

    const approved = await context.app.inject({
      method: "POST",
      url: `/v1/admin/content/items/${firstItemId}/review`,
      headers: {
        authorization: `Bearer ${opsToken}`
      },
      payload: {
        decision: "approve",
        auto_publish: true
      }
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().status).toBe("published");

    const rollbackConflict = await context.app.inject({
      method: "POST",
      url: `/v1/admin/content/import/batches/${batchId}/rollback`,
      headers: {
        authorization: `Bearer ${opsToken}`
      }
    });
    expect(rollbackConflict.statusCode).toBe(409);
    expect(rollbackConflict.json().code).toBe("CONTENT_IMPORT_ROLLBACK_FORBIDDEN_PUBLISHED");

    const secondItemId = imported.json().imported_items[1].item_id as string;
    const rollbackSecondOnly = await context.app.inject({
      method: "POST",
      url: `/v1/admin/content/import/batches/${batchId}/rollback`,
      headers: {
        authorization: `Bearer ${opsToken}`
      },
      payload: {
        item_ids: [secondItemId]
      }
    });
    expect(rollbackSecondOnly.statusCode).toBe(200);
    expect(rollbackSecondOnly.json().rollback_count).toBe(1);
    expect(rollbackSecondOnly.json().status).toBe("partial_rolled_back");
  });
});
