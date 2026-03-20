#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const parseArgs = (argv) => {
  const result = {};
  for (const token of argv) {
    if (!token.startsWith("--")) {
      continue;
    }
    const eq = token.indexOf("=");
    if (eq < 0) {
      result[token.slice(2)] = "true";
      continue;
    }
    result[token.slice(2, eq)] = token.slice(eq + 1);
  }
  return result;
};

const args = parseArgs(process.argv.slice(2));
const baseUrl = (args.base_url ?? "http://localhost:8787").replace(/\/+$/, "");
const scenario = args.scenario ?? "high-latency";
const releaseId = args.release_id ?? "REL-S8-STABLE-DRILL";
const email = args.email ?? `qa-drill-${randomUUID()}@example.com`;
const password = args.password ?? "StrongPass123";
const retry = Math.max(0, Number(args.retry ?? 2));
const concurrency = Math.max(1, Number(args.concurrency ?? 2));
const outputPath = args.output ? resolve(args.output) : undefined;

const scenarioCheckpoints = {
  "high-latency": [
    { at_hour: 12, crash_count: 1, active_sessions: 2200, api_success_rate: 99.8, latency_p95_ms: 1800 },
    { at_hour: 24, crash_count: 1, active_sessions: 2300, api_success_rate: 99.7, latency_p95_ms: 2600 },
    { at_hour: 36, crash_count: 2, active_sessions: 2400, api_success_rate: 99.6, latency_p95_ms: 2900 }
  ],
  "low-success": [
    { at_hour: 12, crash_count: 1, active_sessions: 2400, api_success_rate: 99.3, latency_p95_ms: 1300 },
    { at_hour: 24, crash_count: 1, active_sessions: 2500, api_success_rate: 98.9, latency_p95_ms: 1250 },
    { at_hour: 36, crash_count: 1, active_sessions: 2550, api_success_rate: 98.6, latency_p95_ms: 1280 }
  ],
  "crash-surge": [
    { at_hour: 12, crash_count: 4, active_sessions: 1800, api_success_rate: 99.7, latency_p95_ms: 1200 },
    { at_hour: 24, crash_count: 8, active_sessions: 1700, api_success_rate: 99.6, latency_p95_ms: 1350 },
    { at_hour: 36, crash_count: 12, active_sessions: 1600, api_success_rate: 99.4, latency_p95_ms: 1400 }
  ]
};

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const requestJson = async (path, init) => {
  let attempts = 0;
  while (true) {
    attempts += 1;
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      }
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) {
      return body;
    }
    if (attempts > retry) {
      throw new Error(`${response.status} ${path}: ${typeof body.message === "string" ? body.message : "request failed"}`);
    }
    await sleep(150 * attempts);
  }
};

const registerAndLogin = async () => {
  await requestJson("/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password
    })
  });
  const login = await requestJson("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({
      identifier: email,
      password,
      device_id: "qa-drill"
    })
  });
  return {
    accessToken: login.access_token
  };
};

const runScenario = async (scenarioName, token) => {
  const checkpoints = scenarioCheckpoints[scenarioName];
  if (!checkpoints) {
    throw new Error(`unsupported scenario: ${scenarioName}`);
  }

  const scenarioReleaseId = `${releaseId}-${scenarioName.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
  const started = await requestJson("/v1/system/stability/soak-tests/start", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      release_id: scenarioReleaseId,
      planned_duration_hours: 72
    })
  });
  const runId = started.run_id;

  for (const point of checkpoints) {
    await requestJson(`/v1/system/stability/soak-tests/${runId}/checkpoints`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(point)
    });
  }

  const alerts = await requestJson(`/v1/system/stability/alerts?run_id=${encodeURIComponent(runId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  let acknowledgedAlertId;
  if (Array.isArray(alerts.items) && alerts.items.length > 0) {
    const firstAlert = alerts.items[0];
    await requestJson(`/v1/system/stability/alerts/${firstAlert.alert_id}/handle`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        action: "acknowledge",
        note: `acknowledged by drill script scenario=${scenarioName}`
      })
    });
    acknowledgedAlertId = firstAlert.alert_id;
  }

  return {
    scenario: scenarioName,
    release_id: scenarioReleaseId,
    run_id: runId,
    alert_total: alerts.total,
    acknowledged_alert_id: acknowledgedAlertId
  };
};

const main = async () => {
  const { accessToken } = await registerAndLogin();
  const startedAt = new Date().toISOString();
  const report = {
    started_at: startedAt,
    base_url: baseUrl,
    release_id_prefix: releaseId,
    retry,
    concurrency,
    results: []
  };
  if (scenario === "all") {
    const scenarioNames = Object.keys(scenarioCheckpoints);
    for (let index = 0; index < scenarioNames.length; index += concurrency) {
      const batch = scenarioNames.slice(index, index + concurrency);
      const results = await Promise.all(batch.map((scenarioName) => runScenario(scenarioName, accessToken)));
      report.results.push(...results);
    }
  } else {
    report.results.push(await runScenario(scenario, accessToken));
  }

  report.completed_at = new Date().toISOString();

  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
