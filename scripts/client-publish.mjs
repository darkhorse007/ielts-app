#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  artifact_dir: "",
  publish_root: "artifacts/client-published",
  out_dir: "",
  channel: "production",
  publish_id: "",
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

const timestampId = () =>
  new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");

const sanitizeId = (value) => value.replace(/[^a-zA-Z0-9._-]+/g, "-");

const copyDir = (sourceDir, targetDir) => {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
};

const writeJson = (targetPath, value) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`);
};

const main = () => {
  const args = parseArgs();
  const dryRun = isTruthy(args.dry_run);
  const overwrite = isTruthy(args.overwrite);
  const artifactDir = path.resolve(repoRoot, args.artifact_dir);
  if (!args.artifact_dir) {
    throw new Error("--artifact_dir is required");
  }
  if (!fs.existsSync(artifactDir)) {
    throw new Error(`artifact directory not found: ${artifactDir}`);
  }

  const manifestPath = path.join(artifactDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`artifact manifest not found: ${manifestPath}`);
  }

  const artifactManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const releaseId = String(artifactManifest.release_id ?? "").trim();
  if (!releaseId) {
    throw new Error(`artifact manifest missing release_id: ${manifestPath}`);
  }

  const publishId = args.publish_id?.trim() || `${sanitizeId(releaseId)}-${timestampId()}`;
  const publishRoot = path.resolve(repoRoot, args.publish_root);
  const outDir = path.resolve(repoRoot, args.out_dir || path.join(args.publish_root, args.channel, publishId));
  const wwwDir = path.join(outDir, "www");
  const publishedAt = new Date().toISOString();
  const currentPointerPath = path.join(publishRoot, args.channel, "current.json");
  const bundleDir = path.join(artifactDir, "bundle");

  if (!fs.existsSync(bundleDir)) {
    throw new Error(`artifact bundle not found: ${bundleDir}`);
  }

  if (fs.existsSync(outDir)) {
    if (!overwrite) {
      throw new Error(`publish directory already exists: ${outDir} (use --overwrite true to replace it)`);
    }
    if (dryRun) {
      console.log(`[dry-run] would remove existing publish directory: ${outDir}`);
    } else {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }

  const publishManifest = {
    publish_type: "client_static_publish",
    published_at: publishedAt,
    release_id: releaseId,
    build_id: artifactManifest.build_id,
    channel: args.channel,
    source_artifact_dir: path.relative(repoRoot, artifactDir),
    www_dir: "www"
  };

  if (dryRun) {
    console.log(`[dry-run] would publish client artifact ${path.relative(repoRoot, artifactDir)} to ${outDir}`);
    return;
  }

  copyDir(bundleDir, wwwDir);
  fs.mkdirSync(path.join(outDir, "artifacts"), { recursive: true });
  fs.copyFileSync(manifestPath, path.join(outDir, "artifacts", "source-artifact-manifest.json"));
  writeJson(path.join(outDir, "publish-manifest.json"), publishManifest);
  writeJson(currentPointerPath, {
    channel: args.channel,
    release_id: releaseId,
    publish_id: publishId,
    published_at: publishedAt,
    publish_dir: path.relative(repoRoot, outDir)
  });

  console.log(`client publish written to ${outDir}`);
  console.log(`current pointer updated: ${currentPointerPath}`);
};

main();
