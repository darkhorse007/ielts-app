import { describe, expect, test, vi } from "vitest";
import { ApiClient } from "../src/lib/api-client";

const baseUrl = "http://127.0.0.1:8787";

const jsonResponse = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });

describe("S8 api client version-conflict retry", () => {
  test("retries canary promote with latest version when conflict happens", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(409, { code: "CANARY_VERSION_CONFLICT", message: "version conflict" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          canary_id: "c-1",
          release_id: "REL-1",
          version: 3,
          status: "running"
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          canary_id: "c-1",
          release_id: "REL-1",
          version: 4,
          status: "promoted"
        })
      );

    const client = new ApiClient(baseUrl, fetchMock as unknown as typeof fetch);
    const result = await client.promoteCanary("token", "c-1", {
      metrics: {
        error_rate: 0.1,
        latency_p95_ms: 900,
        provider_healthy: true
      },
      expected_version: 2
    });

    expect(result.status).toBe("promoted");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const retryCall = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(retryCall[0]).toBe(`${baseUrl}/v1/system/release/canary/c-1/promote`);
    expect(JSON.parse(String(retryCall[1].body)).expected_version).toBe(3);
  });

  test("retries beta whitelist upsert with latest version when conflict happens", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(409, { code: "BETA_WHITELIST_VERSION_CONFLICT", message: "version conflict" })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          total: 1,
          page: 1,
          page_size: 1,
          items: [
            {
              whitelist_id: "wl-1",
              user_id: "u-1",
              release_id: "REL-BETA-1",
              version: 7,
              status: "active",
              created_by_user_id: "u-admin",
              updated_by_user_id: "u-admin",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          whitelist_id: "wl-1",
          user_id: "u-1",
          release_id: "REL-BETA-1",
          version: 8,
          status: "active",
          created_by_user_id: "u-admin",
          updated_by_user_id: "u-admin",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      );

    const client = new ApiClient(baseUrl, fetchMock as unknown as typeof fetch);
    const result = await client.upsertBetaWhitelist("token", "u-1", {
      release_id: "REL-BETA-1",
      status: "active",
      expected_version: 6
    });

    expect(result.version).toBe(8);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const retryCall = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(retryCall[0]).toBe(`${baseUrl}/v1/system/beta/whitelist/u-1`);
    expect(JSON.parse(String(retryCall[1].body)).expected_version).toBe(7);
  });

  test("retries beta feedback escalation with latest version when conflict happens", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(409, { code: "BETA_FEEDBACK_VERSION_CONFLICT", message: "version conflict" })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          feedback_id: "fb-1",
          user_id: "u-1",
          release_id: "REL-BETA-1",
          version: 5,
          category: "bug",
          severity: "high",
          priority: "high",
          status: "open",
          title: "t",
          description: "d",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          feedback_id: "fb-1",
          user_id: "u-1",
          release_id: "REL-BETA-1",
          version: 6,
          category: "bug",
          severity: "high",
          priority: "critical",
          status: "triaged",
          title: "t",
          description: "d",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      );

    const client = new ApiClient(baseUrl, fetchMock as unknown as typeof fetch);
    const result = await client.escalateBetaFeedbackPriority("token", "fb-1", {
      priority: "critical",
      reason: "raise",
      expected_version: 4
    });

    expect(result.version).toBe(6);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const retryCall = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(retryCall[0]).toBe(`${baseUrl}/v1/system/beta/feedback/fb-1/escalate`);
    expect(JSON.parse(String(retryCall[1].body)).expected_version).toBe(5);
  });
});
