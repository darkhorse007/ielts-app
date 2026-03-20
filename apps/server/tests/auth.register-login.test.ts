import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { buildServer } from "../src/app.js";

describe("S1 auth register/login", () => {
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

  test("registers and logs in with email", async () => {
    const email = nextEmail();

    const register = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "StrongPass123",
        display_name: "Alice"
      }
    });

    expect(register.statusCode).toBe(201);
    const registerBody = register.json();
    expect(registerBody.user_id).toBeTypeOf("string");

    const login = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: email,
        password: "StrongPass123",
        device_id: "macbook-pro"
      }
    });

    expect(login.statusCode).toBe(200);
    const loginBody = login.json();
    expect(loginBody.access_token).toBeTypeOf("string");
    expect(loginBody.refresh_token).toBeTypeOf("string");
    expect(loginBody.expires_in).toBeGreaterThan(0);
    expect(loginBody.user_id).toBe(registerBody.user_id);
  });

  test("blocks duplicate registration", async () => {
    const email = nextEmail();

    const first = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "StrongPass123"
      }
    });
    expect(first.statusCode).toBe(201);

    const duplicate = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "StrongPass123"
      }
    });

    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().code).toBe("USER_EXISTS");
  });

  test("returns 401 on wrong password and 429 after repeated failures", async () => {
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

    for (let i = 0; i < 5; i += 1) {
      const failed = await context.app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: {
          identifier: email,
          password: `WrongPass${i}`
        }
      });

      expect(failed.statusCode).toBe(401);
    }

    const throttled = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: email,
        password: "WrongPassAgain"
      }
    });

    expect(throttled.statusCode).toBe(429);
    expect(throttled.json().code).toBe("LOGIN_RATE_LIMITED");
  });

  test("validates register payload", async () => {
    const response = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        password: "short"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("VALIDATION_ERROR");
  });
});
