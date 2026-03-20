# Production Deploy / Rollback Runbook（生产部署与回滚手册）

## 1. 目的
1. 作为 `GA-04` 的首个正式产物，明确当前仓库在生产环境下可执行的部署、验收与回滚步骤。
2. 只记录当前代码库已经具备的发布入口，不把尚未标准化的自动化能力误写成“已就绪”。
3. 为 `GA-14` 的真实发布总演练提供基础操作手册。

## 2. 适用范围（截至 2026-03-14）
1. 适用于当前推荐生产基线：`同域前端 + 反向代理 + apps/server + Postgres`。
2. 默认沿用以下文档作为前置输入：
- `docs/engineering/Production-Environment-Matrix.md`
- `docs/engineering/Production-Incident-Runbook.md`
- `docs/engineering/S9-Release-Runbook.md`
 - `docs/engineering/Client-Build-Artifact-Publish-Runbook.md`
3. 当前仓库没有 Dockerfile、systemd、pm2、k8s、Helm 或正式 deploy workflow，因此本文是“手册式部署基线”，不是平台自动化说明。

## 3. 当前支持边界
| release type | current status | why |
|---|---|---|
| `server-only` | Supported | 服务端已有明确启动命令、健康检查、Postgres 迁移脚本、质量门禁与回滚接口 |
| `server + db migration` | Supported | 各状态域均已有独立 Postgres 迁移入口，且已有 smoke / recovery / chaos drill 基线 |
| `client included` | Supported with manual host sync | 仓库已具备 `build / artifact / publish` 脚本与本地 smoke，但正式 CDN / 反向代理 reload 仍依赖宿主平台 |

结论：
1. 当前 `GA-04` 已具备服务端、数据库和前端静态资源出包基线。
2. 若发布包包含前端代码变更，仍需按宿主平台完成静态目录同步与 cache / proxy 刷新。

## 4. 发布角色
| function | owner suggestion | responsibility |
|---|---|---|
| release manager | ops + eng | 协调整体窗口、执行 checklist、判断 Go / No-Go |
| db operator | backend + ops | 执行 Postgres 迁移、确认 schema / backup / rollback 准备 |
| qa on duty | qa | 执行发布后验收、验证主链路与告警 |
| admin operator | admin role holder | 执行 `/v1/system/release/*` 查询与必要 rollback |

## 5. 发布前输入
### 5.1 必备配置
1. `PORT`
2. `AUTH_SECRET` 或 `AUTH_SECRET_FILE`
3. `SYSTEM_RBAC_ENFORCED=true`
4. `PAYMENT_PROVIDER_DEFAULT`
5. 所有启用 provider 的 `PAYMENT_*_ENABLED`
6. 所有启用 live provider 的 `PAYMENT_*_WEBHOOK_SECRET` 或 `PAYMENT_*_WEBHOOK_SECRET_FILE`
7. 所有需要的 `LLM_PRIMARY_*`
8. 若启用 fallback，则补齐 `LLM_FALLBACK_*`
9. `RELEASE_STORAGE_BACKEND=postgres`
10. `AUTH_ACCOUNT_STORAGE_BACKEND=postgres`
11. `LEARNER_STATE_STORAGE_BACKEND=postgres`
12. `PRACTICE_STATE_STORAGE_BACKEND=postgres`
13. `SPEAKING_STATE_STORAGE_BACKEND=postgres`
14. `WRITING_STATE_STORAGE_BACKEND=postgres`
15. `MOCK_STATE_STORAGE_BACKEND=postgres`
16. 对应的所有 `*_STORAGE_CONNECTION_STRING`
17. 对应的所有 `*_STORAGE_SCHEMA`

### 5.2 必备权限与凭据
1. 具备 `admin` 系统角色的 token，用于查看 release metrics、provider health、canary 状态与执行 rollback。
2. Postgres 连接串与 schema。
3. 生产宿主机或平台上的进程控制权限。

### 5.3 当前阻断项
1. 认证签名密钥已支持外置，但生产 secret manager / 挂载与轮换流程仍需平台侧落地。
2. client 已具备正式构建入口，但正式静态宿主/CDN 同步仍不在仓库内。
3. 支付与 AI provider 的首发口径已冻结为 `Stripe + Alipay`、退款 `manual_review`、`OpenAI` 主 provider、fallback 默认关闭；真实密钥托管、region/DPA 与生产联签仍需在目标环境落地。

## 6. 标准发布前检查
### 6.1 最低门禁
1. `npm run typecheck`
2. `npm test`
3. `bash docs/tracking/scripts/validate_tracking.sh`
4. `bash docs/tracking/scripts/status_summary.sh`
5. `RELEASE_AUTOMATION_RUN_POSTGRES_SMOKE=true RELEASE_AUTOMATION_RUN_FRONTEND_FULL_E2E=true RELEASE_AUTOMATION_RUN_CLIENT_ARTIFACT=true RELEASE_AUTOMATION_RUN_CLIENT_PUBLISH=true RELEASE_AUTOMATION_RUN_SCRIPT_TESTS=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001,TGW003 RELEASE_AUTOMATION_SUMMARY_PATH=/tmp/ielts-quality-gate-summary.json TRACKING_GOVERNANCE_SUMMARY_PATH=/tmp/ielts-tracking-governance-summary.json npm run release:checklist`

### 6.2 推荐附加检查
1. `npm run smoke:learner-restart:e2e-local`
2. `npm run smoke:content-restart:e2e-local`
3. `npm run drill:postgres-chaos:local`
4. `npm run smoke:client-build-publish:local`
5. `npm run rc:package:from-gate -- --summary /tmp/ielts-quality-gate-summary.json --tracking_summary /tmp/ielts-tracking-governance-summary.json --scope "GA candidate" --rollback "执行生产回滚方案"`

### 6.3 发布材料
1. `quality-gate-summary-json`
2. `quality-gate-tracking-governance-summary`
3. RC 包目录或等效候选发布材料
4. 已更新的 `docs/tracking/releases.md` 候选行

## 7. 数据库迁移步骤
### 7.1 执行顺序
1. `npm run db:migrate:release:postgres --workspace @ielts/server -- --connection_string=... --schema=...`
2. `npm run db:migrate:auth-account:postgres --workspace @ielts/server -- --connection_string=... --schema=...`
3. `npm run db:migrate:learner-state:postgres --workspace @ielts/server -- --connection_string=... --schema=...`
4. `npm run db:migrate:practice-state:postgres --workspace @ielts/server -- --connection_string=... --schema=...`
5. `npm run db:migrate:speaking-state:postgres --workspace @ielts/server -- --connection_string=... --schema=...`
6. `npm run db:migrate:writing-state:postgres --workspace @ielts/server -- --connection_string=... --schema=...`
7. `npm run db:migrate:mock-state:postgres --workspace @ielts/server -- --connection_string=... --schema=...`

### 7.2 执行要求
1. 所有迁移在正式重启服务前完成。
2. 发布窗口内不允许混用 `memory` / `sqlite` / `postgres` 默认值推断当前后端。
3. 若需要从 SQLite 向 Postgres 首次切换，先执行：
- `npm run db:migrate:release:sqlite-to-postgres -- --sqlite_db_path=apps/server/data/release.db --connection_string=... --schema=public --truncate_target=true`
- `npm run db:verify:release:sqlite-postgres -- --sqlite_db_path=apps/server/data/release.db --connection_string=... --schema=public --strict=true`

## 8. Server 发布步骤
### 8.1 部署前冻结
1. 冻结本次发布范围，确认 `GA scope` 未发生临时扩张。
2. 确认回滚责任人、DB 操作人、QA 验收人在线。
3. 确认当前问题清单中没有未接受的 P0 / P1 问题。

### 8.2 停旧进程
1. 记录当前运行版本、启动参数、连接串与日志路径。
2. 通过宿主机进程管理器或等效方式停止旧 server。
3. 若仅为手工演练环境，可参考：
```bash
bash scripts/ci/stop-server.sh /path/to/server.pid
```

### 8.3 启动新进程
推荐使用与 CI 一致的健康检查语义：

```bash
PORT=8787 \
AUTH_SECRET=<32-char-or-longer-secret> \
SYSTEM_RBAC_ENFORCED=true \
PAYMENT_PROVIDER_DEFAULT=alipay \
PAYMENT_MOCKPAY_ENABLED=false \
PAYMENT_STRIPE_ENABLED=true \
PAYMENT_STRIPE_WEBHOOK_SECRET=<stripe-webhook-secret> \
PAYMENT_ALIPAY_ENABLED=true \
PAYMENT_ALIPAY_WEBHOOK_SECRET=<alipay-webhook-secret> \
LLM_PRIMARY_PROVIDER_NAME=openai \
LLM_PRIMARY_ENDPOINT=https://api.openai.example/v1 \
LLM_PRIMARY_API_KEY=<openai-api-key> \
LLM_FALLBACK_ENABLED=false \
AUTH_ACCOUNT_STORAGE_BACKEND=postgres \
AUTH_ACCOUNT_STORAGE_CONNECTION_STRING=postgresql://... \
AUTH_ACCOUNT_STORAGE_SCHEMA=public \
LEARNER_STATE_STORAGE_BACKEND=postgres \
LEARNER_STATE_STORAGE_CONNECTION_STRING=postgresql://... \
LEARNER_STATE_STORAGE_SCHEMA=public \
PRACTICE_STATE_STORAGE_BACKEND=postgres \
PRACTICE_STATE_STORAGE_CONNECTION_STRING=postgresql://... \
PRACTICE_STATE_STORAGE_SCHEMA=public \
SPEAKING_STATE_STORAGE_BACKEND=postgres \
SPEAKING_STATE_STORAGE_CONNECTION_STRING=postgresql://... \
SPEAKING_STATE_STORAGE_SCHEMA=public \
WRITING_STATE_STORAGE_BACKEND=postgres \
WRITING_STATE_STORAGE_CONNECTION_STRING=postgresql://... \
WRITING_STATE_STORAGE_SCHEMA=public \
MOCK_STATE_STORAGE_BACKEND=postgres \
MOCK_STATE_STORAGE_CONNECTION_STRING=postgresql://... \
MOCK_STATE_STORAGE_SCHEMA=public \
RELEASE_STORAGE_BACKEND=postgres \
RELEASE_STORAGE_CONNECTION_STRING=postgresql://... \
RELEASE_STORAGE_SCHEMA=public \
bash scripts/ci/start-server-and-wait.sh \
  --command "npm run start --workspace @ielts/server" \
  --log-file "/var/log/ielts-app/server.log" \
  --pid-file "/var/run/ielts-app/server.pid" \
  --health-url "http://127.0.0.1:8787/health" \
  --timeout-seconds 60
```

说明：
1. `start-server-and-wait.sh` 只是健康检查辅助脚本，不负责生产守护。
2. 正式生产仍需外部 supervisor / service manager 托管，但该层当前不在仓库内。
3. 若健康检查在 60 秒内未通过，立即进入回滚判定，不继续放量。
4. 当前首发生产基线默认启用 `Stripe + Alipay + OpenAI`；若与该冻结值不一致，必须在变更单中显式批准后再调整对应 `PAYMENT_*` / `LLM_*` 变量。

### 8.4 启动后最小验收
1. `GET /health` 返回 `200`.
2. 使用 `admin` token 查询：
- `GET /v1/system/health/providers`
- `GET /v1/system/payments/runtime`
- `GET /v1/system/release/metrics`
3. 确认：
- provider 未处于 `red`
- payment runtime 中所有启用 live provider 的 `webhook_secret_configured=true`
- `storage_resilience.circuit_open=false`
- `failed_writes` 未持续增长
- `SYSTEM_RBAC_ENFORCED` 未被错误关闭

## 9. Client 发布说明
### 9.1 当前现状
1. 仓库中已提供：
- `npm run build:client`
- `npm run preview:client`
- `npm run client:artifact`
- `npm run client:publish`
- `npm run smoke:client-build-publish:local`
2. 详细步骤见 `docs/engineering/Client-Build-Artifact-Publish-Runbook.md`。
3. 当前 `publish` 输出的是仓库内标准化静态发布目录；真正线上同步仍需宿主平台执行。

### 9.2 当前可接受结论
1. 若本次发布是 `server-only` 或 `server + db`，可按本文继续推进。
2. 若本次发布包含 client 代码变更，可先在仓库内完成：
- build
- artifact
- publish 目录生成
3. 正式生产窗口还需在宿主平台补执行：
- 静态目录同步
- 反向代理 / CDN 刷新
- 上一版静态目录保留与快速切回

## 10. 发布后验收
### 10.1 Blocking 检查
1. `/health` 通过。
2. `/v1/system/release/metrics` 无明显写失败异常。
3. `/v1/system/health/providers` 未出现新的 `red` 告警。
4. 如本次发布涉及支付或 AI provider 切换，确认 `/v1/system/payments/runtime` 与 `/v1/system/health/providers` `runtime_config` 与变更单一致。
5. 至少完成一轮关键 API / 主链路抽检。

### 10.2 推荐抽检
1. 学员主链路：登录 -> 入门目标 -> 首次诊断 -> 8 周计划。
2. 内容主链路：practice -> writing -> mock。
3. 系统主链路：provider health、stability alerts、release metrics。

### 10.3 台账同步
1. 更新 `docs/tracking/releases.md`。
2. 若存在部署异常或 workaround，更新 `docs/tracking/risk-register.csv`。
3. 若形成新的验收材料，补充 RC / GA 相关文档索引。

## 11. 回滚判定
### 11.1 立即回滚条件
1. 新进程无法通过 `/health`。
2. 发布后出现 `503 RELEASE_STORAGE_UNAVAILABLE` 且短时间无法恢复。
3. `red` 告警连续 2 次且指标恶化。
4. 人工确认用户面影响超过 5%。

### 11.2 先冻结扩量、再观察的条件
1. 单点 `yellow` 或短时 provider degraded。
2. 指标波动但未影响主链路且无持续恶化趋势。

## 12. 回滚步骤
### 12.1 应用层回滚
若本次发布已触发应用内 release / canary 流程，由 `admin` 执行：

```bash
curl -X POST \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -H "x-idempotency-key: <uuid>" \
  http://<host>/v1/system/release/canary/<canary_id>/rollback \
  -d '{
    "reason": "production rollback: health gate or stability gate failed",
    "expected_version": 1
  }'
```

### 12.2 进程级回滚
1. 停止当前新进程。
2. 重新启动上一份已验证通过的 server 版本。
3. 启动命令仍应使用与第 8 节一致的环境变量和健康检查方式。
4. 当前仓库未提供“上一版本 artifact”管理能力，因此此步骤依赖外部发布平台或宿主机版本管理，GA 前必须补齐。

### 12.3 配置级回退
若问题与多仓储配置有关，按以下顺序回退：
1. `MOCK_STATE_STORAGE_BACKEND`
2. `WRITING_STATE_STORAGE_BACKEND`
3. `SPEAKING_STATE_STORAGE_BACKEND`
4. `PRACTICE_STATE_STORAGE_BACKEND`
5. `LEARNER_STATE_STORAGE_BACKEND`
6. `AUTH_ACCOUNT_STORAGE_BACKEND`
7. `RELEASE_STORAGE_BACKEND`

要求：
1. 每退一层，都要同步检查对应 `*_STORAGE_CONNECTION_STRING` 是否仍通过上游回退链复用。
2. 配置级回退后，再执行应用层 rollback 或服务重启。

## 13. 回滚后验收
1. `/health` 恢复。
2. `/v1/system/release/metrics` 中 `failed_writes` 不再继续增长。
3. `/v1/system/stability/alerts` 不再出现新的更高等级异常。
4. 审计中可追溯到：
- `canary_release_rolled_back`
- `stability_alert_handled`
5. `docs/tracking/releases.md` 已记录回滚事实与原因。

## 14. 当前缺口
1. server 当前使用 `tsx src/index.ts` 直接启动，没有正式编译产物与 immutable artifact。
2. client 已有正式 build / artifact / publish 入口，但未接入正式 artifact registry / static host。
3. 没有正式 deploy workflow、artifact registry 或宿主机服务管理配置。
4. 没有标准化的“上一版本快速恢复”入口。
5. 支付与 AI provider 虽已具备 runtime 入口和只读摘要，且首发值已冻结，但真实 secret manager、region/DPA 与最终签署口径仍待落地。
6. 备份恢复已补 evidence manifest 脚本，但仍未替代数据库平台侧 backup / PITR 编排。

## 15. 下一步建议
1. `docs/engineering/Production-Database-Backup-Recovery-Runbook.md` 已落为 `GA-05` 的首个正式产物。
2. `docs/engineering/Production-Deployment-Recovery-Drill-Record.md` 已落为 `GA-04` / `GA-05` 的联合签署模板。
3. 若要真正完成 `GA-04` 与 `GA-05` 的“完整演练签署”，还需按该模板补一次真实窗口、真实启动、真实回滚与真实恢复计时结果。
