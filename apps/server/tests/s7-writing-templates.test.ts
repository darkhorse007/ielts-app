import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("US-6201 writing templates and adoption", () => {
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

  const registerAndLogin = async () => {
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
        device_id: "macbook"
      }
    });
    expect(login.statusCode).toBe(200);
    return login.json().access_token as string;
  };

  test("provides template library and preserves original essay on insertion", async () => {
    const accessToken = await registerAndLogin();

    const list = await context.app.inject({
      method: "GET",
      url: "/v1/writing/templates?task_type=task2",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.length).toBeGreaterThanOrEqual(3);

    const originalEssay =
      "I agree that practical skills should be taught because students need real-world abilities and clearer career readiness.";
    const insert = await context.app.inject({
      method: "POST",
      url: "/v1/writing/templates/task2-balanced-opinion/insert",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        essay: originalEssay,
        insertion_mode: "append"
      }
    });
    expect(insert.statusCode).toBe(200);
    expect(insert.json().preserved_original).toBe(true);
    expect(insert.json().merged_essay).toContain(originalEssay);
    expect(insert.json().merged_essay).toContain("[模板框架]");

    const adoption = await context.app.inject({
      method: "GET",
      url: "/v1/writing/templates/adoption",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(adoption.statusCode).toBe(200);
    expect(adoption.json().total_insertions).toBe(1);
    expect(adoption.json().items[0].template_id).toBe("task2-balanced-opinion");
    expect(adoption.json().items[0].adoption_rate).toBe(1);
  });

  test("returns per-template adoption rate and handles unknown template", async () => {
    const accessToken = await registerAndLogin();
    const essay = "This is my baseline writing paragraph for insertion testing.";

    const insertA1 = await context.app.inject({
      method: "POST",
      url: "/v1/writing/templates/task2-balanced-opinion/insert",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        essay
      }
    });
    expect(insertA1.statusCode).toBe(200);

    const insertA2 = await context.app.inject({
      method: "POST",
      url: "/v1/writing/templates/task2-balanced-opinion/insert",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        essay,
        insertion_mode: "prepend"
      }
    });
    expect(insertA2.statusCode).toBe(200);

    const insertB = await context.app.inject({
      method: "POST",
      url: "/v1/writing/templates/task2-problem-solution/insert",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        essay
      }
    });
    expect(insertB.statusCode).toBe(200);

    const adoption = await context.app.inject({
      method: "GET",
      url: "/v1/writing/templates/adoption",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(adoption.statusCode).toBe(200);
    expect(adoption.json().total_insertions).toBe(3);
    expect(adoption.json().items[0].template_id).toBe("task2-balanced-opinion");
    expect(adoption.json().items[0].usage_count).toBe(2);
    expect(adoption.json().items[0].adoption_rate).toBe(0.67);

    const unknown = await context.app.inject({
      method: "POST",
      url: "/v1/writing/templates/unknown-template/insert",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        essay
      }
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().code).toBe("TEMPLATE_NOT_FOUND");
  });
});
