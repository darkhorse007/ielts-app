import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { buildServer } from "../src/app.js";
import { sha256 } from "../src/domain/crypto.js";

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

  test("migrates legacy sha256 password hashes on successful login", async () => {
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

    const userId = register.json().user_id as string;
    const user = context.store.usersById.get(userId);
    expect(user).toBeDefined();
    if (!user) {
      throw new Error("user missing from store");
    }

    user.passwordHash = sha256("StrongPass123");
    context.store.usersById.set(userId, user);

    const login = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: email,
        password: "StrongPass123",
        device_id: "legacy-upgrade"
      }
    });

    expect(login.statusCode).toBe(200);
    expect(context.store.usersById.get(userId)?.passwordHash.startsWith("scrypt$")).toBe(true);
  });

  test("answers CORS preflight only for explicitly allowed browser origins", async () => {
    await context.app.close();
    context = await buildServer({
      allowedBrowserOrigins: ["https://app.example.com"]
    });
    await context.app.ready();

    const allowed = await context.app.inject({
      method: "OPTIONS",
      url: "/v1/auth/login",
      headers: {
        origin: "https://app.example.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type"
      }
    });
    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://app.example.com");

    const denied = await context.app.inject({
      method: "OPTIONS",
      url: "/v1/auth/login",
      headers: {
        origin: "https://evil.example.com",
        "access-control-request-method": "POST"
      }
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().code).toBe("ORIGIN_NOT_ALLOWED");
  });
});
