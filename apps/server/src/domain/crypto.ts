import { createHash, createHmac, randomBytes } from "node:crypto";
import type { AccessTokenPayload } from "./types.js";

export const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

export const randomToken = (size = 48): string => randomBytes(size).toString("base64url");

export const signAccessToken = (
  payload: Omit<AccessTokenPayload, "type" | "exp">,
  ttlSeconds: number,
  secret: string
): string => {
  const signedPayload: AccessTokenPayload = {
    type: "access",
    userId: payload.userId,
    sessionId: payload.sessionId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };
  const encoded = Buffer.from(JSON.stringify(signedPayload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
};

export const verifyAccessToken = (token: string, secret: string): AccessTokenPayload | null => {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  if (expected !== signature) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8")) as AccessTokenPayload;
    if (payload.type !== "access") {
      return null;
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};
