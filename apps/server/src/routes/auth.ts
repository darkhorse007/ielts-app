import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthAccountRepository } from "../domain/auth-account-repository.js";
import type { AuthService } from "../domain/auth-service.js";

const registerSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z
      .string()
      .regex(/^\+?[0-9]{6,20}$/)
      .optional(),
    password: z.string().min(8),
    display_name: z.string().trim().min(1).max(64).optional()
  })
  .refine((value) => Boolean(value.email || value.phone), {
    message: "Either email or phone is required"
  });

const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
  device_id: z.string().trim().min(1).max(128).optional()
});

const refreshSchema = z.object({
  refresh_token: z.string().min(20),
  device_id: z.string().trim().min(1).max(128).optional()
});

const logoutSchema = z
  .object({
    refresh_token: z.string().min(20).optional()
  })
  .optional();

const toError = (code: string, message: string): { code: string; message: string } => ({
  code,
  message
});

const flushAuthAccountRepository = async (
  repository: AuthAccountRepository | undefined,
  reply: { code: (statusCode: number) => { send: (payload: { code: string; message: string }) => void } }
): Promise<boolean> => {
  try {
    await repository?.flush();
    return true;
  } catch {
    reply.code(503).send(toError("AUTH_ACCOUNT_STORAGE_UNAVAILABLE", "Auth/account storage is unavailable"));
    return false;
  }
};

export const registerAuthRoutes = async (
  app: FastifyInstance,
  authService: AuthService,
  authAccountRepository?: AuthAccountRepository
): Promise<void> => {
  app.post("/v1/auth/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send(
        toError(
          "VALIDATION_ERROR",
          parsed.error.issues.map((issue) => issue.message).join("; ")
        )
      );
      return;
    }

    try {
      const result = authService.register({
        email: parsed.data.email,
        phone: parsed.data.phone,
        password: parsed.data.password,
        displayName: parsed.data.display_name
      });
      if (!(await flushAuthAccountRepository(authAccountRepository, reply))) {
        return;
      }

      reply.code(201).send({
        user_id: result.userId
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("ALREADY_EXISTS")) {
        reply.code(409).send(toError("USER_EXISTS", "Email or phone already exists"));
        return;
      }
      throw error;
    }
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send(
        toError(
          "VALIDATION_ERROR",
          parsed.error.issues.map((issue) => issue.message).join("; ")
        )
      );
      return;
    }

    try {
      const result = authService.login({
        identifier: parsed.data.identifier,
        password: parsed.data.password,
        deviceId: parsed.data.device_id,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      });
      if (!(await flushAuthAccountRepository(authAccountRepository, reply))) {
        return;
      }

      reply.code(200).send({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
        expires_in: result.expiresIn,
        user_id: result.userId,
        session_id: result.sessionId
      });
    } catch (error) {
      if (error instanceof Error && error.message === "LOGIN_RATE_LIMITED") {
        if (!(await flushAuthAccountRepository(authAccountRepository, reply))) {
          return;
        }
        reply.code(429).send(toError("LOGIN_RATE_LIMITED", "Too many failed login attempts"));
        return;
      }

      if (error instanceof Error && error.message === "USER_DISABLED") {
        if (!(await flushAuthAccountRepository(authAccountRepository, reply))) {
          return;
        }
        reply.code(403).send(toError("USER_DISABLED", "User is disabled or deleted"));
        return;
      }

      if (error instanceof Error && error.message === "INVALID_CREDENTIALS") {
        if (!(await flushAuthAccountRepository(authAccountRepository, reply))) {
          return;
        }
        reply.code(401).send(toError("INVALID_CREDENTIALS", "Identifier or password is invalid"));
        return;
      }
      throw error;
    }
  });

  app.post("/v1/auth/refresh", async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send(
        toError(
          "VALIDATION_ERROR",
          parsed.error.issues.map((issue) => issue.message).join("; ")
        )
      );
      return;
    }

    try {
      const result = authService.refresh({
        refreshToken: parsed.data.refresh_token,
        deviceId: parsed.data.device_id,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      });
      if (!(await flushAuthAccountRepository(authAccountRepository, reply))) {
        return;
      }

      reply.code(200).send({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
        expires_in: result.expiresIn,
        user_id: result.userId,
        session_id: result.sessionId
      });
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_REFRESH_TOKEN") {
        if (!(await flushAuthAccountRepository(authAccountRepository, reply))) {
          return;
        }
        reply.code(401).send(toError("INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired"));
        return;
      }
      throw error;
    }
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    const authorization = request.headers.authorization;
    if (!authorization || !authorization.startsWith("Bearer ")) {
      reply.code(401).send(toError("UNAUTHORIZED", "Missing bearer token"));
      return;
    }

    const parsed = logoutSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send(
        toError(
          "VALIDATION_ERROR",
          parsed.error.issues.map((issue) => issue.message).join("; ")
        )
      );
      return;
    }

    try {
      authService.logout({
        accessToken: authorization.slice("Bearer ".length).trim(),
        refreshToken: parsed.data?.refresh_token
      });
      if (!(await flushAuthAccountRepository(authAccountRepository, reply))) {
        return;
      }

      reply.code(200).send({
        success: true
      });
    } catch {
      reply.code(401).send(toError("UNAUTHORIZED", "Invalid access token"));
    }
  });
};
