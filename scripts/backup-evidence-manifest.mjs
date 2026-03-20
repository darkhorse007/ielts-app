#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  drill_id: "",
  release_id: "",
  env_name: "",
  database_provider: "postgres",
  db_instance: "",
  schema: "public",
  backup_provider: "",
  backup_artifact_id: "",
  recovery_point: "",
  backup_created_at: "",
  retention_until: "",
  restore_target: "",
  restore_started_at: "",
  restore_completed_at: "",
  actual_rpo_minutes: "",
  rpo_target_minutes: "15",
  rto_target_minutes: "60",
  evidence_paths: "",
  notes: "",
  artifact_root: "artifacts/backup-recovery",
  out_dir: "",
  template: "false",
  overwrite: "false",
  dry_run: "false"
};

const parseArgs = () => {
  const args = { ...defaults };
  const raw = process.argv.slice(2);
  for (let index = 0; index < raw.length; index += 1) {
    const token = raw[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = raw[index + 1];
    if (value == null || value.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = value;
    index += 1;
  }
  return args;
};

const isTruthy = (value) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "y" || normalized === "on";
};

const ensureCleanDir = (targetDir, overwrite) => {
  if (!fs.existsSync(targetDir)) {
    return;
  }
  if (!overwrite) {
    throw new Error(`output directory already exists: ${targetDir} (use --overwrite true to replace it)`);
  }
  fs.rmSync(targetDir, { recursive: true, force: true });
};

const requireField = (value, key) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`missing required argument --${key}`);
  }
  return normalized;
};

const optionalField = (value) => {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
};

const parseInteger = (value, fallback, key) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return fallback;
  }
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`invalid integer for --${key}`);
  }
  return parsed;
};

const parseIso = (value, key) => {
  const normalized = optionalField(value);
  if (!normalized) {
    return undefined;
  }
  if (Number.isNaN(Date.parse(normalized))) {
    throw new Error(`invalid ISO datetime for --${key}`);
  }
  return normalized;
};

const parseEvidencePaths = (value) =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const timestampId = () =>
  new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");

const calculateDurationMinutes = (startedAt, completedAt) => {
  if (!startedAt || !completedAt) {
    return undefined;
  }
  const durationMs = Date.parse(completedAt) - Date.parse(startedAt);
  if (durationMs < 0) {
    throw new Error("restore_completed_at must be later than restore_started_at");
  }
  return Math.round((durationMs / 60000) * 100) / 100;
};

const writeJson = (targetPath, value) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`);
};

const writeReadme = (targetPath, manifest) => {
  const content = `# Backup Recovery Evidence ${manifest.drill_id}

## Metadata
- generated_at: ${manifest.generated_at}
- status: ${manifest.status}
- release_id: ${manifest.release_id || "(not set)"}
- env_name: ${manifest.env_name || "(not set)"}

## Backup
- provider: ${manifest.backup.provider || "(not set)"}
- artifact_id: ${manifest.backup.artifact_id || "(not set)"}
- recovery_point: ${manifest.backup.recovery_point || "(not set)"}

## Restore
- target: ${manifest.restore.target || "(not set)"}
- started_at: ${manifest.restore.started_at || "(not set)"}
- completed_at: ${manifest.restore.completed_at || "(not set)"}
- actual_rto_minutes: ${manifest.objectives.actual_rto_minutes ?? "(not set)"}
- actual_rpo_minutes: ${manifest.objectives.actual_rpo_minutes ?? "(not set)"}

## Evidence Paths
${manifest.evidence_paths.length > 0 ? manifest.evidence_paths.map((item) => `- ${item}`).join("\n") : "- (none)"}
`;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content);
};

const main = () => {
  const args = parseArgs();
  const template = isTruthy(args.template);
  const dryRun = isTruthy(args.dry_run);
  const overwrite = isTruthy(args.overwrite);
  const generatedAt = new Date().toISOString();
  const drillId = optionalField(args.drill_id) || `BACKUP-DRILL-${timestampId()}`;
  const outDir = path.resolve(repoRoot, args.out_dir || path.join(args.artifact_root, drillId));

  const restoreStartedAt = parseIso(args.restore_started_at, "restore_started_at");
  const restoreCompletedAt = parseIso(args.restore_completed_at, "restore_completed_at");
  const backupCreatedAt = parseIso(args.backup_created_at, "backup_created_at");
  const retentionUntil = parseIso(args.retention_until, "retention_until");
  const actualRtoMinutes = calculateDurationMinutes(restoreStartedAt, restoreCompletedAt);
  const actualRpoMinutes = optionalField(args.actual_rpo_minutes)
    ? parseInteger(args.actual_rpo_minutes, undefined, "actual_rpo_minutes")
    : undefined;

  if (!template) {
    requireField(args.env_name, "env_name");
    requireField(args.backup_provider, "backup_provider");
    requireField(args.backup_artifact_id, "backup_artifact_id");
    requireField(args.restore_target, "restore_target");
  }

  const manifest = {
    artifact_type: "backup_recovery_evidence",
    generated_at: generatedAt,
    status: template ? "template" : actualRtoMinutes !== undefined ? "completed" : "draft",
    drill_id: drillId,
    release_id: optionalField(args.release_id),
    env_name: optionalField(args.env_name),
    database: {
      provider: optionalField(args.database_provider) || "postgres",
      instance: optionalField(args.db_instance),
      schema: optionalField(args.schema) || "public"
    },
    backup: {
      provider: optionalField(args.backup_provider),
      artifact_id: optionalField(args.backup_artifact_id),
      recovery_point: optionalField(args.recovery_point),
      created_at: backupCreatedAt,
      retention_until: retentionUntil
    },
    restore: {
      target: optionalField(args.restore_target),
      started_at: restoreStartedAt,
      completed_at: restoreCompletedAt
    },
    objectives: {
      rpo_target_minutes: parseInteger(args.rpo_target_minutes, 15, "rpo_target_minutes"),
      rto_target_minutes: parseInteger(args.rto_target_minutes, 60, "rto_target_minutes"),
      actual_rpo_minutes: actualRpoMinutes,
      actual_rto_minutes: actualRtoMinutes
    },
    evidence_paths: parseEvidencePaths(args.evidence_paths),
    notes: optionalField(args.notes)
  };

  if (dryRun) {
    console.log(JSON.stringify({ out_dir: outDir, manifest }, null, 2));
    return;
  }

  ensureCleanDir(outDir, overwrite);
  writeJson(path.join(outDir, "manifest.json"), manifest);
  writeReadme(path.join(outDir, "README.md"), manifest);
  console.log(`[backup-evidence] wrote ${path.join(outDir, "manifest.json")}`);
};

main();
