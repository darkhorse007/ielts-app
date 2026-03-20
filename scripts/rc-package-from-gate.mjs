#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const defaults = {
  summary: "/tmp/ielts-quality-gate-summary.json",
  tracking_summary: "/tmp/ielts-tracking-governance-summary.json",
  releases: "docs/tracking/releases.md",
  acceptance_template: "docs/engineering/RC-Acceptance-Checklist.md",
  known_issues_template: "docs/engineering/RC-Known-Issues-Template.md",
  demo_template: "docs/engineering/RC-Demo-Script.md",
  release_notes_template: "docs/engineering/RC-Release-Notes-Template.md",
  output_root: "artifacts/rc-packages",
  out_dir: "",
  package_id: "",
  release_id: "",
  scope: "RC scope",
  owner: "codex",
  rollback: "执行发布回滚方案",
  notes: "",
  summary_artifact: "quality-gate-summary-json",
  tracking_artifact: "quality-gate-tracking-governance-summary",
  require_tracking_summary: "false",
  overwrite: "false",
  dry_run: "false",
  release_record_script: "scripts/release-record-candidate.mjs"
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

const requireFile = (filePath, description) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${description} not found: ${filePath}`);
  }
};

const resolveNextReleaseId = (releasesContent) => {
  const matches = [...releasesContent.matchAll(/REL-(\d{3,})/g)];
  const maxId = matches.reduce((maxValue, match) => {
    const current = Number(match[1]);
    if (Number.isNaN(current)) {
      return maxValue;
    }
    return Math.max(maxValue, current);
  }, 0);
  return `REL-${String(maxId + 1).padStart(3, "0")}`;
};

const buildDefaultPackageId = (releaseId) => {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  return `RC-${releaseId}-${timestamp}`;
};

const copyFile = (sourcePath, targetPath) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
};

const parseReleaseRowFromStdout = (stdout) => {
  const lines = String(stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("| REL-"));
  return lines.at(-1) ?? "";
};

const buildPackageReadme = ({
  packageId,
  releaseId,
  scope,
  createdAt,
  packageDir,
  summaryStatus,
  trackingStatus,
  trackingSummaryPresent,
  files
}) => `# RC Package ${packageId}

## Metadata
- created_at: ${createdAt}
- release_id: ${releaseId}
- scope: ${scope}
- output_dir: ${packageDir}
- summary_status: ${summaryStatus}
- tracking_summary_present: ${trackingSummaryPresent}
- tracking_status: ${trackingStatus}

## Included Files
- release row: \`${files.releaseRow}\`
- manifest: \`${files.manifest}\`
- acceptance checklist: \`${files.acceptanceChecklist}\`
- known issues: \`${files.knownIssues}\`
- demo script: \`${files.demoScript}\`
- release notes: \`${files.releaseNotes}\`
- release summary: \`${files.releaseSummary}\`
${trackingSummaryPresent ? `- tracking summary: \`${files.trackingSummary}\`` : "- tracking summary: not included (file not found)"}

## Notes
1. This package is generated from gate summary artifacts and RC templates.
2. Release row is a candidate entry only; append to \`docs/tracking/releases.md\` separately when final closure is approved.
3. Templates are copied snapshots so later doc edits will not mutate this package.
`;

const main = () => {
  const args = parseArgs();
  const dryRun = isTruthy(args.dry_run);
  const overwrite = isTruthy(args.overwrite);
  const requireTrackingSummary = isTruthy(args.require_tracking_summary);

  const summaryPath = path.resolve(args.summary);
  const trackingSummaryPath = path.resolve(args.tracking_summary);
  const releasesPath = path.resolve(args.releases);
  const acceptanceTemplatePath = path.resolve(args.acceptance_template);
  const knownIssuesTemplatePath = path.resolve(args.known_issues_template);
  const demoTemplatePath = path.resolve(args.demo_template);
  const releaseNotesTemplatePath = path.resolve(args.release_notes_template);
  const releaseRecordScriptPath = path.resolve(args.release_record_script);

  requireFile(summaryPath, "summary file");
  requireFile(releasesPath, "releases file");
  requireFile(acceptanceTemplatePath, "acceptance checklist template");
  requireFile(knownIssuesTemplatePath, "known issues template");
  requireFile(demoTemplatePath, "demo script template");
  requireFile(releaseNotesTemplatePath, "release notes template");
  requireFile(releaseRecordScriptPath, "release record script");

  const trackingSummaryExists = fs.existsSync(trackingSummaryPath);
  if (requireTrackingSummary && !trackingSummaryExists) {
    throw new Error(`tracking summary file not found: ${trackingSummaryPath}`);
  }
  if (!trackingSummaryExists) {
    console.warn(`[rc-package-from-gate] WARN: tracking summary not found, skip copy: ${trackingSummaryPath}`);
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  const trackingSummary = trackingSummaryExists
    ? JSON.parse(fs.readFileSync(trackingSummaryPath, "utf8"))
    : null;
  const releasesContent = fs.readFileSync(releasesPath, "utf8");
  const releaseId = args.release_id ? String(args.release_id) : resolveNextReleaseId(releasesContent);
  const packageId = args.package_id ? String(args.package_id) : buildDefaultPackageId(releaseId);
  const packageDir = path.resolve(args.out_dir || path.join(args.output_root, packageId));

  if (fs.existsSync(packageDir)) {
    if (!overwrite) {
      throw new Error(`output directory already exists: ${packageDir} (use --overwrite true to replace it)`);
    }
    if (dryRun) {
      console.log(`[dry-run] would remove existing directory: ${packageDir}`);
    } else {
      fs.rmSync(packageDir, { recursive: true, force: true });
    }
  }

  const createdAt = new Date().toISOString();
  const files = {
    readme: "README.md",
    manifest: "manifest.json",
    releaseRow: "release-row.md",
    acceptanceChecklist: "docs/RC-Acceptance-Checklist.md",
    knownIssues: "docs/RC-Known-Issues-Template.md",
    demoScript: "docs/RC-Demo-Script.md",
    releaseNotes: "docs/RC-Release-Notes-Template.md",
    releaseSummary: "artifacts/release-check-summary.json",
    trackingSummary: "artifacts/tracking-governance-summary.json"
  };

  const releaseRowPath = path.join(packageDir, files.releaseRow);
  const releaseRecordArgs = [
    releaseRecordScriptPath,
    "--summary",
    summaryPath,
    "--releases",
    releasesPath,
    "--release_id",
    releaseId,
    "--scope",
    args.scope,
    "--owner",
    args.owner,
    "--rollback",
    args.rollback,
    "--summary_artifact",
    args.summary_artifact,
    "--tracking_artifact",
    args.tracking_artifact,
    "--out",
    releaseRowPath,
    "--append",
    "false",
    "--dry_run",
    dryRun ? "true" : "false"
  ];

  if (trackingSummaryExists) {
    releaseRecordArgs.push("--tracking_summary", trackingSummaryPath);
  }
  if (args.notes) {
    releaseRecordArgs.push("--notes", args.notes);
  }

  if (!dryRun) {
    fs.mkdirSync(packageDir, { recursive: true });
  }

  const releaseRecordResult = spawnSync(process.execPath, releaseRecordArgs, {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  if (releaseRecordResult.status !== 0) {
    const stderr = String(releaseRecordResult.stderr ?? "").trim();
    throw new Error(stderr || "failed to generate release row");
  }

  const releaseRow = parseReleaseRowFromStdout(releaseRecordResult.stdout);
  if (!releaseRow) {
    throw new Error("failed to parse generated release row from release-record-candidate output");
  }

  const manifest = {
    package_id: packageId,
    created_at: createdAt,
    package_dir: packageDir,
    release_id: releaseId,
    scope: args.scope,
    owner: args.owner,
    rollback: args.rollback,
    summary_path: summaryPath,
    tracking_summary_path: trackingSummaryExists ? trackingSummaryPath : "",
    summary_status: summary.status ?? "unknown",
    tracking_summary_present: trackingSummaryExists,
    tracking_status: trackingSummary?.status ?? "missing",
    dry_run: dryRun,
    files
  };
  const readme = buildPackageReadme({
    packageId,
    releaseId,
    scope: args.scope,
    createdAt,
    packageDir,
    summaryStatus: summary.status ?? "unknown",
    trackingStatus: trackingSummary?.status ?? "missing",
    trackingSummaryPresent: trackingSummaryExists,
    files
  });

  if (dryRun) {
    console.log(`[dry-run] would create rc package at ${packageDir}`);
    console.log(`[dry-run] release_row=${releaseRow}`);
    console.log(`[dry-run] included=${Object.values(files).join(",")}`);
    return;
  }

  fs.mkdirSync(path.join(packageDir, "docs"), { recursive: true });
  fs.mkdirSync(path.join(packageDir, "artifacts"), { recursive: true });

  copyFile(acceptanceTemplatePath, path.join(packageDir, files.acceptanceChecklist));
  copyFile(knownIssuesTemplatePath, path.join(packageDir, files.knownIssues));
  copyFile(demoTemplatePath, path.join(packageDir, files.demoScript));
  copyFile(releaseNotesTemplatePath, path.join(packageDir, files.releaseNotes));
  copyFile(summaryPath, path.join(packageDir, files.releaseSummary));
  if (trackingSummaryExists) {
    copyFile(trackingSummaryPath, path.join(packageDir, files.trackingSummary));
  }

  fs.writeFileSync(path.join(packageDir, files.readme), `${readme}\n`, "utf8");
  fs.writeFileSync(path.join(packageDir, files.manifest), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`rc package written to ${packageDir}`);
  console.log(releaseRow);
};

try {
  main();
} catch (error) {
  console.error(`[rc-package-from-gate] ${error.message}`);
  process.exit(1);
}
