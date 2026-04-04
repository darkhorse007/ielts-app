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

describe("S28 api client content-type defaults", () => {
  test("does not force application/json for bodyless post requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        assessment_id: "a-1",
        status: "paused",
        elapsed_seconds: 20
      })
    );

    const client = new ApiClient(baseUrl, fetchMock as unknown as typeof fetch);
    await client.pauseDiagnostic("token", "a-1");

    const [, requestInit] = fetchMock.mock.calls[0];
    const headers = new Headers(requestInit.headers);

    expect(headers.has("Content-Type")).toBe(false);
    expect(headers.get("Authorization")).toBe("Bearer token");
  });

  test("keeps application/json default for json body requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        user_id: "u-1"
      })
    );

    const client = new ApiClient(baseUrl, fetchMock as unknown as typeof fetch);
    await client.register({
      email: "learner@example.com",
      password: "StrongPass123"
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    const headers = new Headers(requestInit.headers);

    expect(headers.get("Content-Type")).toBe("application/json");
  });

  test("supports text export responses with attachment filename", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"user_id":"u-1"}', {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": 'attachment; filename="user-data-export-u-1.json"'
        }
      })
    );

    const client = new ApiClient(baseUrl, fetchMock as unknown as typeof fetch);
    const result = await client.exportUserData("token");

    expect(result).toEqual({
      filename: "user-data-export-u-1.json",
      content: '{"user_id":"u-1"}'
    });
  });

  test("supports guardian support csv export responses with filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('request_id,user_id\n"r-1","u-1"', {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="minor-guardian-support-requests-2026-04-04.csv"'
        }
      })
    );

    const client = new ApiClient(baseUrl, fetchMock as unknown as typeof fetch);
    const result = await client.exportInternalMinorGuardianSupportRequests({
      accessToken: "token",
      status: "contacted",
      query: "guardian@example.com",
      orderBy: "sla_priority_desc"
    });

    expect(result).toEqual({
      filename: "minor-guardian-support-requests-2026-04-04.csv",
      content: 'request_id,user_id\n"r-1","u-1"'
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/internal/minor-guardian/support-requests/export?status=contacted&q=guardian%40example.com&order_by=sla_priority_desc",
      expect.objectContaining({
        method: "GET",
        headers: expect.any(Headers)
      })
    );
  });
});
