# Client Build / Artifact / Publish Runbook（前端构建与出包手册）

## 1. 目的
1. 固化 `apps/client` 的标准 `build -> artifact -> publish` 链路。
2. 为 beta / GA 候选发布提供可重复执行的静态资源出包方式。
3. 明确仓库内已具备的能力与仍需宿主平台承接的步骤。

## 2. 当前入口（截至 2026-03-13）
1. 构建：
- `npm run build:client`
2. 预览：
- `npm run preview:client`
3. 生成 artifact：
- `npm run client:artifact -- --release_id REL-XXX`
4. 发布到本地 publish 目录：
- `npm run client:publish -- --artifact_dir artifacts/client-builds/<build-id>`
5. 本地 smoke：
- `npm run smoke:client-build-publish:local`

## 3. 构建前配置
1. 可选：
- `VITE_API_BASE_URL`
- `VITE_WS_BASE_URL`
2. 示例见：
- `apps/client/.env.example`

说明：
1. 未设置 `VITE_API_BASE_URL` 时，客户端默认走与页面同源的 `/v1` 路径。
2. 未设置 `VITE_WS_BASE_URL` 时，会从 API 基址或页面来源自动推导。

## 4. 标准流程
### 4.1 仅构建
```bash
npm run build:client
```

结果：
1. 产物输出到 `apps/client/dist/`

### 4.2 生成 artifact
```bash
npm run client:artifact -- \
  --release_id REL-070 \
  --api_base_url https://app.example.com \
  --ws_base_url wss://app.example.com
```

默认输出：
1. `artifacts/client-builds/<release-id>-<timestamp>/bundle/`
2. `artifacts/client-builds/<release-id>-<timestamp>/client-dist.tar.gz`
3. `artifacts/client-builds/<release-id>-<timestamp>/manifest.json`
4. `artifacts/client-builds/<release-id>-<timestamp>/README.md`

### 4.3 发布到本地 publish 目录
```bash
npm run client:publish -- \
  --artifact_dir artifacts/client-builds/REL-070-<timestamp>
```

默认输出：
1. `artifacts/client-published/production/<release-id>-<timestamp>/www/`
2. `artifacts/client-published/production/<release-id>-<timestamp>/publish-manifest.json`
3. `artifacts/client-published/production/current.json`

说明：
1. 这里的 `publish` 是仓库内的标准化“静态发布目录生成”。
2. 真正上线到 Nginx / CDN / 对象存储，仍需要宿主平台把 `www/` 同步到正式静态资源目录。

## 5. 本地验证
### 5.1 最小 smoke
```bash
npm run smoke:client-build-publish:local
```

通过标准：
1. artifact manifest 存在。
2. tarball 存在。
3. publish manifest 存在。
4. `www/index.html` 存在。
5. `current.json` 已指向最新 publish 输出。

### 5.2 release checklist 可选门禁
可通过以下环境变量把 client 出包纳入 `release:checklist`：

```bash
RELEASE_AUTOMATION_RUN_CLIENT_ARTIFACT=true \
RELEASE_AUTOMATION_RUN_CLIENT_PUBLISH=true \
RELEASE_AUTOMATION_CLIENT_RELEASE_ID=REL-070 \
npm run release:checklist
```

## 6. 目录约定
### 6.1 artifact
1. `bundle/`：静态文件目录。
2. `client-dist.tar.gz`：bundle 的归档包。
3. `manifest.json`：文件哈希、release_id、build_id 与构建配置。
4. `config/.env.example`：运行时配置示例快照。

### 6.2 publish
1. `www/`：可交给静态宿主直接发布的目录。
2. `publish-manifest.json`：发布时间、channel、来源 artifact。
3. `current.json`：当前 channel 指针。

## 7. 当前边界
1. 仓库现在已经具备标准 `build / artifact / publish` 脚本。
2. 仓库仍未直接管理正式 CDN、对象存储或反向代理 reload。
3. 若要做到真正生产全自动，还需要宿主平台接入：
- artifact registry
- static host sync
- CDN cache purge / reverse proxy reload
- 上一版本静态资源快速回退
