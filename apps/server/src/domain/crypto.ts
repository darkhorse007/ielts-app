import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { AccessTokenPayload } from "./types.js";

export const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

export const randomToken = (size = 48): string => randomBytes(size).toString("base64url");

const PASSWORD_HASH_PREFIX = "scrypt";
const PASSWORD_HASH_N = 16384;
const PASSWORD_HASH_R = 8;
const PASSWORD_HASH_P = 1;
const PASSWORD_HASH_KEY_LENGTH = 64;
const PASSWORD_HASH_SALT_LENGTH = 16;
const PASSWORD_HASH_MAX_MEMORY = 32 * 1024 * 1024;
const LEGACY_SHA256_PATTERN = /^[a-f0-9]{64}$/i;

const safeCompare = (left: Buffer, right: Buffer): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
};

const derivePasswordKey = (password: string, salt: Buffer): Buffer =>
  scryptSync(password, salt, PASSWORD_HASH_KEY_LENGTH, {
    N: PASSWORD_HASH_N,
    r: PASSWORD_HASH_R,
    p: PASSWORD_HASH_P,
    maxmem: PASSWORD_HASH_MAX_MEMORY
  });

export const hashPassword = (password: string): string => {
  const salt = randomBytes(PASSWORD_HASH_SALT_LENGTH);
  const derivedKey = derivePasswordKey(password, salt);
  return [
    PASSWORD_HASH_PREFIX,
    String(PASSWORD_HASH_N),
    String(PASSWORD_HASH_R),
    String(PASSWORD_HASH_P),
    salt.toString("base64url"),
    derivedKey.toString("base64url")
  ].join("$");
};

export const verifyPassword = (
  password: string,
  storedHash: string
): {
  valid: boolean;
  needsRehash: boolean;
} => {
  const parts = storedHash.split("$");
  if (parts.length === 6 && parts[0] === PASSWORD_HASH_PREFIX) {
    const [_, rawN, rawR, rawP, encodedSalt, encodedHash] = parts;
    const n = Number(rawN);
    const r = Number(rawR);
    const p = Number(rawP);
    if (
      n !== PASSWORD_HASH_N ||
      r !== PASSWORD_HASH_R ||
      p !== PASSWORD_HASH_P ||
      !encodedSalt ||
      !encodedHash
    ) {
      return {
        valid: false,
        needsRehash: false
      };
    }

    try {
      const salt = Buffer.from(encodedSalt, "base64url");
      const expected = Buffer.from(encodedHash, "base64url");
      const derived = derivePasswordKey(password, salt);
      return {
        valid: safeCompare(derived, expected),
        needsRehash: false
      };
    } catch {
      return {
        valid: false,
        needsRehash: false
      };
    }
  }

  if (!LEGACY_SHA256_PATTERN.test(storedHash)) {
    return {
      valid: false,
      needsRehash: false
    };
  }

  const legacyDigest = sha256(password);
  return {
    valid: safeCompare(Buffer.from(legacyDigest), Buffer.from(storedHash)),
    needsRehash: true
  };
};

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
