# Production Environment Matrix（生产环境矩阵）

## 1. 目的
1. 作为 `GA-03` 的首个正式产物，明确当前仓库在生产环境的最小可部署形态、配置项、密钥来源、部署入口与回滚入口。
2. 只记录当前代码库已存在的运行方式，不把 PRD / 架构蓝图中的远期组件误写为“已落地”。
3. 为 `GA-04`、`GA-05`、`GA-07`、`GA-09`、`GA-10` 提供共同输入。

## 2. 当前结论（截至 2026-03-14）
1. 当前仓库的实际部署单元是 `apps/client`（React 19 + Vite）与 `apps/server`（Fastify + WebSocket）。
2. 当前最稳妥的生产基线应是 `同域静态前端 + 反向代理 + 单服务端进程 + Postgres`。
3. `release`、`auth-account`、`learner-state`、`practice-state`、`speaking-state`、`writing-state`、`mock-state` 在生产中都应显式配置为 `postgres`，不能依赖默认 `sqlite|memory`。
4. 当前仓库已经具备较完整的质量门禁、Postgres smoke、恢复演练和 runbook，但尚未形成正式的生产部署流水线。
5. 支付与 AI provider 的首发生产口径已冻结为 `Stripe + Alipay`、退款 `manual_review`、`OpenAI` 主 provider、fallback 默认关闭；真实 secret manager、region/DPA 和联签材料仍需在目标环境完成。

## 3. 拓扑概览
当前代码库对应的推荐生产拓扑如下：

```text
Browser
  -> CDN / Static Hosting
  -> Reverse Proxy / Load Balancer
       -> /                -> apps/client 静态资源
       -> /v1/*            -> apps/server
       -> /health          -> apps/server /health
       -> ws(s) /v1/*      -> apps/server WebSocket
                               -> Postgres（release + auth + learner + practice + speaking + writing + mock）
```

补充说明：
1. 当前服务端未看到显式 CORS 配置，因此生产基线优先采用同域反向代理，而不是前后端分域直连。
2. `5173`、`8787`、`55432`、`55434` 是本地演练端口，不应直接照搬到生产。
3. `Redis`、对象存储、消息队列在架构文档中存在，但在当前仓库运行入口中尚未形成实际环境变量或部署单元，因此不纳入本次生产基线。

## 4. 组件矩阵
### 4.1 应用与运行时入口
| component | code path | current runtime | key vars | current default | production decision |
|---|---|---|---|---|---|
| Client Web | `apps/client` | Vite 开发服务器；浏览器通过 `/v1` 和 WebSocket 访问后端 | `VITE_API_BASE_URL`, `VITE_WS_BASE_URL`, `VITE_DEV_PROXY_TARGET` | `VITE_API_BASE_URL` 留空时走同源；`VITE_WS_BASE_URL` 留空时由 API 地址或页面来源推导；本地 proxy 默认转到 `http://127.0.0.1:8787` | 生产优先同域部署；若决定前后端分域，必须显式配置 API / WS 地址，并补 CORS 策略 |
| Server API + WS | `apps/server` | `npm run start --workspace @ielts/server` 启动单 Fastify 进程，同时承载 REST 与 WebSocket | `PORT`, `AUTH_SECRET|AUTH_SECRET_FILE`, `SYSTEM_RBAC_ENFORCED`, `PAYMENT_*`, `LLM_*` | `PORT=8787`；`SYSTEM_RBAC_ENFORCED=true`，仅显式传 `false` 才关闭；支付代码默认 `mockpay` 以兼容本地/测试；AI runtime 默认主 provider 名称为 `openai`，但未配置 endpoint/key 时 `ready=false` | 生产保持 `SYSTEM_RBAC_ENFORCED=true`；首发以 `PAYMENT_PROVIDER_DEFAULT=alipay`、live providers=`stripe + alipay`、`refund_handling=manual_review`、主 AI provider=`openai`、fallback 关闭为基线；通过 `/health` 挂到反向代理或 LB 健康检查 |
| Release / QA Automation | repo root + `scripts/` | 本地与 CI 使用 `release:checklist`、smoke、nightly drill 校验 | `RELEASE_AUTOMATION_*`, `TRACKING_GOVERNANCE_*` | 默认只跑 typecheck / test / tracking；Postgres smoke、frontend-full-e2e、script-tests 需显式打开 | RC / GA 前统一使用 strict governance，并输出 summary JSON 作为发布台账输入 |

### 4.2 数据与状态仓储
| domain | backend vars | backend default | connection fallback | production baseline | rollback note |
|---|---|---|---|---|---|
| release | `RELEASE_STORAGE_BACKEND`, `RELEASE_STORAGE_PATH`, `RELEASE_STORAGE_CONNECTION_STRING`, `RELEASE_STORAGE_SCHEMA` | `sqlite` + `data/release.db` | 无 | 显式设为 `postgres`；不要在生产常态使用 sqlite | 仅作为应急降级选项，回滚后需执行 release canary rollback |
| auth-account | `AUTH_ACCOUNT_STORAGE_BACKEND`, `AUTH_ACCOUNT_STORAGE_CONNECTION_STRING`, `AUTH_ACCOUNT_STORAGE_SCHEMA` | `memory` | 未显式提供时回退到 `RELEASE_STORAGE_CONNECTION_STRING` | 显式设为 `postgres` | 与 learner/release 联动回退 |
| learner-state | `LEARNER_STATE_STORAGE_BACKEND`, `LEARNER_STATE_STORAGE_CONNECTION_STRING`, `LEARNER_STATE_STORAGE_SCHEMA` | `memory` | learner -> auth-account -> release | 显式设为 `postgres` | 与 auth/release 联动回退 |
| practice-state | `PRACTICE_STATE_STORAGE_BACKEND`, `PRACTICE_STATE_STORAGE_CONNECTION_STRING`, `PRACTICE_STATE_STORAGE_SCHEMA` | `memory` | practice -> learner -> auth-account -> release | 显式设为 `postgres` | 与 learner/auth/release 联动回退 |
| speaking-state | `SPEAKING_STATE_STORAGE_BACKEND`, `SPEAKING_STATE_STORAGE_CONNECTION_STRING`, `SPEAKING_STATE_STORAGE_SCHEMA` | `memory` | speaking -> practice -> learner -> auth-account -> release | 显式设为 `postgres` | 与 practice/learner/auth/release 联动回退 |
| writing-state | `WRITING_STATE_STORAGE_BACKEND`, `WRITING_STATE_STORAGE_CONNECTION_STRING`, `WRITING_STATE_STORAGE_SCHEMA` | `memory` | writing -> speaking -> practice -> learner -> auth-account -> release | 显式设为 `postgres` | 与 speaking/practice/learner/auth/release 联动回退 |
| mock-state | `MOCK_STATE_STORAGE_BACKEND`, `MOCK_STATE_STORAGE_CONNECTION_STRING`, `MOCK_STATE_STORAGE_SCHEMA` | `memory` | mock -> writing -> speaking -> practice -> learner -> auth-account -> release | 显式设为 `postgres` | 内容链路回退入口从这里开始 |

补充说明：
1. Postgres 迁移脚本当前按 `release -> auth-account -> learner-state -> practice-state -> speaking-state -> writing-state -> mock-state` 顺序存在独立入口。
2. RC / 生产演练不要仅依赖 connection string 回退链推断当前后端，必须显式设置所有 `*_STORAGE_BACKEND=postgres`。
3. `schema` 在脚本层默认可回退到 `public`，但生产仍建议显式写明，避免误连或误写共享 schema。

### 4.3 第三方与提供方矩阵
| area | current repo evidence | current config entry | production status | GA judgement |
|---|---|---|---|---|
| Payment provider | 订阅升级接口与 webhook 已存在，provider 枚举含 `mockpay`, `stripe`, `alipay`；新增 `/v1/system/payments/runtime` | `PAYMENT_PROVIDER_DEFAULT`, `PAYMENT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS`, `PAYMENT_*_ENABLED`, `PAYMENT_*_WEBHOOK_SECRET[_FILE]` | 首发渠道已冻结为 `stripe + alipay`，生产示例默认 `alipay`，退款 handling 固定为 `manual_review` | GA 前仍需完成真实回调地址、secret manager 与 finance/legal signoff |
| AI / LLM provider | Provider health 页面与服务端样本聚合已存在；新增 runtime registry，可将 `primary-llm/fallback-llm` 映射为真实 provider 名称 | `LLM_PRIMARY_*`, `LLM_FALLBACK_*`, `LLM_ALLOW_USER_CONTENT_LOGGING` | 首发主 provider 已冻结为 `openai`，fallback 初始关闭，且已有只读 runtime summary | GA 前仍需完成 region/DPA、secret manager 与 legal/security signoff |
| Auth signing | 认证服务使用 `authSecret` 进行 access token 签名校验 | `AUTH_SECRET` 或 `AUTH_SECRET_FILE`；server 启动时强制要求外部注入，代码默认值仅保留给 `buildServer()` 测试场景 | 可接受但需运维落地 | 生产需接入 secret manager 或受控文件挂载，并形成轮换方案 |

## 5. 密钥来源与 Owner
| item | consumer | current source | owner suggestion | current status |
|---|---|---|---|---|
| Postgres connection string | server 启动、所有 `db:migrate:*:postgres`、Postgres smoke | 环境变量或 CLI 参数，仓库中不落盘 | ops + backend | 待在生产平台或 secret manager 中配置 |
| Postgres schema | server 启动、迁移脚本 | 环境变量或 CLI 参数 | ops + backend | 待确定用 `public` 还是独立 schema |
| Auth signing secret | `AuthService` | `AUTH_SECRET` / `AUTH_SECRET_FILE`；示例见 `apps/server/.env.example` | backend + security | 代码已支持，待生产平台配置 |
| Payment provider secret / webhook secret | 订阅升级、支付回调 | `PAYMENT_*_WEBHOOK_SECRET` 或 `PAYMENT_*_WEBHOOK_SECRET_FILE`；只读摘要见 `/v1/system/payments/runtime` | product + finance + backend + ops | 代码已支持；首发目标为 `stripe + alipay`，待真实回调地址与 secret manager 落地 |
| AI provider API key / endpoint | AI provider 调用、provider health | `LLM_PRIMARY_*`、`LLM_FALLBACK_*`；只读摘要见 `/v1/system/health/providers` `runtime_config` | backend + ops | 代码已支持；首发目标为 `openai` 主 provider / fallback 关闭，待 endpoint、secret manager 与 DPA 落地 |
| Release / tracking summary paths | `release:checklist`、tracking governance、RC package | 环境变量路径，例如 `/tmp/*.json` | release manager | 非密钥，但需要统一路径规范 |

## 6. 部署入口
### 6.1 生产前置校验
1. `npm run typecheck`
2. `npm test`
3. `bash docs/tracking/scripts/validate_tracking.sh`
4. `bash docs/tracking/scripts/status_summary.sh`
5. `RELEASE_AUTOMATION_RUN_POSTGRES_SMOKE=true RELEASE_AUTOMATION_RUN_FRONTEND_FULL_E2E=true RELEASE_AUTOMATION_RUN_CLIENT_ARTIFACT=true RELEASE_AUTOMATION_RUN_CLIENT_PUBLISH=true RELEASE_AUTOMATION_RUN_SCRIPT_TESTS=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001,TGW003 RELEASE_AUTOMATION_SUMMARY_PATH=/tmp/ielts-quality-gate-summary.json TRACKING_GOVERNANCE_SUMMARY_PATH=/tmp/ielts-tracking-governance-summary.json npm run release:checklist`

### 6.2 数据迁移入口
1. `npm run db:migrate:release:postgres --workspace @ielts/server -- --connection_string=... --schema=...`
2. `npm run db:migrate:auth-account:postgres --workspace @ielts/server -- --connection_string=... --schema=...`
3. `npm run db:migrate:learner-state:postgres --workspace @ielts/server -- --connection_string=... --schema=...`
4. `npm run db:migrate:practice-state:postgres --workspace @ielts/server -- --connection_string=... --schema=...`
5. `npm run db:migrate:speaking-state:postgres --workspace @ielts/server -- --connection_string=... --schema=...`
6. `npm run db:migrate:writing-state:postgres --workspace @ielts/server -- --connection_string=... --schema=...`
7. `npm run db:migrate:mock-state:postgres --workspace @ielts/server -- --connection_string=... --schema=...`

### 6.3 服务启动入口
1. 服务端当前入口是 `npm run start --workspace @ielts/server`。
2. 生产启动前应显式注入:
- `PORT`
- `AUTH_SECRET` 或 `AUTH_SECRET_FILE`
- `SYSTEM_RBAC_ENFORCED=true`
- `PAYMENT_PROVIDER_DEFAULT`
- 所有启用的 `PAYMENT_*_ENABLED`
- 所有启用 live provider 的 `PAYMENT_*_WEBHOOK_SECRET` 或 `PAYMENT_*_WEBHOOK_SECRET_FILE`
- 所有需要的 `LLM_PRIMARY_*`
- 若启用 fallback，则补齐 `LLM_FALLBACK_*`
- 所有 `*_STORAGE_BACKEND=postgres`
- 所有需要的 `*_STORAGE_CONNECTION_STRING`
- 所有需要的 `*_STORAGE_SCHEMA`
3. 健康检查入口是 `GET /health`。

### 6.4 客户端发布入口
1. 当前仓库已提供：
- `npm run build:client`
- `npm run preview:client`
- `npm run client:artifact`
- `npm run client:publish`
- `npm run smoke:client-build-publish:local`
2. 详细说明见 `docs/engineering/Client-Build-Artifact-Publish-Runbook.md`。
3. 结论:
- 当前客户端已经具备正式 build / artifact / publish 入口
- 真正生产发布仍需宿主平台完成静态目录同步、缓存刷新与上一版切回

### 6.5 CI / Nightly 入口
1. CI 门禁: `.github/workflows/stability-e2e.yml`
2. Nightly drill: `.github/workflows/stability-drill-nightly.yml`
3. 现状:
- 已有质量门禁与演练自动化
- 仍未看到正式生产 deploy workflow

## 7. 回滚入口
### 7.1 发布链路回滚
1. `POST /v1/system/release/canary/{canary_id}/rollback`
2. 回滚后应补记相应审计与发布记录，并确认 `stability_alert_handled`、`canary_release_rolled_back` 可追溯。

### 7.2 多仓储回退顺序
1. 建议按 `MOCK_STATE_STORAGE_BACKEND -> WRITING_STATE_STORAGE_BACKEND -> SPEAKING_STATE_STORAGE_BACKEND -> PRACTICE_STATE_STORAGE_BACKEND -> LEARNER_STATE_STORAGE_BACKEND -> AUTH_ACCOUNT_STORAGE_BACKEND -> RELEASE_STORAGE_BACKEND` 顺序处理。
2. 每次回退一个层级时，同步核对 connection string 是否仍通过上游回退链复用。
3. 该顺序已经在 `REL-068` 与现有 runbook 中作为内容链路应急回退基线。

### 7.3 数据迁移核验 / 降级入口
1. SQLite -> Postgres 迁移入口:
- `npm run db:migrate:release:sqlite-to-postgres -- --sqlite_db_path=apps/server/data/release.db --connection_string=... --schema=public --truncate_target=true`
2. 迁移核验入口:
- `npm run db:verify:release:sqlite-postgres -- --sqlite_db_path=apps/server/data/release.db --connection_string=... --schema=public --strict=true`
3. 本地 Postgres chaos 演练入口:
- `npm run drill:postgres-chaos:local`

## 8. 当前缺口与 GA 前待定项
1. client 已有 build / artifact / publish 入口，但仓库外 static host / CDN 同步与回退仍未冻结。
2. 认证签名密钥已支持外部注入，但生产 secret manager / 挂载方案与轮换流程仍待落实。
3. 服务端未见显式 CORS 配置，因此若要做前后端分域部署，必须先补跨域策略并做浏览器回归。
4. 支付 provider 已具备 runtime 入口与 webhook 验签 / replay guard，且首发渠道/退款口径已冻结为 `Stripe + Alipay + manual_review`；真实回调地址、客服/财务联签与 secret manager 仍待完成。
5. AI provider 已具备 runtime registry 与只读健康摘要，且首发主 provider 已冻结为 `OpenAI`、fallback 默认关闭；data processing signoff、endpoint/密钥托管与正式文案仍待完成。
6. 生产 Postgres 的托管方式、备份恢复、RTO / RPO 与 secret manager 仍需在 `GA-05` 中落定；仓库内仅新增证据 manifest 产物，不替代平台编排。
7. 当前 CI 只覆盖质量门禁与夜间演练，尚未形成正式 deploy / rollback workflow。

## 9. 后续文档依赖
1. `docs/engineering/Production-Incident-Runbook.md` 已落为 `GA-10` 的首个正式产物。
2. `docs/engineering/Production-Deploy-Rollback-Runbook.md` 已落为 `GA-04` 的首个正式产物。
3. `docs/engineering/Production-Database-Backup-Recovery-Runbook.md` 已落为 `GA-05` 的首个正式产物。
4. 支付、隐私、数据删除与 beta 计划仍需分别在 `GA-08`、`GA-09`、`GA-11` 中补齐。
