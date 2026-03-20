#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const execFileAsync = promisify(execFile);

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

const sleep = (ms) =>
  new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

const resolveNumber = (value, fallback, min) => {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.trunc(parsed));
};

const requestJson = async (url, init) => {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  return {
    status: response.status,
    ok: response.ok,
    body
  };
};

const ensureContainerId = async (preferredContainerId, imageName) => {
  if (preferredContainerId?.trim()) {
    return preferredContainerId.trim();
  }
  const { stdout } = await execFileAsync("docker", ["ps", "-a", "--filter", `ancestor=${imageName}`, "--format", "{{.ID}}"]);
  const first = stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!first) {
    throw new Error(`postgres container not found by ancestor=${imageName}`);
  }
  return first;
};

const registerAndLogin = async (baseUrl) => {
  const email = `chaos-drill-${randomUUID()}@example.com`;
  const password = "StrongPass123";
  const register = await requestJson(`${baseUrl}/v1/auth/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      email,
      password
    })
  });
  if (!register.ok) {
    throw new Error(`register failed: ${register.status}`);
  }

  const login = await requestJson(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      identifier: email,
      password,
      device_id: "chaos-drill"
    })
  });
  if (!login.ok) {
    throw new Error(`login failed: ${login.status}`);
  }

  const token = login.body.access_token;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("login response missing access_token");
  }
  return token;
};

const evaluateGate = async (baseUrl, token, releaseId) =>
  requestJson(`${baseUrl}/v1/system/release/gate/evaluate`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      release_id: releaseId,
      p0_defects: 0,
      regression_pass_rate: 99.9,
      api_success_rate: 99.9,
      provider_healthy: true
    })
  });

const evaluateGateSafe = async (baseUrl, token, releaseId) => {
  try {
    return await evaluateGate(baseUrl, token, releaseId);
  } catch (error) {
    return {
      status: 0,
      ok: false,
      body: {
        code: "FETCH_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = (args.base_url ?? "http://127.0.0.1:8787").replace(/\/+$/, "");
  const pgContainer = args.pg_container;
  const pgImage = args.pg_image ?? "postgres:16";
  const pgStartWaitMs = resolveNumber(args.pg_start_wait_ms, 2000, 0);
  const failureRetry = resolveNumber(args.failure_retry, 8, 1);
  const recoveryRetry = resolveNumber(args.recovery_retry, 20, 1);
  const retryIntervalMs = resolveNumber(args.retry_interval_ms, 500, 50);
  const releasePrefix = args.release_prefix ?? "REL-PG-CHAOS";
  const outputPath = args.output ? resolve(args.output) : undefined;

  const report = {
    started_at: new Date().toISOString(),
    base_url: baseUrl,
    pg_image: pgImage,
    pg_container: null,
    steps: {
      baseline: null,
      during_disconnect: null,
      recovered: null
    },
    attempts: {
      failure: 0,
      recovery: 0
    }
  };

  const token = await registerAndLogin(baseUrl);

  const baseline = await evaluateGate(baseUrl, token, `${releasePrefix}-BASELINE`);
  report.steps.baseline = {
    status: baseline.status,
    code: baseline.body?.code,
    passed: baseline.body?.passed
  };
  if (!baseline.ok) {
    throw new Error(`baseline release gate failed: ${baseline.status}`);
  }

  const containerId = await ensureContainerId(pgContainer, pgImage);
  report.pg_container = containerId;

  await execFileAsync("docker", ["stop", containerId]);

  let disconnectedResult = null;
  for (let i = 0; i < failureRetry; i += 1) {
    report.attempts.failure += 1;
    const attempt = await evaluateGateSafe(baseUrl, token, `${releasePrefix}-DISCONNECT-${i + 1}`);
    if (attempt.status === 503 && attempt.body?.code === "RELEASE_STORAGE_UNAVAILABLE") {
      disconnectedResult = attempt;
      break;
    }
    await sleep(retryIntervalMs);
  }
  report.steps.during_disconnect = {
    status: disconnectedResult?.status,
    code: disconnectedResult?.body?.code
  };

  await execFileAsync("docker", ["start", containerId]);
  if (pgStartWaitMs > 0) {
    await sleep(pgStartWaitMs);
  }

  let recoveredResult = null;
  for (let i = 0; i < recoveryRetry; i += 1) {
    report.attempts.recovery += 1;
    const attempt = await evaluateGateSafe(baseUrl, token, `${releasePrefix}-RECOVERY-${i + 1}`);
    if (attempt.ok && attempt.body?.passed === true) {
      recoveredResult = attempt;
      break;
    }
    await sleep(retryIntervalMs);
  }
  report.steps.recovered = {
    status: recoveredResult?.status,
    code: recoveredResult?.body?.code,
    passed: recoveredResult?.body?.passed
  };
  report.completed_at = new Date().toISOString();

  if (outputPath) {
    mkdirSync(dirname(outputPath), {
      recursive: true
    });
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
  }

  const success = Boolean(disconnectedResult) && Boolean(recoveredResult);
  report.ok = success;
  console.log(JSON.stringify(report, null, 2));

  if (!success) {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
