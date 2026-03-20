import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("S1 onboarding goal setup", () => {
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

  const login = async () => {
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

    const response = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: email,
        password: "StrongPass123",
        device_id: "macbook"
      }
    });
    expect(response.statusCode).toBe(200);

    return response.json().access_token as string;
  };

  test("creates onboarding goal with idempotency support", async () => {
    const accessToken = await login();
    const idempotencyKey = `idem-${crypto.randomUUID()}`;

    const first = await context.app.inject({
      method: "POST",
      url: "/v1/users/onboarding",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "idempotency-key": idempotencyKey
      },
      payload: {
        target_overall_band: 6.5,
        target_exam_date: "2026-10-01",
        weekly_study_hours: 12,
        weak_skills: ["speaking", "writing"]
      }
    });

    expect(first.statusCode).toBe(202);
    const firstBody = first.json();

    const duplicate = await context.app.inject({
      method: "POST",
      url: "/v1/users/onboarding",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "idempotency-key": idempotencyKey
      },
      payload: {
        target_overall_band: 6.5,
        target_exam_date: "2026-10-01",
        weekly_study_hours: 12,
        weak_skills: ["speaking", "writing"]
      }
    });

    expect(duplicate.statusCode).toBe(202);
    const duplicateBody = duplicate.json();

    expect(duplicateBody.assessment_id).toBe(firstBody.assessment_id);
    expect(duplicateBody.plan_id).toBe(firstBody.plan_id);

    const status = await context.app.inject({
      method: "GET",
      url: `/v1/users/onboarding/${firstBody.assessment_id}/status`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });

    expect(status.statusCode).toBe(200);
    const statusBody = status.json();
    expect(["processing", "completed"]).toContain(statusBody.status);
  });

  test("validates onboarding payload and auth", async () => {
    const unauthorized = await context.app.inject({
      method: "POST",
      url: "/v1/users/onboarding",
      payload: {
        target_overall_band: 6,
        target_exam_date: "2026-01-01",
        weekly_study_hours: 10,
        weak_skills: []
      }
    });

    expect(unauthorized.statusCode).toBe(401);

    const accessToken = await login();

    const invalid = await context.app.inject({
      method: "POST",
      url: "/v1/users/onboarding",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        target_overall_band: 6.3,
        target_exam_date: "2020-01-01",
        weekly_study_hours: 0,
        weak_skills: ["speaking"]
      }
    });

    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().code).toBe("VALIDATION_ERROR");
  });

  test("supports retry after transient failure by re-submitting with new idempotency key", async () => {
    const accessToken = await login();

    const first = await context.app.inject({
      method: "POST",
      url: "/v1/users/onboarding",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "idempotency-key": `idem-a-${crypto.randomUUID()}`
      },
      payload: {
        target_overall_band: 7,
        target_exam_date: "2026-11-15",
        weekly_study_hours: 15,
        weak_skills: ["listening", "speaking"]
      }
    });

    expect(first.statusCode).toBe(202);

    const retry = await context.app.inject({
      method: "POST",
      url: "/v1/users/onboarding",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "idempotency-key": `idem-b-${crypto.randomUUID()}`
      },
      payload: {
        target_overall_band: 7,
        target_exam_date: "2026-11-15",
        weekly_study_hours: 15,
        weak_skills: ["listening", "speaking"]
      }
    });

    expect(retry.statusCode).toBe(202);
    expect(retry.json().assessment_id).not.toBe(first.json().assessment_id);
  });
});
