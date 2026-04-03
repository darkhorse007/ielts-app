import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../domain/auth-service.js";
import type { SystemRole } from "../domain/types.js";

type AuthenticatedRequest = FastifyRequest & {
  auth: {
    userId: string;
    sessionId: string;
    accessToken: string;
    roles: SystemRole[];
  };
};

export const authenticate =
  (authService: AuthService) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authorization = request.headers.authorization;
    if (!authorization || !authorization.startsWith("Bearer ")) {
      reply.code(401).send({
        code: "UNAUTHORIZED",
        message: "Missing bearer token"
      });
      return;
    }

    const accessToken = authorization.slice("Bearer ".length).trim();

    try {
      const payload = authService.verifyAccessToken(accessToken);
      const roles = authService.getSystemRoles(payload.userId);
      (request as AuthenticatedRequest).auth = {
        userId: payload.userId,
        sessionId: payload.sessionId,
        accessToken,
        roles
      };
    } catch {
      reply.code(401).send({
        code: "UNAUTHORIZED",
        message: "Invalid access token"
      });
    }
  };

export const authorizeSystemRoles =
  (allowedRoles: SystemRole[]) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const auth = (request as Partial<AuthenticatedRequest>).auth;
    if (!auth) {
      reply.code(401).send({
        code: "UNAUTHORIZED",
        message: "Missing authenticated session"
      });
      return;
    }

    if (allowedRoles.some((role) => auth.roles.includes(role))) {
      return;
    }

    reply.code(403).send({
      code: "FORBIDDEN",
      message: `Requires one of roles: ${allowedRoles.join(", ")}`
    });
  };

export type { AuthenticatedRequest };
