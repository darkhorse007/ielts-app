import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:8787";

const requestJson = async (request, path, init = {}) => {
  const response = await request.fetch(`${baseURL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const body = await response.json().catch(() => ({}));
  return {
    status: response.status(),
    body
  };
};

const registerAndLogin = async (request, prefix = "qa-e2e") => {
  const email = `${prefix}-${randomUUID()}@example.com`;
  const password = "StrongPass123";
  const register = await requestJson(request, "/v1/auth/register", {
    method: "POST",
    data: {
      email,
      password
    }
  });
  expect(register.status).toBe(201);

  const login = await requestJson(request, "/v1/auth/login", {
    method: "POST",
    data: {
      identifier: email,
      password,
      device_id: "pw-e2e"
    }
  });
  expect(login.status).toBe(200);
  return login.body.access_token;
};

test("stability run -> alert handle -> report export", async ({ request }) => {
  const accessToken = await registerAndLogin(request, "admin-e2e");
  const auth = {
    authorization: `Bearer ${accessToken}`
  };

  const baselineReleaseId = `REL-PW-BASE-${randomUUID()}`;
  const targetReleaseId = `REL-PW-TARGET-${randomUUID()}`;

  const startBaseline = await requestJson(request, "/v1/system/stability/soak-tests/start", {
    method: "POST",
    headers: auth,
    data: {
      release_id: baselineReleaseId,
      planned_duration_hours: 72
    }
  });
  expect(startBaseline.status).toBe(201);
  const baselineRunId = startBaseline.body.run_id;

  const startTarget = await requestJson(request, "/v1/system/stability/soak-tests/start", {
    method: "POST",
    headers: auth,
    data: {
      release_id: targetReleaseId,
      planned_duration_hours: 72
    }
  });
  expect(startTarget.status).toBe(201);
  const targetRunId = startTarget.body.run_id;

  for (const payload of [
    { at_hour: 24, crash_count: 4, active_sessions: 1500, api_success_rate: 99.2, latency_p95_ms: 1600 },
    { at_hour: 72, crash_count: 6, active_sessions: 1400, api_success_rate: 98.9, latency_p95_ms: 2700 }
  ]) {
    const response = await requestJson(request, `/v1/system/stability/soak-tests/${baselineRunId}/checkpoints`, {
      method: "POST",
      headers: auth,
      data: payload
    });
    expect(response.status).toBe(201);
  }

  for (const payload of [
    { at_hour: 24, crash_count: 1, active_sessions: 2200, api_success_rate: 99.8, latency_p95_ms: 1200 },
    { at_hour: 72, crash_count: 2, active_sessions: 2300, api_success_rate: 99.7, latency_p95_ms: 1300 }
  ]) {
    const response = await requestJson(request, `/v1/system/stability/soak-tests/${targetRunId}/checkpoints`, {
      method: "POST",
      headers: auth,
      data: payload
    });
    expect(response.status).toBe(201);
  }

  const listAlerts = await requestJson(request, `/v1/system/stability/alerts?run_id=${baselineRunId}&status=open`, {
    method: "GET",
    headers: auth
  });
  expect(listAlerts.status).toBe(200);
  expect(listAlerts.body.total).toBeGreaterThan(0);
  const firstAlertId = listAlerts.body.items[0].alert_id;

  const handleAlert = await requestJson(request, `/v1/system/stability/alerts/${firstAlertId}/handle`, {
    method: "POST",
    headers: auth,
    data: {
      action: "resolve",
      note: "playwright e2e resolve"
    }
  });
  expect(handleAlert.status).toBe(200);
  expect(handleAlert.body.status).toBe("resolved");

  const operationalMetrics = await requestJson(request, "/v1/system/release/metrics", {
    method: "GET",
    headers: auth
  });
  expect(operationalMetrics.status).toBe(200);
  expect(operationalMetrics.body.storage_resilience.alerting).toBeTruthy();
  expect(typeof operationalMetrics.body.storage_resilience.alerting.circuit_open_threshold_ms).toBe("number");
  expect(Array.isArray(operationalMetrics.body.storage_resilience.alerting.recent)).toBe(true);

  const compare = await requestJson(
    request,
    `/v1/system/stability/reports/compare?baseline_release_id=${baselineReleaseId}&target_release_id=${targetReleaseId}`,
    {
      method: "GET",
      headers: auth
    }
  );
  expect(compare.status).toBe(200);
  expect(compare.body.conclusion).toBe("improved");

  const exported = await requestJson(
    request,
    `/v1/system/stability/reports/export?baseline_release_id=${baselineReleaseId}&target_release_id=${targetReleaseId}`,
    {
      method: "GET",
      headers: auth
    }
  );
  expect(exported.status).toBe(200);
  expect(exported.body.content).toContain("metric,baseline,target,delta");
});
