import {
  connect,
  constants,
  type ClientHttp2Session,
  type ClientHttp2Stream,
  type IncomingHttpHeaders,
  type OutgoingHttpHeaders
} from "node:http2";
import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import type {
  ReminderPushDispatchPayload,
  ReminderPushDispatchReceipt,
  ReminderPushProviderSender,
  ReminderPushProviderSenders,
  ReminderPushProviderRuntimeSettings
} from "./reminder-delivery-service.js";

const APNS_PRODUCTION_ORIGIN = "https://api.push.apple.com";
const APNS_SANDBOX_ORIGIN = "https://api.sandbox.push.apple.com";
const APNS_AUTH_TOKEN_TTL_SECONDS = 50 * 60;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_FCM_TOKEN_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const DEFAULT_FCM_TOKEN_URI = "https://oauth2.googleapis.com/token";
const FCM_ACCESS_TOKEN_SAFETY_WINDOW_SECONDS = 60;
const REMINDER_PUSH_KIND = "study-reminder";
const REMINDER_PUSH_TITLE = "IELTS 学习提醒";
const REMINDER_PUSH_BODY_FALLBACK = "打开学习计划继续今天的任务。";

type FetchLike = typeof fetch;

type ReminderPushSenderFactoryDependencies = {
  fetchImpl?: FetchLike;
  now?: () => number;
  requestTimeoutMs?: number;
  sendApnsRequest?: (request: ApnsRequestInput) => Promise<ApnsRequestResult>;
};

type ApnsRequestInput = {
  origin: string;
  path: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
};

type ApnsRequestResult = {
  statusCode: number;
  bodyText: string;
  apnsId?: string;
};

type PushNotificationMessage = {
  title: string;
  body: string;
  reminderId: string;
  deepLink: string;
  scheduledAt: string;
  kind: string;
  planId?: string;
  taskId?: string;
};

type ApnsReadySettings = {
  bundleId: string;
  teamId: string;
  keyId: string;
  privateKey: KeyObject;
};

type FcmReadySettings = {
  projectId: string;
  clientEmail: string;
  privateKey: KeyObject;
  tokenUri: string;
};

type JsonRecord = Record<string, unknown>;

const toBase64UrlJson = (value: Record<string, unknown>): string =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const normalizeOptional = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const buildCompactJwt = (input: {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  privateKey: KeyObject;
  algorithm: "ES256" | "RS256";
}): string => {
  const header = toBase64UrlJson(input.header);
  const payload = toBase64UrlJson(input.payload);
  const unsignedToken = `${header}.${payload}`;
  const signature = sign("sha256", Buffer.from(unsignedToken), {
    key: input.privateKey,
    dsaEncoding: input.algorithm === "ES256" ? "ieee-p1363" : undefined
  }).toString("base64url");
  return `${unsignedToken}.${signature}`;
};

const createPemPrivateKey = (value: string, source: string): KeyObject => {
  try {
    return createPrivateKey(value);
  } catch {
    throw new Error(`${source}_INVALID`);
  }
};

const buildPushNotificationMessage = (payload: ReminderPushDispatchPayload): PushNotificationMessage => ({
  title: REMINDER_PUSH_TITLE,
  body: payload.reminder.reason || REMINDER_PUSH_BODY_FALLBACK,
  reminderId: payload.reminder.id,
  deepLink: payload.reminder.deepLink || "/plan",
  scheduledAt: payload.reminder.scheduledAt,
  kind: REMINDER_PUSH_KIND,
  planId: payload.reminder.planId,
  taskId: payload.reminder.taskId
});

const toDataRecord = (message: PushNotificationMessage): Record<string, string> => ({
  kind: message.kind,
  deepLink: message.deepLink,
  reminderId: message.reminderId,
  scheduledAt: message.scheduledAt,
  ...(message.planId ? { planId: message.planId } : {}),
  ...(message.taskId ? { taskId: message.taskId } : {})
});

const buildApnsRequestBody = (payload: ReminderPushDispatchPayload): string => {
  const message = buildPushNotificationMessage(payload);
  return JSON.stringify({
    aps: {
      alert: {
        title: message.title,
        body: message.body
      },
      sound: "default"
    },
    ...toDataRecord(message)
  });
};

const buildFcmMessageRequestBody = (payload: ReminderPushDispatchPayload): string => {
  const message = buildPushNotificationMessage(payload);
  return JSON.stringify({
    message: {
      token: payload.device.pushToken,
      notification: {
        title: message.title,
        body: message.body
      },
      data: toDataRecord(message),
      android: {
        priority: "HIGH",
        notification: {
          channel_id: "study-reminders",
          sound: "default"
        }
      }
    }
  });
};

const readJsonRecord = (bodyText: string): JsonRecord | undefined => {
  if (!bodyText.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as JsonRecord;
  } catch {
    return undefined;
  }
};

const getErrorMessageFromJson = (value: JsonRecord | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  if (typeof value.reason === "string" && value.reason.trim()) {
    return value.reason.trim();
  }

  const nestedError = value.error;
  if (nestedError && typeof nestedError === "object" && !Array.isArray(nestedError)) {
    const nestedErrorRecord = nestedError as JsonRecord;
    if (typeof nestedErrorRecord.message === "string" && nestedErrorRecord.message.trim()) {
      return nestedErrorRecord.message.trim();
    }
    if (typeof nestedErrorRecord.status === "string" && nestedErrorRecord.status.trim()) {
      return nestedErrorRecord.status.trim();
    }
  }

  if (typeof value.message === "string" && value.message.trim()) {
    return value.message.trim();
  }

  return undefined;
};

export const createApnsProviderToken = (input: {
  teamId: string;
  keyId: string;
  privateKey: string;
  issuedAtSeconds: number;
}): string =>
  buildCompactJwt({
    header: {
      alg: "ES256",
      kid: input.keyId
    },
    payload: {
      iss: input.teamId,
      iat: input.issuedAtSeconds
    },
    privateKey: createPemPrivateKey(input.privateKey, "REMINDER_PUSH_APNS_PRIVATE_KEY"),
    algorithm: "ES256"
  });

export const createGoogleServiceAccountAssertion = (input: {
  clientEmail: string;
  privateKey: string;
  tokenUri?: string;
  scope?: string;
  issuedAtSeconds: number;
  expiresAtSeconds?: number;
}): string => {
  const tokenUri = normalizeOptional(input.tokenUri) ?? DEFAULT_FCM_TOKEN_URI;
  const expiresAtSeconds = input.expiresAtSeconds ?? input.issuedAtSeconds + 3600;

  return buildCompactJwt({
    header: {
      alg: "RS256",
      typ: "JWT"
    },
    payload: {
      iss: input.clientEmail,
      sub: input.clientEmail,
      aud: tokenUri,
      scope: input.scope ?? DEFAULT_FCM_TOKEN_SCOPE,
      iat: input.issuedAtSeconds,
      exp: expiresAtSeconds
    },
    privateKey: createPemPrivateKey(input.privateKey, "REMINDER_PUSH_FCM_PRIVATE_KEY"),
    algorithm: "RS256"
  });
};

export const buildFcmAccessTokenRequestBody = (assertion: string): string =>
  new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  }).toString();

const defaultSendApnsRequest = async (requestInput: ApnsRequestInput): Promise<ApnsRequestResult> =>
  new Promise((resolve, reject) => {
    const session = connect(requestInput.origin);
    const headers: OutgoingHttpHeaders = {
      [constants.HTTP2_HEADER_METHOD]: "POST",
      [constants.HTTP2_HEADER_PATH]: requestInput.path,
      ...requestInput.headers
    };
    const request = session.request(headers);
    const bodyChunks: string[] = [];
    let settled = false;
    let statusCode = 0;
    let apnsId: string | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): void => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      request.removeAllListeners();
      session.removeAllListeners();
      if (!session.closed && !session.destroyed) {
        session.close();
      }
    };

    const settle = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback();
    };

    const onError = (error: Error): void => {
      settle(() => reject(error));
    };

    timeoutId = setTimeout(() => {
      const error = new Error("APNS_REQUEST_TIMEOUT");
      if (!request.closed) {
        request.close();
      }
      if (!session.destroyed) {
        session.destroy(error);
      }
      onError(error);
    }, requestInput.timeoutMs);

    session.once("error", onError);
    request.once("error", onError);
    request.on("response", (headersMap: IncomingHttpHeaders) => {
      const rawStatusCode = headersMap[constants.HTTP2_HEADER_STATUS];
      statusCode = typeof rawStatusCode === "number" ? rawStatusCode : Number(rawStatusCode ?? 0);
      const rawApnsId = headersMap["apns-id"];
      if (typeof rawApnsId === "string") {
        apnsId = rawApnsId;
      } else if (Array.isArray(rawApnsId) && typeof rawApnsId[0] === "string") {
        apnsId = rawApnsId[0];
      }
    });
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      bodyChunks.push(chunk);
    });
    request.on("end", () => {
      settle(() =>
        resolve({
          statusCode,
          bodyText: bodyChunks.join(""),
          apnsId
        })
      );
    });
    request.end(requestInput.body);
  });

const createApnsSender = (
  settings: ApnsReadySettings,
  dependencies: ReminderPushSenderFactoryDependencies
): ReminderPushProviderSender => {
  let cachedProviderToken: {
    value: string;
    issuedAtSeconds: number;
  } | null = null;
  const now = dependencies.now ?? Date.now;
  const sendApnsRequest = dependencies.sendApnsRequest ?? defaultSendApnsRequest;

  const getProviderToken = (): string => {
    const issuedAtSeconds = Math.floor(now() / 1000);
    if (cachedProviderToken && issuedAtSeconds - cachedProviderToken.issuedAtSeconds < APNS_AUTH_TOKEN_TTL_SECONDS) {
      return cachedProviderToken.value;
    }

    const nextToken = buildCompactJwt({
      header: {
        alg: "ES256",
        kid: settings.keyId
      },
      payload: {
        iss: settings.teamId,
        iat: issuedAtSeconds
      },
      privateKey: settings.privateKey,
      algorithm: "ES256"
    });
    cachedProviderToken = {
      value: nextToken,
      issuedAtSeconds
    };
    return nextToken;
  };

  return async (payload: ReminderPushDispatchPayload): Promise<ReminderPushDispatchReceipt> => {
    const pushToken = normalizeOptional(payload.device.pushToken);
    if (!pushToken) {
      throw new Error("APNS_PUSH_TOKEN_MISSING");
    }

    const origin = payload.device.environment === "production" ? APNS_PRODUCTION_ORIGIN : APNS_SANDBOX_ORIGIN;
    const response = await sendApnsRequest({
      origin,
      path: `/3/device/${pushToken}`,
      headers: {
        authorization: `bearer ${getProviderToken()}`,
        "apns-topic": settings.bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json"
      },
      body: buildApnsRequestBody(payload),
      timeoutMs: dependencies.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const reason = getErrorMessageFromJson(readJsonRecord(response.bodyText));
      throw new Error(reason ? `APNS_${response.statusCode}_${reason}` : `APNS_${response.statusCode}`);
    }

    return {
      providerMessageId: response.apnsId
    };
  };
};

const createFcmSender = (
  settings: FcmReadySettings,
  dependencies: ReminderPushSenderFactoryDependencies
): ReminderPushProviderSender => {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const now = dependencies.now ?? Date.now;
  let cachedAccessToken: {
    value: string;
    expiresAtSeconds: number;
  } | null = null;

  const getAccessToken = async (): Promise<string> => {
    const nowSeconds = Math.floor(now() / 1000);
    if (cachedAccessToken && nowSeconds < cachedAccessToken.expiresAtSeconds - FCM_ACCESS_TOKEN_SAFETY_WINDOW_SECONDS) {
      return cachedAccessToken.value;
    }

    const assertion = buildCompactJwt({
      header: {
        alg: "RS256",
        typ: "JWT"
      },
      payload: {
        iss: settings.clientEmail,
        sub: settings.clientEmail,
        aud: settings.tokenUri,
        scope: DEFAULT_FCM_TOKEN_SCOPE,
        iat: nowSeconds,
        exp: nowSeconds + 3600
      },
      privateKey: settings.privateKey,
      algorithm: "RS256"
    });

    const tokenResponse = await fetchImpl(settings.tokenUri, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: buildFcmAccessTokenRequestBody(assertion)
    });
    const tokenBodyText = await tokenResponse.text();
    const tokenBody = readJsonRecord(tokenBodyText);
    const accessToken = typeof tokenBody?.access_token === "string" ? tokenBody.access_token : undefined;
    const expiresInSeconds = typeof tokenBody?.expires_in === "number" ? tokenBody.expires_in : 3600;

    if (!tokenResponse.ok || !accessToken) {
      const message = getErrorMessageFromJson(tokenBody);
      throw new Error(message ? `FCM_AUTH_${tokenResponse.status}_${message}` : `FCM_AUTH_${tokenResponse.status}`);
    }

    cachedAccessToken = {
      value: accessToken,
      expiresAtSeconds: nowSeconds + expiresInSeconds
    };
    return accessToken;
  };

  return async (payload: ReminderPushDispatchPayload): Promise<ReminderPushDispatchReceipt> => {
    const pushToken = normalizeOptional(payload.device.pushToken);
    if (!pushToken) {
      throw new Error("FCM_PUSH_TOKEN_MISSING");
    }

    const accessToken = await getAccessToken();
    const response = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${settings.projectId}/messages:send`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json; charset=utf-8"
      },
      body: buildFcmMessageRequestBody(payload)
    });
    const responseBodyText = await response.text();
    const responseBody = readJsonRecord(responseBodyText);

    if (!response.ok) {
      const message = getErrorMessageFromJson(responseBody);
      throw new Error(message ? `FCM_${response.status}_${message}` : `FCM_${response.status}`);
    }

    return {
      providerMessageId: typeof responseBody?.name === "string" ? responseBody.name : undefined
    };
  };
};

const getCompleteApnsSettings = (
  settings: ReminderPushProviderRuntimeSettings["apns"] | undefined
): ApnsReadySettings | null => {
  if (!settings?.enabled || !settings.bundleId || !settings.teamId || !settings.keyId || !settings.privateKey) {
    return null;
  }

  return {
    bundleId: settings.bundleId,
    teamId: settings.teamId,
    keyId: settings.keyId,
    privateKey: createPemPrivateKey(settings.privateKey, "REMINDER_PUSH_APNS_PRIVATE_KEY")
  };
};

const getCompleteFcmSettings = (
  settings: ReminderPushProviderRuntimeSettings["fcm"] | undefined
): FcmReadySettings | null => {
  if (!settings?.enabled || !settings.projectId || !settings.clientEmail || !settings.privateKey) {
    return null;
  }

  return {
    projectId: settings.projectId,
    clientEmail: settings.clientEmail,
    privateKey: createPemPrivateKey(settings.privateKey, "REMINDER_PUSH_FCM_PRIVATE_KEY"),
    tokenUri: settings.tokenUri || DEFAULT_FCM_TOKEN_URI
  };
};

export const createReminderPushProviderSenders = (
  settings: Partial<ReminderPushProviderRuntimeSettings> | undefined,
  dependencies: ReminderPushSenderFactoryDependencies = {}
): ReminderPushProviderSenders => {
  const senders: ReminderPushProviderSenders = {};
  const apnsSettings = getCompleteApnsSettings(settings?.apns);
  const fcmSettings = getCompleteFcmSettings(settings?.fcm);

  if (apnsSettings) {
    senders.apns = createApnsSender(apnsSettings, dependencies);
  }

  if (fcmSettings) {
    senders.fcm = createFcmSender(fcmSettings, dependencies);
  }

  return senders;
};
