import { generateKeyPairSync } from "node:crypto";
import { describe, expect, test } from "vitest";
import type { ReminderPushDispatchPayload } from "../src/domain/reminder-delivery-service.js";
import {
  createApnsProviderToken,
  createReminderPushProviderSenders,
  isReminderPushProviderDispatchError
} from "../src/domain/reminder-push-provider-senders.js";

const decodeBase64UrlJson = <T>(value: string): T => JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;

const buildPayload = (
  overrides?: Partial<ReminderPushDispatchPayload>
): ReminderPushDispatchPayload => ({
  reminder: {
    id: "reminder-1",
    userId: "user-1",
    activeHourUtc: 20,
    scheduledAt: "2026-04-02T12:00:00.000Z",
    reason: "打开学习计划继续今天的任务。",
    deepLink: "/plan?task_id=task-1",
    planId: "plan-1",
    taskId: "task-1",
    createdAt: "2026-04-02T11:00:00.000Z"
  },
  device: {
    userId: "user-1",
    installationId: "installation-1",
    platform: "android",
    permissionStatus: "granted",
    pushProvider: "fcm",
    pushToken: "push-token-1",
    environment: "production",
    createdAt: "2026-04-02T11:00:00.000Z",
    updatedAt: "2026-04-02T11:00:00.000Z"
  },
  ...overrides
});

describe("S35 reminder push provider senders", () => {
  test("builds apns provider tokens with expected header and claims", () => {
    const { privateKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem"
      },
      publicKeyEncoding: {
        type: "spki",
        format: "pem"
      }
    });

    const token = createApnsProviderToken({
      teamId: "TEAM123",
      keyId: "KEY123",
      privateKey,
      issuedAtSeconds: 1_700_000_000
    });
    const [encodedHeader, encodedPayload] = token.split(".");

    expect(decodeBase64UrlJson(encodedHeader ?? "")).toMatchObject({
      alg: "ES256",
      kid: "KEY123"
    });
    expect(decodeBase64UrlJson(encodedPayload ?? "")).toMatchObject({
      iss: "TEAM123",
      iat: 1_700_000_000
    });
  });

  test("does not create default senders for incomplete provider config", () => {
    const senders = createReminderPushProviderSenders({
      apns: {
        enabled: true,
        bundleId: "com.selfhosted.ielts"
      },
      fcm: {
        enabled: true,
        projectId: "project-123"
      }
    });

    expect(senders.apns).toBeUndefined();
    expect(senders.fcm).toBeUndefined();
  });

  test("builds fcm oauth and send requests with reminder payload", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem"
      },
      publicKeyEncoding: {
        type: "spki",
        format: "pem"
      }
    });
    const requests: Array<{
      input: string;
      init?: RequestInit;
    }> = [];
    const senders = createReminderPushProviderSenders(
      {
        fcm: {
          enabled: true,
          projectId: "project-123",
          clientEmail: "push@example.iam.gserviceaccount.com",
          privateKey,
          tokenUri: "https://oauth2.googleapis.com/token"
        }
      },
      {
        now: () => 1_700_000_000_000,
        fetchImpl: async (input, init) => {
          requests.push({
            input: String(input),
            init
          });

          if (String(input) === "https://oauth2.googleapis.com/token") {
            return new Response(
              JSON.stringify({
                access_token: "oauth-token-123",
                expires_in: 3600
              }),
              {
                status: 200
              }
            );
          }

          return new Response(
            JSON.stringify({
              name: "projects/project-123/messages/message-1"
            }),
            {
              status: 200
            }
          );
        }
      }
    );

    const receipt = await senders.fcm?.(buildPayload());
    expect(receipt).toEqual({
      providerMessageId: "projects/project-123/messages/message-1"
    });
    expect(requests).toHaveLength(2);

    const tokenRequest = requests[0];
    expect(tokenRequest?.input).toBe("https://oauth2.googleapis.com/token");
    const tokenParams = new URLSearchParams(String(tokenRequest?.init?.body ?? ""));
    expect(tokenParams.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const assertion = tokenParams.get("assertion");
    expect(assertion).toBeTruthy();
    const [encodedHeader, encodedPayload] = String(assertion).split(".");
    expect(decodeBase64UrlJson(encodedHeader ?? "")).toMatchObject({
      alg: "RS256",
      typ: "JWT"
    });
    expect(decodeBase64UrlJson(encodedPayload ?? "")).toMatchObject({
      iss: "push@example.iam.gserviceaccount.com",
      sub: "push@example.iam.gserviceaccount.com",
      aud: "https://oauth2.googleapis.com/token",
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      iat: 1_700_000_000,
      exp: 1_700_003_600
    });

    const sendRequest = requests[1];
    expect(sendRequest?.input).toBe("https://fcm.googleapis.com/v1/projects/project-123/messages:send");
    expect(sendRequest?.init?.headers).toMatchObject({
      authorization: "Bearer oauth-token-123"
    });
    expect(JSON.parse(String(sendRequest?.init?.body ?? "{}"))).toMatchObject({
      message: {
        token: "push-token-1",
        notification: {
          title: "IELTS 学习提醒",
          body: "打开学习计划继续今天的任务。"
        },
        data: {
          kind: "study-reminder",
          deepLink: "/plan?task_id=task-1",
          reminderId: "reminder-1",
          scheduledAt: "2026-04-02T12:00:00.000Z",
          planId: "plan-1",
          taskId: "task-1"
        }
      }
    });
  });

  test("builds apns requests against sandbox for non-production devices", async () => {
    const { privateKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem"
      },
      publicKeyEncoding: {
        type: "spki",
        format: "pem"
      }
    });
    let apnsRequest:
      | {
          origin: string;
          path: string;
          headers: Record<string, string>;
          body: string;
        }
      | undefined;
    const senders = createReminderPushProviderSenders(
      {
        apns: {
          enabled: true,
          bundleId: "com.selfhosted.ielts",
          teamId: "TEAM123",
          keyId: "KEY123",
          privateKey
        }
      },
      {
        now: () => 1_700_000_000_000,
        sendApnsRequest: async (request) => {
          apnsRequest = request;
          return {
            statusCode: 200,
            bodyText: "",
            apnsId: "apns-message-1"
          };
        }
      }
    );

    const receipt = await senders.apns?.(
      buildPayload({
        device: {
          ...buildPayload().device,
          platform: "ios",
          pushProvider: "apns",
          environment: "preview"
        }
      })
    );

    expect(receipt).toEqual({
      providerMessageId: "apns-message-1"
    });
    expect(apnsRequest?.origin).toBe("https://api.sandbox.push.apple.com");
    expect(apnsRequest?.path).toBe("/3/device/push-token-1");
    expect(apnsRequest?.headers["apns-topic"]).toBe("com.selfhosted.ielts");
    expect(apnsRequest?.headers["apns-push-type"]).toBe("alert");
    expect(apnsRequest?.headers.authorization.startsWith("bearer ")).toBe(true);
    expect(JSON.parse(apnsRequest?.body ?? "{}")).toMatchObject({
      aps: {
        alert: {
          title: "IELTS 学习提醒",
          body: "打开学习计划继续今天的任务。"
        },
        sound: "default"
      },
      deepLink: "/plan?task_id=task-1",
      reminderId: "reminder-1",
      scheduledAt: "2026-04-02T12:00:00.000Z",
      kind: "study-reminder"
    });
  });

  test("classifies fcm unregistered failures as permanent device errors", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem"
      },
      publicKeyEncoding: {
        type: "spki",
        format: "pem"
      }
    });
    const senders = createReminderPushProviderSenders(
      {
        fcm: {
          enabled: true,
          projectId: "project-123",
          clientEmail: "push@example.iam.gserviceaccount.com",
          privateKey,
          tokenUri: "https://oauth2.googleapis.com/token"
        }
      },
      {
        fetchImpl: async (input) => {
          if (String(input) === "https://oauth2.googleapis.com/token") {
            return new Response(
              JSON.stringify({
                access_token: "oauth-token-123",
                expires_in: 3600
              }),
              {
                status: 200
              }
            );
          }

          return new Response(
            JSON.stringify({
              error: {
                status: "UNREGISTERED",
                message: "Requested entity was not found."
              }
            }),
            {
              status: 404
            }
          );
        }
      }
    );

    try {
      await senders.fcm?.(buildPayload());
      expect.unreachable("expected fcm sender to fail");
    } catch (error) {
      expect(isReminderPushProviderDispatchError(error)).toBe(true);
      expect(error).toMatchObject({
        failureCode: "DEVICE_UNREGISTERED",
        retryable: false
      });
    }
  });

  test("classifies apns rate limits as retryable provider failures", async () => {
    const { privateKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem"
      },
      publicKeyEncoding: {
        type: "spki",
        format: "pem"
      }
    });
    const senders = createReminderPushProviderSenders(
      {
        apns: {
          enabled: true,
          bundleId: "com.selfhosted.ielts",
          teamId: "TEAM123",
          keyId: "KEY123",
          privateKey
        }
      },
      {
        sendApnsRequest: async () => ({
          statusCode: 429,
          bodyText: JSON.stringify({
            reason: "TooManyRequests"
          }),
          apnsId: "apns-message-1"
        })
      }
    );

    try {
      await senders.apns?.(
        buildPayload({
          device: {
            ...buildPayload().device,
            platform: "ios",
            pushProvider: "apns"
          }
        })
      );
      expect.unreachable("expected apns sender to fail");
    } catch (error) {
      expect(isReminderPushProviderDispatchError(error)).toBe(true);
      expect(error).toMatchObject({
        failureCode: "RATE_LIMITED",
        retryable: true
      });
    }
  });
});
