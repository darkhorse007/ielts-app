#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  release_id: "",
  build_id: "",
  client_dir: "apps/client",
  dist_dir: "apps/client/dist",
  artifact_root: "artifacts/client-builds",
  out_dir: "",
  api_base_url: "",
  ws_base_url: "",
  skip_build: "false",
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

const ensureCleanDir = (targetDir, overwrite, dryRun) => {
  if (!fs.existsSync(targetDir)) {
    return;
  }
  if (!overwrite) {
    throw new Error(`output directory already exists: ${targetDir} (use --overwrite true to replace it)`);
  }
  if (dryRun) {
    console.log(`[dry-run] would remove existing directory: ${targetDir}`);
    return;
  }
  fs.rmSync(targetDir, { recursive: true, force: true });
};

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

const collectFiles = (rootDir, currentDir = rootDir) => {
  const items = [];
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      items.push(...collectFiles(rootDir, entryPath));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const buffer = fs.readFileSync(entryPath);
    items.push({
      path: path.relative(rootDir, entryPath).replaceAll(path.sep, "/"),
      size_bytes: buffer.byteLength,
      sha256: createHash("sha256").update(buffer).digest("hex")
    });
  }
  return items.sort((a, b) => a.path.localeCompare(b.path));
};

const writeJson = (targetPath, value) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`);
};

const writeReadme = ({ targetPath, buildId, releaseId, createdAt, bundleDir, tarballName, apiBaseUrl, wsBaseUrl }) => {
  const content = `# Client Artifact ${buildId}

## Metadata
- created_at: ${createdAt}
- release_id: ${releaseId}
- bundle_dir: ${bundleDir}
- tarball: ${tarballName}
- api_base_url: ${apiBaseUrl || "(inherit at runtime)"}
- ws_base_url: ${wsBaseUrl || "(derive from api/page origin)"}

## Usage
1. Review \`manifest.json\` for file hashes.
2. Publish with:
   \`npm run client:publish -- --artifact_dir ${path.dirname(targetPath)}\`
3. For local smoke:
   \`npm run smoke:client-build-publish:local\`
`;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content);
};

const runBuild = ({ apiBaseUrl, wsBaseUrl }) => {
  const env = {
    ...process.env
  };
  if (apiBaseUrl) {
    env.VITE_API_BASE_URL = apiBaseUrl;
  }
  if (wsBaseUrl) {
    env.VITE_WS_BASE_URL = wsBaseUrl;
  }
  const result = spawnSync("npm", ["run", "build", "--workspace", "@ielts/client"], {
    cwd: repoRoot,
    stdio: "inherit",
    env
  });
  if (result.status !== 0) {
    throw new Error("client build failed");
  }
};

const createTarball = (bundleDir, tarballPath) => {
  const result = spawnSync("tar", ["-czf", tarballPath, "-C", bundleDir, "."], {
    cwd: repoRoot,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error("failed to create client artifact tarball");
  }
};

const main = () => {
  const args = parseArgs();
  const dryRun = isTruthy(args.dry_run);
  const overwrite = isTruthy(args.overwrite);
  const skipBuild = isTruthy(args.skip_build);
  const createdAt = new Date().toISOString();
  const releaseId = args.release_id?.trim() || `CLIENT-${timestampId()}`;
  const buildId = args.build_id?.trim() || `${sanitizeId(releaseId)}-${timestampId()}`;
  const clientDir = path.resolve(repoRoot, args.client_dir);
  const distDir = path.resolve(repoRoot, args.dist_dir);
  const outDir = path.resolve(repoRoot, args.out_dir || path.join(args.artifact_root, buildId));
  const bundleDir = path.join(outDir, "bundle");
  const tarballName = "client-dist.tar.gz";
  const tarballPath = path.join(outDir, tarballName);
  const envExamplePath = path.join(clientDir, ".env.example");

  if (!fs.existsSync(clientDir)) {
    throw new Error(`client directory not found: ${clientDir}`);
  }

  ensureCleanDir(outDir, overwrite, dryRun);

  if (dryRun) {
    console.log(`[dry-run] would build client for release ${releaseId}`);
    console.log(`[dry-run] artifact directory: ${outDir}`);
    return;
  }

  if (!skipBuild) {
    runBuild({
      apiBaseUrl: args.api_base_url?.trim(),
      wsBaseUrl: args.ws_base_url?.trim()
    });
  }

  if (!fs.existsSync(distDir)) {
    throw new Error(`client dist directory not found: ${distDir}`);
  }

  copyDir(distDir, bundleDir);
  createTarball(bundleDir, tarballPath);

  if (fs.existsSync(envExamplePath)) {
    const targetEnvExamplePath = path.join(outDir, "config", ".env.example");
    fs.mkdirSync(path.dirname(targetEnvExamplePath), { recursive: true });
    fs.copyFileSync(envExamplePath, targetEnvExamplePath);
  }

  const manifest = {
    artifact_type: "client_static_build",
    created_at: createdAt,
    release_id: releaseId,
    build_id: buildId,
    source: {
      client_dir: path.relative(repoRoot, clientDir),
      dist_dir: path.relative(repoRoot, distDir),
      build_command: "npm run build --workspace @ielts/client",
      api_base_url: args.api_base_url?.trim() || "",
      ws_base_url: args.ws_base_url?.trim() || ""
    },
    bundle: {
      dir: "bundle",
      tarball: tarballName,
      files: collectFiles(bundleDir)
    }
  };

  writeJson(path.join(outDir, "manifest.json"), manifest);
  writeReadme({
    targetPath: path.join(outDir, "README.md"),
    buildId,
    releaseId,
    createdAt,
    bundleDir: "bundle",
    tarballName,
    apiBaseUrl: args.api_base_url?.trim(),
    wsBaseUrl: args.ws_base_url?.trim()
  });

  console.log(`client artifact written to ${outDir}`);
};

main();
