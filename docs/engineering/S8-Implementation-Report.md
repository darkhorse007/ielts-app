# S8 实施报告（US-10201 / US-10202）

## 1. 交付概览
- 完成状态: Done
- 完成日期: 2026-02-28
- 覆盖 Story: 2/2
- 代码范围:
  - 服务端: `apps/server/`
  - 客户端: `apps/client/`
  - 契约文档:
    - `docs/engineering/openapi/S8-Beta-Feedback.yaml`
    - `docs/engineering/openapi/S8-Stability-Report.yaml`

## 2. Story 到交付映射

### 2.1 US-10201 Beta 渠道与反馈回流
- 服务端
  - `apps/server/src/domain/release-service.ts`（Beta 白名单、反馈提交、反馈优先级升级）
  - `apps/server/src/routes/system.ts`（`/v1/system/beta/whitelist*`、`/v1/system/beta/feedback*`）
  - `apps/server/src/domain/types.ts`、`apps/server/src/domain/store.ts`（Beta 模型与存储）
- 客户端
  - `apps/client/src/pages/ObservabilityPage.tsx`（Beta 白名单管理、反馈提交与升级）
  - `apps/client/src/lib/api-client.ts`、`apps/client/src/lib/api-types.ts`（Beta API 与类型）
- 测试
  - `apps/server/tests/s8-beta-feedback.test.ts`
  - `apps/client/tests/s6-observability-admin-pages.test.tsx`

### 2.2 US-10202 稳定性长测与趋势报告
- 服务端
  - `apps/server/src/domain/release-service.ts`（72h 长测、检查点采集、趋势报告、版本对比、CSV 导出、告警触发/查询/处理）
  - `apps/server/src/routes/system.ts`（`/v1/system/stability/*`）
  - `apps/server/src/domain/types.ts`、`apps/server/src/domain/store.ts`（稳定性告警模型与存储）
  - `apps/server/scripts/stability-soak-drill.mjs`（高延迟/低成功率/崩溃激增三类故障注入演练）
- 客户端
  - `apps/client/src/pages/ObservabilityPage.tsx`（长测启动、检查点记录、报告查询/对比/导出、告警筛选与处理）
  - `apps/client/src/lib/api-client.ts`、`apps/client/src/lib/api-types.ts`（稳定性 API 与类型）
- 测试
  - `apps/server/tests/s8-stability-report.test.ts`
  - `apps/client/tests/s6-observability-admin-pages.test.tsx`

### 2.3 收口加固（后续任务 8～10）
- 服务端回归补强
  - `apps/server/tests/s8-stability-report.test.ts` 新增检查点覆盖去重与已解决告警二次处理冲突场景。
- 客户端回归补强
  - `apps/client/tests/s6-observability-admin-pages.test.tsx` 新增告警 `level/status` 过滤组合与 `resolve` 处理动作断言。
- 演练归档
  - `docs/tracking/sprints/S8-Stability-Drill-Report.md` 记录真实演练命令、场景、run_id、告警结果。

### 2.4 发布链路强化（Todo 1～10 首批落地）
- 服务端
  - `apps/server/src/domain/release-repository.ts`（ReleaseRepository 抽象、InMemory/SQLite 双实现）
  - `apps/server/src/domain/release-service.ts`（去耦仓储、幂等键回放、版本冲突保护）
  - `apps/server/src/routes/system.ts`（RBAC 可开关、版本冲突/幂等冲突错误码）
  - `apps/server/scripts/release-db-migrate.mjs`、`apps/server/scripts/release-db-seed.mjs`（迁移与种子）
  - `apps/server/src/index.ts`（默认 SQLite + RBAC 开启）
- 客户端
  - `apps/client/src/pages/ObservabilityPage.tsx`（告警分页/排序、筛选偏好持久化、处理历史）
  - `apps/client/e2e/stability-alert-flow.playwright.mjs`（稳定性链路 Playwright API E2E）
- 工程与运维
  - `.github/workflows/stability-drill-nightly.yml`（nightly 演练与产物归档）
  - `docs/engineering/S9-Release-Runbook.md`（SLA、值班、回滚决策树、验收清单）

### 2.5 持续推进（RBAC 运营化 + E2E CI）
- 服务端
  - `apps/server/src/routes/system.ts`（新增系统用户角色管理接口 `GET/PUT /v1/system/users/{user_id}/roles`）
  - `apps/server/src/domain/auth-service.ts`（角色读写能力与审计事件 `system_user_roles_updated`）
  - `apps/server/tests/s8-stability-report.test.ts`（RBAC 下角色分配闭环回归）
- 客户端
  - `apps/client/src/lib/api-client.ts`、`apps/client/src/lib/api-types.ts`（系统用户角色 API）
  - `apps/client/src/pages/ObservabilityPage.tsx`（系统角色管理面板：按用户查询/更新 learner/qa/ops/admin）
  - `apps/client/tests/s6-observability-admin-pages.test.tsx`（角色查询与更新交互回归）
- 质量与 CI
  - `apps/client/e2e/stability-alert-flow.spec.mjs`（Playwright 稳定性链路 E2E）
  - `.github/workflows/stability-e2e.yml`（PR/手动触发 E2E 执行）
  - `apps/client/package.json`（引入 `@playwright/test` 与 `test:e2e:stability`）

### 2.6 持续推进（二期收口：角色管理独立页面 + 角色审计查询）
- 服务端
  - `apps/server/src/routes/system.ts`（新增 `GET /v1/system/users/roles/audit`）
  - `apps/server/src/domain/auth-service.ts`（新增角色审计查询能力，支持按目标用户/操作人过滤与分页）
  - `apps/server/tests/s8-system-user-roles.test.ts`（新增系统角色管理与角色审计专项测试）
- 客户端
  - `apps/client/src/pages/SystemRoleAdminPage.tsx`（新增独立系统角色管理台：角色查询/更新 + 审计查询）
  - `apps/client/src/App.tsx`、`apps/client/src/pages/HomePage.tsx`（接入 `/system-roles` 路由与入口）
  - `apps/client/src/lib/api-client.ts`、`apps/client/src/lib/api-types.ts`（新增角色审计 API 与类型）
  - `apps/client/tests/s8-system-role-admin-page.test.tsx`（新增页面交互测试）
- 文档
  - `docs/engineering/openapi/S8-Stability-Report.yaml`（补充角色审计接口契约）
  - `docs/engineering/Interface-Task-Checklist.md`（新增 API-033 任务项）

### 2.7 持续推进（三期收口：入口去重 + E2E 套件扩展）
- 客户端
  - `apps/client/src/pages/ObservabilityPage.tsx`（下线重复系统角色操作区，保留 `/system-roles` 跳转）
  - `apps/client/tests/s6-observability-admin-pages.test.tsx`（去除重复角色操作断言，改为独立页入口断言）
- E2E 与 CI
  - `apps/client/e2e/system-role-audit-flow.spec.mjs`（新增系统角色更新与角色审计回归链路）
  - `apps/client/package.json`（新增 `test:e2e`、`test:e2e:system-roles`）
  - `.github/workflows/stability-e2e.yml`（执行命令由 `test:e2e:stability` 升级为 `test:e2e`）

### 2.8 持续推进（四期收口：质量门禁强制化）
- CI
  - `.github/workflows/stability-e2e.yml`（workflow 名称升级为 `quality-gate`）
  - 新增 `typecheck-and-test` job（`npm run typecheck` + `npm test`）
  - E2E job 串联到门禁链路（`needs: typecheck-and-test`）
  - 新增 `postgres-smoke` job（GitHub Actions `postgres:16` service + 集成测试）
  - 新增聚合 `quality-gate` job，作为分支保护可配置的单一 Required Check
- 运维文档
  - `docs/engineering/S9-Release-Runbook.md` 新增 PR 门禁与分支保护配置建议（Required: `quality-gate / quality-gate`）

### 2.9 持续推进（五期收口：发布存储后端扩展到 Postgres）
- 服务端
  - `apps/server/src/domain/release-repository.ts`（新增 `PostgresReleaseRepository`）
  - `apps/server/src/app.ts`（`releaseStorageBackend` 扩展到 `postgres`，并在 `onReady` 等待 `releaseRepository.ready()`）
  - `apps/server/src/index.ts`（新增 `RELEASE_STORAGE_CONNECTION_STRING` / `RELEASE_STORAGE_SCHEMA` 配置读取）
  - `apps/server/scripts/release-db-migrate-postgres.mjs`（新增 Postgres 表结构迁移脚本）
  - `apps/server/scripts/release-db-seed-postgres.mjs`（新增 Postgres 数据初始化脚本）
  - `apps/server/tests/s8-release-repository-adapter.test.ts`（新增仓储适配器生命周期与 postgres 配置校验测试）
  - `apps/server/tests/s8-release-repository-postgres.integration.test.ts`（新增 Postgres 跨重启持久化集成测试，按环境变量启用）
- 依赖与脚本
  - `apps/server/package.json`（新增 `pg`、`@types/pg` 与 `db:migrate:release:postgres` / `db:seed:release:postgres`）
- 运维文档
  - `docs/engineering/S9-Release-Runbook.md`（发布前检查新增 Postgres 迁移与环境变量说明）

### 2.10 持续推进（七期收口：发布存储强一致收敛）
- 服务端
  - `apps/server/src/domain/release-repository.ts`（`ReleaseRepository` 新增 `flush()`，Postgres 写失败可被感知）
  - `apps/server/src/domain/release-service.ts`（新增 `flush()` 代理方法）
  - `apps/server/src/routes/system.ts`（系统写接口响应前统一执行 durability barrier；失败返回 `503 RELEASE_STORAGE_UNAVAILABLE`）
  - `apps/server/tests/s8-release-repository-adapter.test.ts`（新增 flush 失败故障注入用例）
- 结果
  - 在 Postgres 后端场景下，将“返回 2xx 但尚未持久化”的窗口收敛为“先持久化再响应”。

### 2.11 持续推进（八期收口：稳定性关键写链路服务层异步化）
- 服务端
  - `apps/server/src/domain/release-service.ts`（新增 `recordStabilityCheckpointAsync` / `handleStabilityAlertAsync`）
  - `apps/server/src/routes/system.ts`（稳定性检查点与告警处理路由切换到服务层 async API）
  - `apps/server/tests/s8-release-repository-adapter.test.ts`（新增 async 路径 flush 失败返回 503 的回归）
- 结果
  - 稳定性关键写接口不再依赖路由层通用 flush 辅助，而由服务层 async API 内聚持久化屏障语义。

### 2.12 持续推进（九期收口：发布写路径服务层异步化第二批）
- 服务端
  - `apps/server/src/domain/release-service.ts`（新增 `evaluateGateAsync`、`startCanaryAsync`、`promoteCanaryAsync`、`rollbackCanaryAsync`、`startStabilitySoakRunAsync`、`upsertBetaWhitelistAsync`、`submitBetaFeedbackAsync`、`escalateBetaFeedbackAsync`）
  - `apps/server/src/routes/system.ts`（对应写路由切换到 `*Async`，删除路由层 flush helper，并统一 `RELEASE_STORAGE_UNAVAILABLE -> 503` 映射）
  - `apps/server/tests/s8-release-repository-adapter.test.ts`（扩展 canary/soak-start/beta async 写路径 flush 失败故障注入回归）
- 结果
  - 发布链路主要写接口已统一收敛到服务层 async durability barrier，路由层仅保留领域错误码映射与响应组装。

### 2.13 持续推进（十期收口：Release 领域错误类型化）
- 服务端
  - `apps/server/src/domain/release-service.ts`（新增 `ReleaseServiceError`、`ReleaseServiceErrorCode`、`isReleaseServiceError`，并替换 release 域字符串异常）
  - `apps/server/src/routes/system.ts`（新增统一错误映射表 `RELEASE_SERVICE_ERROR_RESPONSES` 与 `replyReleaseServiceError` helper，移除大量 `error.message` 分支判断）
- 结果
  - release 相关异常由字符串比较升级为类型化错误判定，路由错误映射更集中，降低后续接口扩展时的分支回归风险。

### 2.14 持续推进（十一期收口：Canary/Beta 写接口幂等化）
- 服务端
  - `apps/server/src/domain/release-service.ts`（为 `startCanary`、`promoteCanary`、`rollbackCanary`、`upsertBetaWhitelist`、`submitBetaFeedback`、`escalateBetaFeedback` 增加 `idempotencyKey` 回放与冲突保护）
  - `apps/server/src/routes/system.ts`（对应写接口统一读取并透传 `x-idempotency-key`）
  - `apps/server/tests/s8-release-idempotency.test.ts`（新增 canary/beta 的回放与冲突专项回归）
- 结果
  - 发布链路幂等能力从稳定性写路径扩展到 canary/beta 写路径，重复提交不再产生重复副作用，并对 key 复用错配显式返回 `IDEMPOTENCY_KEY_CONFLICT`。

### 2.15 持续推进（十二期收口：Canary/Beta 并发控制）
- 服务端
  - `apps/server/src/domain/types.ts`（`CanaryRelease`、`BetaWhitelistEntry`、`BetaFeedback` 新增 `version` 字段）
  - `apps/server/src/domain/release-service.ts`（`promote/rollback canary`、`upsert beta whitelist`、`escalate beta feedback` 增加 `expectedVersion` 校验与版本递增）
  - `apps/server/src/routes/system.ts`（对应请求 schema 增加 `expected_version`，响应增加 `version`）
  - `apps/server/tests/s8-release-idempotency.test.ts`（新增版本冲突专项回归）
- 客户端
  - `apps/client/src/lib/api-types.ts`、`apps/client/src/lib/api-client.ts`（补充 `version` 响应字段与 `expected_version` 请求参数）
  - `apps/client/tests/s6-observability-admin-pages.test.tsx`（mock 数据补齐 `version` 字段）
- 结果
  - canary/beta 关键写路径具备乐观并发控制能力，支持“读到版本 -> 带版本更新 -> 冲突显式返回”模式，降低并发写覆盖风险。

### 2.16 持续推进（十三期收口：Postgres API E2E Smoke 门禁）
- CI
  - `.github/workflows/stability-e2e.yml`（新增 `postgres-e2e-smoke` job）
  - `postgres-e2e-smoke` 使用 GitHub Actions `postgres:16` service，执行 `db:migrate:release:postgres` 后，以 `RELEASE_STORAGE_BACKEND=postgres` 启动 server 并运行 `npm run test:e2e:stability --workspace @ielts/client`
  - 聚合 `quality-gate` job 增加 `postgres-e2e-smoke` 依赖
- 结果
  - `quality-gate` 从“Postgres 仓储 smoke”扩展到“Postgres 后端 API E2E smoke”，覆盖后端启动链路与稳定性 API E2E 链路。

### 2.17 持续推进（十四期收口：发布链路可运维性与回归增强）
- 工程脚本与 CI
  - `scripts/local-postgres-e2e-smoke.sh`（本地一键 Postgres API smoke：拉起 Postgres、迁移、启动 Postgres 后端、执行 `test:e2e:stability`）
  - `scripts/ci/start-server-and-wait.sh`、`scripts/ci/stop-server.sh`（抽取 workflow 公共 server 启停与健康检查逻辑）
  - `.github/workflows/stability-e2e.yml`（接入公共脚本；Postgres job 归档数据库日志；`quality-gate` 输出失败汇总表并基于依赖结果统一 fail-fast）
- 服务端
  - `apps/server/src/domain/release-service.ts`（新增发布链路运行指标：幂等回放/冲突率、写链路时延统计与阈值告警；新增 `getBetaFeedback`）
  - `apps/server/src/routes/system.ts`（新增 `GET /v1/system/release/metrics` 与 `GET /v1/system/beta/feedback/{feedback_id}`）
  - `apps/server/tests/s8-release-idempotency.test.ts`（新增指标接口与 feedback-by-id 回归）
  - `apps/server/tests/s8-release-repository-postgres-recovery.integration.test.ts`（新增 Postgres 瞬时写失败后恢复回归）
- 客户端
  - `apps/client/src/lib/api-client.ts`（新增 `ApiRequestError`；canary/beta 版本冲突自动拉取最新版本并单次重试）
  - `apps/client/src/pages/ObservabilityPage.tsx`（新增发布链路指标看板入口）
  - `apps/client/tests/s8-api-client-release-retry.test.ts`（新增冲突自动重试回归）
  - `apps/client/e2e/stability-ui-flow.spec.mjs`（新增页面交互型 Playwright 稳定性流程）
- 结果
  - 发布链路从“可用”推进到“可观测+可恢复+可复现”，并补齐 Postgres 断连恢复与页面交互回归。

### 2.18 持续推进（十五期收口：OpenAPI 契约补齐与一致性校验）
- OpenAPI
  - `docs/engineering/openapi/S8-Beta-Feedback.yaml`（补充 `GET /v1/system/beta/feedback/{feedback_id}`；补充 beta 写接口 `expected_version`、`x-idempotency-key` 与版本冲突错误码描述）
  - `docs/engineering/openapi/S8-Stability-Report.yaml`（新增 `GET /v1/system/release/metrics`；补充稳定性写接口冲突错误码语义）
- 测试
  - `apps/server/tests/s8-openapi-contract-sync.test.ts`（新增文档关键契约与运行时关键字段一致性测试）
  - 复跑 `apps/server/tests/s8-release-idempotency.test.ts`，确保新增文档契约与既有行为一致
- 结果
  - 文档契约补齐到当前实际接口能力（metrics/feedback-by-id/冲突语义），并通过自动化测试降低后续迭代中的文档漂移风险。

### 2.19 持续推进（十六期收口：稳定性正式操作页）
- 客户端
  - `apps/client/src/pages/StabilityOpsPage.tsx`（新增正式稳定性控制台页面，覆盖发布运行指标、长测启动、检查点记录、趋势报告、告警加载与处理）
  - `apps/client/src/App.tsx`（新增路由 `/stability`）
  - `apps/client/src/pages/HomePage.tsx`（新增“稳定性控制台”入口）
  - `apps/client/tests/s9-stability-ops-page.test.tsx`（新增页面级交互回归）
- 结果
  - 稳定性操作能力从内部 smoke 页扩展到正式客户端路由页面，形成可持续迭代的页面级入口与测试基线。

### 2.20 持续推进（十七期收口：正式页面 Playwright 交互 + 移动端视口）
- 客户端与执行脚本
  - `apps/client/index.html`、`apps/client/vite.config.ts`、`apps/client/package.json`（补齐 Vite 本地运行壳与 `/v1` 代理，新增 `test:e2e:stability-page`）
  - `apps/client/e2e/stability-page-flow.spec.mjs`（新增正式页面 `/stability` Playwright 交互流程，覆盖桌面与移动端视口）
  - `scripts/local-stability-page-e2e.sh`、`package.json`（新增一键本地命令 `smoke:stability-page:e2e-local`，自动拉起后端+前端并执行页面 E2E）
  - `apps/client/src/lib/api-client.ts`（修复浏览器环境 `fetch` 调用上下文，避免 `Illegal invocation`）
- 结果
  - 稳定性正式页面交互已具备可重复的浏览器自动化回归（desktop+mobile），并支持本地一键执行。

### 2.21 持续推进（十八期收口：视觉快照回归接入 CI）
- 客户端与脚本
  - `apps/client/e2e/visual-snapshots.spec.mjs`（新增视觉快照采集：`/observability`、`/stability`、`/system-roles`，覆盖 desktop+mobile）
  - `apps/client/package.json`（新增 `test:e2e:visual`）
  - `scripts/local-visual-snapshots-e2e.sh`、`package.json`（新增本地一键命令 `smoke:visual-snapshots:e2e-local`）
- CI
  - `.github/workflows/stability-e2e.yml`（新增 `visual-snapshots` job：自动启动前后端、执行视觉快照用例、归档快照产物）
- 结果
  - 视觉快照已形成可自动执行和可追溯的 CI 产物链路，支持后续页面级视觉回归对比演进。

### 2.22 持续推进（十九期收口：Postgres 仓储强一致恢复语义）
- 服务端
  - `apps/server/src/domain/release-repository.ts`
  - `flush()` 在检测写失败后会触发内存态恢复（回读 Postgres 重建 map），避免“请求返回 503 但内存残留未持久化写入”的状态漂移。
  - 增加恢复快照回滚，防止恢复过程中异常导致内存态被清空。
- 测试
  - `apps/server/tests/s8-release-repository-postgres-recovery.integration.test.ts`
  - 新增失败后内存回滚断言，确保失败写不会污染后续读状态。
- 结果
  - Postgres 后端在写失败场景下由“仅报错”升级为“报错 + 状态自愈”，收敛非持久化状态泄漏风险。

### 2.23 持续推进（二十期收口：SQLite -> Postgres 迁移与核验工具链）
- 服务端脚本
  - `apps/server/scripts/release-db-migrate-sqlite-to-postgres.mjs`（按表迁移+upsert，支持 `truncate_target` 与行数核验）
  - `apps/server/scripts/release-db-verify-sqlite-postgres.mjs`（跨库按 key 对齐校验，可选 strict 数据内容比对）
- 命令入口
  - `apps/server/package.json`：`db:migrate:release:sqlite-to-postgres`、`db:verify:release:sqlite-postgres`
  - `package.json`：同名根命令透传到 server workspace
- 结果
  - 发布存储迁移从“手工导入”升级为“可脚本化迁移 + 可重复核验”闭环。

### 2.24 持续推进（二十一期收口：Postgres 写路径恢复策略加固）
- 服务端
  - `apps/server/src/domain/release-repository.ts`
  - 新增写路径 `retry/backoff`（可配置重试次数与退避窗口）。
  - 新增 `circuit-breaker`（连续失败阈值触发短时熔断，冷却后自动恢复）。
  - 为 `pg Pool` 增加 `error` 监听，避免数据库断连时因未处理事件导致 Node 进程退出。
  - 新增可配置项：`RELEASE_POSTGRES_WRITE_MAX_ATTEMPTS`、`RELEASE_POSTGRES_WRITE_RETRY_BASE_MS`、`RELEASE_POSTGRES_WRITE_RETRY_MAX_MS`、`RELEASE_POSTGRES_WRITE_CIRCUIT_FAILURE_THRESHOLD`、`RELEASE_POSTGRES_WRITE_CIRCUIT_COOLDOWN_MS`。
- 测试
  - `apps/server/tests/s8-release-repository-postgres-recovery.integration.test.ts`
  - 新增“瞬时故障自动重试成功”和“熔断后冷却恢复”回归。
- 结果
  - 写链路由单点失败直接暴露，升级为可恢复故障优先自愈，提高短抖动场景成功率与稳定性。

### 2.25 持续推进（二十二期收口：Nightly Postgres 混沌演练自动化）
- 服务端与脚本
  - `apps/server/scripts/postgres-chaos-drill.mjs`（自动执行“基线成功 -> 断连 503 -> 恢复 2xx”链路并产出 JSON 报告）
  - `scripts/local-postgres-chaos-drill.sh`（本地一键演练）
  - `apps/server/package.json`：`drill:postgres-chaos`
  - `package.json`：`drill:postgres-chaos:local`
- CI
  - `.github/workflows/stability-drill-nightly.yml`
  - 保留既有稳定性 drill，并新增 `postgres-chaos-drill` job（Postgres service + 后端 Postgres 模式启动 + chaos 脚本执行 + artifacts 归档）。
- 结果
  - 夜间演练从“稳定性指标场景回放”扩展到“数据库故障恢复能力”自动验证。

### 2.26 持续推进（二十三期收口：发布自动化收口）
- 工程脚本
  - `scripts/release-automation-check.sh`（一键串行执行 typecheck/test/tracking 校验，可按环境变量启用 E2E/Postgres smoke）
  - `package.json`：`release:checklist`
- 文档与台账
  - `docs/engineering/S9-Release-Runbook.md`（新增迁移核验、混沌 drill 与发布一键校验说明）
  - `docs/tracking/releases.md`（新增 REL-024~REL-028）
  - `docs/tracking/sprints/S8.md`（新增十九期~二十三期收口日志）
- 结果
  - 发布验收路径从分散命令清单收敛为可复用脚本流程，降低人肉漏项风险。

### 2.27 持续推进（二十四期收口：写恢复状态可观测化）
- 服务端
  - `apps/server/src/domain/release-repository.ts`（`ReleaseRepository` 新增 `getWriteResilienceState()`；Postgres 暴露 circuit/openUntil/failureCount/lastError 等状态）
  - `apps/server/src/domain/release-service.ts`、`apps/server/src/routes/system.ts`（`/v1/system/release/metrics` 响应新增 `storage_resilience` 字段）
- 客户端
  - `apps/client/src/lib/api-types.ts`（补齐 `storage_resilience` 类型）
  - `apps/client/src/pages/ObservabilityPage.tsx`、`apps/client/src/pages/StabilityOpsPage.tsx`（展示 storage backend 与 circuit open/closed）
- 测试与契约
  - `apps/server/tests/s8-release-idempotency.test.ts`、`apps/server/tests/s8-openapi-contract-sync.test.ts`（新增 `storage_resilience` 断言）
  - `docs/engineering/openapi/S8-Stability-Report.yaml`（补齐 `storage_resilience` 契约字段）
- 结果
  - 发布链路指标从“时延/幂等统计”扩展到“仓储恢复状态观测”，便于识别熔断窗口与恢复进展。

### 2.28 持续推进（二十五期收口：Nightly Drill Summary 强化）
- CI
  - `.github/workflows/stability-drill-nightly.yml`
  - 为 `drill` 与 `postgres-chaos-drill` job 增加 `GITHUB_STEP_SUMMARY` 输出（场景、run_id、告警量、断连/恢复状态与尝试次数）。
- 结果
  - 夜间演练结果不再仅依赖 artifact 下载，可在 workflow summary 直接读取关键结论。

### 2.29 持续推进（二十六期收口：Circuit 告警阈值与审计事件）
- 服务端
  - `apps/server/src/domain/release-service.ts`
  - 在 `flushOrThrow` 增加仓储恢复状态观察器：当 circuit 打开/持续超阈值/恢复时，分别记录 `release_write_circuit_opened`、`release_write_circuit_prolonged`、`release_write_circuit_recovered` 审计事件。
  - 支持参数 `RELEASE_POSTGRES_CIRCUIT_ALERT_THRESHOLD_MS`（默认 `30000`）。
  - `getOperationalMetrics()` 新增 `storageResilienceAlerting`（阈值、计数、recent 事件）。
- 接口与契约
  - `apps/server/src/routes/system.ts`：`/v1/system/release/metrics` 中 `storage_resilience.alerting` 对外透出。
  - `docs/engineering/openapi/S8-Stability-Report.yaml`：补齐 `storage_resilience.alerting` schema。
- 测试
  - `apps/server/tests/s8-release-repository-postgres-recovery.integration.test.ts`：新增 circuit 打开/恢复期间 metrics 状态断言。
- 结果
  - 发布链路恢复能力从“状态可见”升级为“状态可告警+可审计”，便于值班快速定位熔断窗口与恢复耗时。

### 2.30 持续推进（二十七期收口：发布恢复告警前端明细可视化）
- 客户端
  - `apps/client/src/pages/ObservabilityPage.tsx`
  - 在 `loadReleaseOperationalMetrics()` 增加 `storage_resilience.alerting` 摘要与 recent 事件解析，并新增列表展示（`storage-alerting-recent`）。
  - `apps/client/src/pages/StabilityOpsPage.tsx`
  - 延续上一期改动，确认稳定性控制台同样展示 `storage_alerting` 摘要与 recent 明细，统一运维观察面板行为。
- 测试
  - `apps/client/tests/s9-stability-ops-page.test.tsx`
  - `apps/client/tests/s6-observability-admin-pages.test.tsx`
  - 新增 `storage_alerting` 摘要与 recent 事件列表渲染断言，覆盖 circuit opened 场景。
- 结果
  - 发布恢复状态在两处运维页面均可直接查看最近熔断事件，缩短告警排查路径并降低跨页信息割裂。

### 2.31 持续推进（二十八期收口：发布恢复告警 E2E 回归补齐）
- 客户端 E2E
  - `apps/client/e2e/stability-page-flow.spec.mjs`
  - 在 `/stability` 页面流程中新增 `storage_alerting` 摘要与 `storage-alerting-recent` 列表断言，确保 UI 端可观测信息不回退。
  - `apps/client/e2e/stability-alert-flow.spec.mjs`
  - 新增 `/v1/system/release/metrics` 的 `storage_resilience.alerting` 结构断言（阈值字段与 recent 数组），并切换测试用户前缀为 `admin-` 以匹配 `release:manage` RBAC 权限。
- 回归
  - `npm run test:e2e:stability-page --workspace @ielts/client`
  - `npm run test:e2e:stability --workspace @ielts/client`
- 结果
  - 发布恢复告警从“单元/集成可见”扩展到“浏览器/API E2E 双链路可见”，在 RBAC 开启场景下保持用例稳定。

### 2.32 持续推进（二十九期收口：质量门禁纳入视觉快照阻断）
- CI
  - `.github/workflows/stability-e2e.yml`
  - `quality-gate` 聚合 job 新增 `visual-snapshots` 依赖，并将其结果写入 Step Summary 与失败判定循环。
- 文档
  - `docs/engineering/S9-Release-Runbook.md`
  - 将视觉快照描述从“仅归档”更新为“纳入 gate 失败聚合判定”。
- 结果
  - 页面视觉回归由“旁路监控”升级为“强制门禁”，降低 UI 退化在合并阶段漏检风险。

### 2.33 持续推进（三十期收口：System RBAC 权限矩阵回归）
- 服务端测试
  - `apps/server/tests/s8-system-rbac-matrix.test.ts`
  - 新增四角色（`learner/qa/ops/admin`）对发布/稳定性/Beta 关键接口的矩阵断言：
    - `GET /v1/system/release/metrics`
    - `POST /v1/system/stability/soak-tests/start`
    - `GET /v1/system/stability/alerts`
    - `PUT /v1/system/beta/whitelist/{user_id}`
    - `GET /v1/system/beta/whitelist`
- 结果
  - RBAC 权限边界由“单点场景”升级为“矩阵场景”回归，降低权限漂移风险。

### 2.34 持续推进（三十一期收口：Storage Resilience 告警队列上限与可观测增强）
- 服务端
  - `apps/server/src/domain/release-service.ts`
  - `storage_resilience.alerting.recent` 改为环形缓冲（ring buffer）。
  - 新增参数 `RELEASE_POSTGRES_CIRCUIT_ALERT_RECENT_LIMIT`（默认 `30`）。
  - `storageResilienceAlerting` 新增 `recentLimit`、`recentCount`、`cappedCount` 指标。
  - `apps/server/src/routes/system.ts`：`/v1/system/release/metrics` 对外新增
    `storage_resilience.alerting.recent_limit/recent_count/capped_count`。
- 客户端与契约
  - `apps/client/src/lib/api-types.ts`、`apps/client/src/pages/StabilityOpsPage.tsx`、`apps/client/src/pages/ObservabilityPage.tsx` 同步展示与类型。
  - `docs/engineering/openapi/S8-Stability-Report.yaml` 补齐新增字段。
- 测试
  - `apps/server/tests/s8-release-repository-adapter.test.ts`：新增 ring buffer 上限回归（recent 保留最新 N 条且出现 capped）。
  - `apps/server/tests/s8-openapi-contract-sync.test.ts`、`apps/server/tests/s8-release-idempotency.test.ts`
    补齐新字段断言。
  - `apps/client/tests/s9-stability-ops-page.test.tsx`、`apps/client/tests/s6-observability-admin-pages.test.tsx`
    补齐 `recent/capped` 展示断言。
- 结果
  - 熔断告警 recent 队列具备硬上限和截断可观测能力，避免长期运行内存无界增长且便于值班判断数据是否被截断。

### 2.35 持续推进（三十二期收口：Storage Alerting 前端过滤能力）
- 客户端
  - `apps/client/src/pages/ObservabilityPage.tsx`
  - `apps/client/src/pages/StabilityOpsPage.tsx`
  - 新增 `storage_alert_event_filter`、`storage_alert_backend_filter`、`storage_alert_write_failed_filter` 三个过滤器，recent 列表按筛选条件实时过滤并保留空态。
  - `storage_alerting` 摘要增加 `recent=<count>/<limit>` 与 `capped=<count>` 展示。
- 测试
  - `apps/client/tests/s6-observability-admin-pages.test.tsx`
  - `apps/client/tests/s9-stability-ops-page.test.tsx`
  - 新增过滤切换（`all -> circuit_recovered -> all`）与空态断言，覆盖过滤逻辑回归。
- 结果
  - 运维页面可在不切换上下文的情况下按事件/后端/失败态快速定位熔断样本，降低手工筛查成本。

### 2.36 持续推进（三十三期收口：Observability Storage Alerting 页面 E2E）
- 客户端 E2E
  - `apps/client/e2e/observability-storage-alerting-flow.spec.mjs`
  - 覆盖 `登录 -> /observability -> 加载发布链路指标 -> storage_alerting 摘要断言 -> 过滤控件切换` 流程。
  - `apps/client/package.json` 新增脚本：`test:e2e:observability-storage`。
- 回归
  - `npm run test:e2e:observability-storage --workspace @ielts/client`
- 结果
  - Observability 页的 storage alerting 展示与交互进入浏览器级回归范围，补齐页面级端到端覆盖。

### 2.37 持续推进（三十四期收口：发布清单可选开关扩展 + 本地 quality-gate 一键化）
- 工程脚本
  - `scripts/release-automation-check.sh`
  - 新增可选开关：
    - `RELEASE_AUTOMATION_RUN_STABILITY_PAGE_E2E`
    - `RELEASE_AUTOMATION_RUN_VISUAL_SNAPSHOTS`
    - `RELEASE_AUTOMATION_RUN_POSTGRES_CHAOS`
  - `RELEASE_AUTOMATION_RUN_E2E=true` 改为执行本地自拉起后端的 `smoke:e2e:api-local`，避免“未启动服务即执行 E2E”导致误失败。
  - `scripts/local-api-e2e.sh`：新增本地 API/系统 E2E 一键脚本（自动起停后端）。
  - `scripts/local-quality-gate-smoke.sh`：新增本地质量门禁一键脚本（复用 release checklist 并按环境变量扩展）。
- 命令入口
  - `package.json`：新增 `smoke:e2e:api-local`、`smoke:quality-gate:local`。
  - `apps/client/package.json`：
    - `test:e2e` 收敛为 API/系统链路子集（与 CI e2e job 对齐）。
    - 新增 `test:e2e:all` 用于全量执行 `apps/client/e2e` 套件。
- 文档
  - `docs/engineering/S9-Release-Runbook.md` 补充新开关、脚本说明与 `test:e2e`/`test:e2e:all` 范围。
- 结果
  - 发布检查脚本具备更细粒度开关与更稳定的本地执行路径，且与 CI 任务边界保持一致。

### 2.38 持续推进（三十五期收口：发布清单 JSON 汇总 + 失败日志归档 + Observability E2E 开关）
- 工程脚本
  - `scripts/release-automation-check.sh`
  - 新增 `summary-json` 机器可读输出（包含 `status`、`failed_step`、`total_duration_seconds`、逐步 `steps` 状态）。
  - 支持 `RELEASE_AUTOMATION_SUMMARY_PATH` 将同内容写入 JSON 文件。
  - 新增 `RELEASE_AUTOMATION_RUN_OBSERVABILITY_STORAGE_E2E` 可选开关，并接入 `observability-storage-e2e-local` 步骤。
  - 对未启用可选项增加 `SKIP` 记录，避免值班误判“步骤缺失”。
  - `scripts/local-observability-storage-e2e.sh`
  - 新增本地一键脚本（自动起停前后端）执行 `test:e2e:observability-storage`。
  - `scripts/local-quality-gate-smoke.sh`
  - 新增失败日志归档：当门禁失败时自动采集 summary 与本地后端/前端日志到 `QUALITY_GATE_LOCAL_ARTIFACTS_DIR`。
  - 支持 `QUALITY_GATE_LOCAL_RUN_OBSERVABILITY_STORAGE_E2E` 与 `QUALITY_GATE_LOCAL_SUMMARY_JSON_PATH`。
- 命令入口
  - `package.json` 新增 `smoke:observability-storage:e2e-local`。
- 文档
  - `docs/engineering/S9-Release-Runbook.md` 补充 Observability 本地 E2E、JSON summary 路径参数与失败归档参数说明。
- 结果
  - 发布清单从“人读日志为主”升级为“人读+机读并行”，并在本地质量门禁失败时保留可直接排障的上下文日志。

### 2.39 持续推进（三十六期收口：发布清单执行模式增强（fail-fast / continue-on-error））
- 工程脚本
  - `scripts/release-automation-check.sh`
  - 新增参数 `RELEASE_AUTOMATION_CONTINUE_ON_ERROR`（默认 `false`）：
    - `false`：保持 fail-fast（任一步骤失败立即退出）。
    - `true`：失败后继续执行后续步骤，最终统一以非 0 退出并输出失败步骤列表。
  - `summary-json` 增强字段：
    - `failed_steps`（全部失败步骤）
    - `continue_on_error`（执行模式）
  - 保持兼容字段 `failed_step`（首个失败步骤）。
  - `scripts/local-quality-gate-smoke.sh`
  - 新增 `QUALITY_GATE_LOCAL_CONTINUE_ON_ERROR` 并透传到 release checklist，便于本地一次跑完并收集完整失败矩阵。
- 文档与台账
  - `docs/engineering/S9-Release-Runbook.md` 补充 continue-on-error 开关说明。
- 结果
  - 发布门禁支持“快速失败”和“完整扫描”两种模式，兼顾日常高效执行与故障集中排查效率。

### 2.40 持续推进（三十七期收口：S9 任务拆解 + CI summary-json 归档 + 发布台账模板化）
- 规划与台账
  - `docs/tracking/backlog.csv`
  - 为 `E10` 新增 `US-10301` ~ `US-10310`（S9 发布门禁增强 Story），补齐依赖与验收引用。
  - `docs/tracking/sprints/S9-Atomic-Tasks.md`
  - 新增 S9 原子任务清单，覆盖 checklist dry-run、脚本回归、CI summary-json、release row 模板生成等主线。
- CI 门禁
  - `.github/workflows/stability-e2e.yml`
  - `quality-gate` 聚合 job 新增 `quality-gate-summary.json` 生成步骤，并在 Step Summary 输出失败步骤表。
  - 新增 artifact 上传：`quality-gate-summary-json`（可直接下载并用于发布台账）。
  - `typecheck-and-test` 新增 `npm run test:release-scripts`，将脚本级回归纳入门禁。
- 工程脚本
  - `scripts/release-automation-check.sh`
  - 新增 `RELEASE_AUTOMATION_DRY_RUN`（步骤预览不执行）与 `RELEASE_AUTOMATION_RUN_SCRIPT_TESTS`、`RELEASE_AUTOMATION_RUN_FRONTEND_FULL_E2E` 可选开关。
  - `summary-json` 新增 `dry_run` 字段。
  - `scripts/local-quality-gate-smoke.sh`
  - 失败归档新增 `manifest.json`（记录开关、summary 路径、已复制文件）。
  - 新增透传开关：`QUALITY_GATE_LOCAL_RUN_SCRIPT_TESTS`、`QUALITY_GATE_LOCAL_RUN_FRONTEND_FULL_E2E`、`QUALITY_GATE_LOCAL_DRY_RUN`。
  - `scripts/local-frontend-full-e2e.sh`
  - 新增前端全量一键回归（API + stability-page + observability-storage + visual）。
  - `scripts/tests/release-automation-check.test.sh`
  - 新增脚本级回归测试，覆盖 `fail-fast`、`continue-on-error`、`dry-run`。
  - `scripts/release-record-candidate.mjs`
  - 新增基于 summary-json 的 release 记录候选行生成器（自动推导下一 `REL-xxx`）。
- 命令入口
  - `package.json` 新增：
    - `smoke:e2e:frontend-full-local`
    - `test:release-scripts`
    - `release:record:candidate`
- 文档
  - `docs/engineering/S9-Release-Runbook.md` 同步新增开关、前端全量命令、summary artifact 与 release row 生成说明。
- 结果
  - 发布链路从“命令可执行”升级到“计划可拆解、门禁可机读、失败可追溯、台账可半自动生成”的连续交付状态。

### 2.41 持续推进（三十八期收口：S9 运营化增强与默认门禁收敛）
- CI 与 PR 反馈
  - `.github/workflows/stability-e2e.yml`
  - 新增 PR 评论更新：在 `pull_request` 事件中自动 upsert `quality-gate summary` 评论，展示 `failed_step/failed_steps` 与 summary artifact 名称。
  - 补齐 workflow `permissions`（`issues/pull-requests` write）以支持评论写入。
- 脚本与命令
  - `scripts/release-record-candidate.mjs`
  - 新增 `--append true` 直接追加 `releases.md`，支持 `--dry_run true` 预览追加结果。
  - `scripts/local-quality-gate-smoke.sh`
  - `QUALITY_GATE_LOCAL_RUN_SCRIPT_TESTS` 默认改为 `true`，保证本地门禁默认覆盖脚本回归。
  - `scripts/local-frontend-full-e2e.sh`
  - 新增 `FRONTEND_FULL_E2E_PARALLEL` 开关，支持单次 Playwright 并行跑全量前端套件。
  - `apps/client/package.json`
  - 新增 `test:e2e:frontend-full`，用于并行全量前端回归入口。
- 规划与追踪
  - `docs/tracking/backlog.csv`
  - 将 `US-10301~US-10310` 从 `Ready` 统一推进至 `In Progress`。
  - `docs/tracking/sprints/S9.md`
  - 新增 S9 冲刺主文档（目标、范围、风险、日志、验收结论）。
- 结果
  - S9 从“任务已拆解”进入“持续执行态”，并将 CI 结果同步到 PR 讨论面板，减少值班沟通与排障路径。

### 2.42 持续推进（三十九期收口：S9 前五项交付完成）
- 追踪与状态
  - `docs/tracking/backlog.csv`
  - `US-10301~US-10305` 从 `In Progress` 推进为 `Done`，`US-10306~US-10310` 保持 `In Progress`。
  - `docs/tracking/sprints/S9.md`
  - 同步范围状态、每日执行日志与验收结论，明确 S9 前五项已闭环。
- 验证与门禁
  - `RELEASE_AUTOMATION_DRY_RUN=true npm run release:checklist`
  - 通过 dry-run 验证 summary-json 与步骤预览输出。
  - `npm run release:record:candidate -- --summary /tmp/release-check-dryrun-summary-2.json --append true --dry_run true`
  - 通过 release 候选行追加预演，确认 `REL-043` 模板输出正确。
  - `npm run smoke:quality-gate:local`
  - 本地 quality-gate 全链路通过，默认包含 `test:release-scripts`。
- 结果
  - 用户要求的 1~5 项已完成并验证通过，进入 6~10 连续交付阶段。

### 2.43 持续推进（四十期收口：S9 后五项交付完成）
- 交付与验证
  - `scripts/local-frontend-full-e2e.sh`、`apps/client/package.json`
  - 执行 `FRONTEND_FULL_E2E_PARALLEL=true npm run smoke:e2e:frontend-full-local`，全量前端回归 8/8 通过。
  - `scripts/local-quality-gate-smoke.sh`、`scripts/release-automation-check.sh`
  - 执行 `QUALITY_GATE_LOCAL_RUN_FRONTEND_FULL_E2E=true npm run smoke:quality-gate:local`，产出 `summary-json` 且 `frontend-full-e2e-local` 步骤通过。
  - `scripts/release-record-candidate.mjs`、`docs/tracking/releases.md`
  - 通过 `--append true` 基于 summary 自动追加 `REL-044`，验证 release 台账自动化闭环。
- 追踪与文档同步
  - `docs/tracking/backlog.csv`
  - 将 `US-10306~US-10310` 从 `In Progress` 推进为 `Done`。
  - `docs/tracking/sprints/S9.md`、`docs/tracking/sprints/S8.md`
  - 同步四十期执行日志与 S9 最终验收结论（全部完成）。
- 结果
  - S9 `US-10301~US-10310` 全部收口，发布门禁增强任务完成。

### 2.44 持续推进（四十一期收口：Tracking 治理校验接入门禁）
- 工程脚本
  - `scripts/tracking-governance-validate.mjs`
  - 新增治理校验器，校验 completed sprint 与 `sprints/retrospectives/metrics` 映射完整性，以及 `release/metrics/risk/activity` 时效性。
  - 支持 `TRACKING_GOVERNANCE_SUMMARY_PATH` 输出结构化 JSON summary。
  - `scripts/release-automation-check.sh`
  - 新增默认步骤 `tracking-governance-validate` 与开关 `RELEASE_AUTOMATION_RUN_TRACKING_GOVERNANCE`。
  - `scripts/local-quality-gate-smoke.sh`
  - 新增本地开关 `QUALITY_GATE_LOCAL_RUN_TRACKING_GOVERNANCE` 与治理 summary 路径参数；失败归档 `manifest.json` 增加该开关与 summary 路径记录。
- 测试与 CI
  - `scripts/tests/tracking-governance-validate.test.sh`
  - 新增治理校验脚本测试（通过/缺失 retro 失败场景）。
  - `package.json`
  - `test:release-scripts` 扩展为同时执行 release checklist 脚本测试 + tracking governance 测试。
  - `.github/workflows/stability-e2e.yml`
  - `typecheck-and-test` 新增 `Tracking Governance Validation`，并上传 `quality-gate-tracking-governance-summary` artifact。
- tracking 台账补齐
  - `docs/tracking/metrics-weekly.csv`
  - 补齐 `S2/S3/S4/S5/S8/S9` 指标行并更新时效到 `2026-03-02`。
  - `docs/tracking/risk-register.csv`
  - 批量更新风险条目 `updated_at` 到 `2026-03-02`，新增治理同步风险 `R-007`。
  - `docs/tracking/activity-log.csv`
  - 补录 `US-10301~US-10310` 的状态流转与 `S9-CLOSE` 收口记录。
  - `docs/tracking/retrospectives/S8.md`、`docs/tracking/retrospectives/S9.md`
  - 补齐 S8/S9 复盘与 Action Items。
- 结果
  - 发布门禁从“代码质量+回归”扩展为“代码质量+tracking 治理同步”，并形成可下载的治理校验 summary artifact。

### 2.45 持续推进（四十二期收口：S10 最终复核与台账闭环）
- 治理缺口修复
  - `docs/tracking/retrospectives/S10.md`
  - 补齐 S10 retrospective（含 Action Items），满足治理校验对 completed sprint 的复盘完整性要求。
  - `docs/tracking/metrics-weekly.csv`
  - 新增 S10 指标行（planned/completed=35，updated_at=2026-03-02）。
- 验证与发布台账
  - `npm run validate:tracking-governance`
  - 治理校验通过（completed sprints: S1~S10，missing retros/metrics 均为 0）。
  - `npm run smoke:quality-gate:local`
  - 本地质量门禁通过，`release:checklist` 中 `tracking-governance-validate` 步骤通过。
  - `docs/tracking/releases.md`
  - 追加 `REL-046` 作为 S10 最终复核发布记录（tracking_completed_sprints=10）。
- 结果
  - S10 治理自动化从“功能可用”推进为“门禁可执行 + 台账可追溯 + 自身 sprint 资料齐备”的完整闭环状态。

### 2.46 持续推进（四十三期收口：治理可用性增强）
- 状态流转治理提醒
  - `docs/tracking/scripts/set_status.sh`、`docs/tracking/scripts/log_activity.sh`
  - `set_status.sh` 在 `Done/Released` 流转时增加 sprint 治理预检查提醒（retro/metrics）；支持 `TRACKING_STATUS_ENFORCE_GOVERNANCE=true` 转为阻断模式。
  - 新增 `TRACKING_ROOT` 支持，便于脚本在临时测试目录执行。
- 治理 summary 可操作化
  - `scripts/tracking-governance-validate.mjs`
  - summary 新增 `recommended_actions`，失败时直接输出建议修复动作，降低排障路径长度。
  - `scripts/tests/tracking-governance-validate.test.sh`
  - 补充 `recommended_actions` 断言。
- 发布记录模板命令
  - `scripts/release-record-from-gate.sh`、`package.json`
  - 新增 `npm run release:record:from-gate`，默认读取 quality-gate summary 与 tracking summary 生成/追加 release 记录。
  - `scripts/tests/set-status-governance-reminder.test.sh`
  - 新增状态流转治理提醒测试并纳入 `test:release-scripts`。
- 验证
  - `npm run test:release-scripts`
  - `npm run validate:tracking-governance`
  - `npm run smoke:quality-gate:local`（含治理校验与脚本测试）
- 以上均通过，并追加 `REL-047`。

### 2.47 持续推进（四十四期收口：治理强化二期）
- 状态流转前 sprint 自检
  - `docs/tracking/scripts/set_status.sh`
  - 在 `Done/Released` 目标状态下切换为调用 `tracking-governance-validate --sprint`，失败时输出 issue code、summary 路径和定向修复命令。
- 治理修复模板能力
  - `scripts/tracking-governance-fix-template.sh`
  - 基于治理 summary 自动生成 sprint/retro 模板、metrics/activity 待补 CSV 片段、`apply-fixes.sh` 与 `fix-steps.md`。
- 回归与 CI 汇总增强
  - `scripts/tests/release-record-from-gate.test.sh`
  - 新增 `release-record-from-gate` 测试（dry-run、缺失 tracking summary 告警、追加成功、重复 release id 冲突）。
  - `.github/workflows/stability-e2e.yml`
  - `quality-gate` 聚合阶段新增 tracking artifact 下载，并将 `tracking_governance.status/issues_count` 写入 `quality-gate-summary.json`，同步展示到 Step Summary 与 PR 评论。
- tracking 台账收口
  - `docs/tracking/backlog.csv`、`docs/tracking/sprints/S11.md`、`docs/tracking/sprints/S11-Atomic-Tasks.md`、`docs/tracking/retrospectives/S11.md`
  - `docs/tracking/activity-log.csv`、`docs/tracking/metrics-weekly.csv`、`docs/tracking/sprint-board.md`、`docs/tracking/README.md`
  - 完成 `US-10501~US-10510` 与 S11 台账同步。
- 验证
  - `npm run test:release-scripts`
  - `npm run validate:tracking-governance`
  - `bash docs/tracking/scripts/validate_tracking.sh`
  - `bash docs/tracking/scripts/status_summary.sh`
  - `npm run smoke:quality-gate:local`（可使用轻量开关）
  - 完成后追加发布记录 `REL-048`。

### 2.48 持续推进（四十五期收口：治理强化三期）
- 治理严格模式
  - `scripts/tracking-governance-validate.mjs`
  - 新增 `--strict` 与 `TRACKING_GOVERNANCE_STRICT`，支持 warning 汇总，并在 strict 模式下将 warning 提升为失败（`TG014`）。
  - summary 新增 `strict_mode`、`warnings_count`、`warning_details` 字段。
- 修复模板幂等增强
  - `scripts/tracking-governance-fix-template.sh`
  - 生成的 `apply-fixes.sh` 增加 `metrics/activity` 去重追加逻辑，重复执行不再重复写入。
  - 修复 macOS Bash 3 兼容性问题（移除 `mapfile` 依赖）。
- 发布链路与汇总联动
  - `scripts/release-automation-check.sh`、`scripts/local-quality-gate-smoke.sh`
  - 新增 `RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT` 与 `QUALITY_GATE_LOCAL_TRACKING_GOVERNANCE_STRICT` 开关，并将 strict 执行态写入 summary/manifest。
  - `.github/workflows/stability-e2e.yml`
  - quality-gate 汇总新增 `tracking_governance.warnings_count/strict_mode` 并同步展示到 Step Summary 与 PR 评论。
- 发布记录 artifact 信息
  - `scripts/release-record-candidate.mjs`、`scripts/release-record-from-gate.sh`
  - release notes 自动注入 `summary_artifact` 与 `tracking_artifact` 字段，便于排障追溯。
- 回归与台账
  - 新增 `scripts/tests/tracking-governance-fix-template.test.sh`
  - 扩展 `tracking-governance-validate` 与 `release-automation-check`、`release-record-from-gate` 测试场景。
  - 同步 `S12` 台账（`US-10601~US-10610`）并追加 `REL-049`。
- 验证
  - `npm run test:release-scripts`
  - `npm run validate:tracking-governance`
  - `npm run validate:tracking-governance -- --strict true`
  - `bash docs/tracking/scripts/validate_tracking.sh`
  - `bash docs/tracking/scripts/status_summary.sh`
- `QUALITY_GATE_LOCAL_DRY_RUN=true QUALITY_GATE_LOCAL_TRACKING_GOVERNANCE_STRICT=true npm run smoke:quality-gate:local`

### 2.49 持续推进（四十六期收口：治理强化四期）
- 治理修复模板 dry-run
  - `scripts/tracking-governance-fix-template.sh`
  - 新增 `--dry_run` 与 `TRACKING_GOVERNANCE_FIX_TEMPLATE_DRY_RUN`；dry-run 仅输出修复规模与执行命令，不生成文件。
- strict 分级策略
  - `scripts/tracking-governance-validate.mjs`
  - 新增 `strict_warning_codes`（CLI 与环境变量 `TRACKING_GOVERNANCE_STRICT_WARNING_CODES`），支持仅升级指定 warning code。
  - summary 增加 `strict_warning_codes` 与 `strict_promoted_warning_codes` 字段，便于审计。
- 门禁参数透传
  - `scripts/release-automation-check.sh`、`scripts/local-quality-gate-smoke.sh`
  - 新增 strict warning code 透传参数与 summary/manifest 字段。
- PR 评论排障提示
  - `.github/workflows/stability-e2e.yml`
  - PR 评论新增 artifacts 下载指引，明确 `quality-gate-summary-json` 与 `quality-gate-tracking-governance-summary` 下载路径。
- 回归与台账
  - `scripts/tests/tracking-governance-fix-template.test.sh`
  - 新增 dry-run 不落盘测试；扩展 strict 分级与 summary 字段测试。
  - 同步 `S13` 台账（`US-10701~US-10710`）并追加 `REL-050`。
- 验证
  - `npm run test:release-scripts`
  - `npm run validate:tracking-governance`
- `npm run validate:tracking-governance -- --strict true`
- `RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true npm run release:checklist`
- `QUALITY_GATE_LOCAL_DRY_RUN=true QUALITY_GATE_LOCAL_TRACKING_GOVERNANCE_STRICT=true npm run smoke:quality-gate:local`

### 2.50 持续推进（四十七期收口：治理强化五期）
- strict warning code 配置校验
  - `scripts/tracking-governance-validate.mjs`
  - 新增 strict code 输入规范化（大写与去重）；新增非法 code 提示 `TGW002`。
  - summary 新增 `strict_warning_codes_unknown` 与 `supported_warning_codes` 字段，便于值班排障。
- 治理修复模板 dry-run JSON
  - `scripts/tracking-governance-fix-template.sh`
  - 新增 `--output_format text|json` 与 `TRACKING_GOVERNANCE_FIX_TEMPLATE_OUTPUT_FORMAT`。
  - 在 `--dry_run true --output_format json` 下输出机读计划（planned counts + apply command），且不落盘。
- 发布追溯与评审排障增强
  - `scripts/release-record-candidate.mjs`
  - release notes 自动注入 `tracking_warnings`、`tracking_strict_mode`、`tracking_strict_warning_codes`、`tracking_strict_warning_codes_unknown`、`tracking_strict_promoted_warning_codes`。
  - `.github/workflows/stability-e2e.yml`
  - PR 评论在失败场景新增 “Failure Triage (First 5 Minutes)” 模板与本地复现命令。
- 回归与台账
  - `scripts/tests/tracking-governance-validate.test.sh`
  - 补充 strict code 非法值提示与大小写规范化测试。
  - `scripts/tests/tracking-governance-fix-template.test.sh`
  - 新增 dry-run JSON 输出结构测试与不落盘断言。
  - `scripts/tests/release-record-from-gate.test.sh`
  - 新增 release notes strict/warnings 字段断言。
  - 同步 `S14` 台账（`US-10801~US-10810`）并追加 `REL-051`。
- 验证
  - `npm run test:release-scripts`
- `npm run validate:tracking-governance -- --strict true --strict_warning_codes TGW001,TGW999`
- `bash scripts/tracking-governance-fix-template.sh --summary /tmp/tracking-governance-summary.json --dry_run true --output_format json`
- `RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001 npm run release:checklist`

### 2.51 持续推进（四十八期收口：治理强化六期）
- strict warning code 快速预检
  - `scripts/tracking-governance-strict-codes-check.mjs`
  - 新增独立命令 `validate:tracking-governance:strict-codes`，用于仅校验 strict code 配置。
  - 支持 `--allow_unknown` 与 summary 输出，便于门禁前快速判定配置风险。
- checklist/local gate 前置预检
  - `scripts/release-automation-check.sh`
  - strict 模式新增 `tracking-governance-strict-codes-check` 前置步骤，可通过 `RELEASE_AUTOMATION_RUN_TRACKING_GOVERNANCE_STRICT_CODES_CHECK` 开关控制。
  - `scripts/local-quality-gate-smoke.sh`
  - 新增 `QUALITY_GATE_LOCAL_RUN_TRACKING_GOVERNANCE_STRICT_CODES_CHECK` 透传，并在失败归档 `manifest` 记录该开关。
- 修复模板 dry-run JSON 文件输出
  - `scripts/tracking-governance-fix-template.sh`
  - 新增 `--out` 与 `TRACKING_GOVERNANCE_FIX_TEMPLATE_OUT`；仅在 `--dry_run true --output_format json` 下可用。
  - `--out` 模式会落盘 JSON payload 并在控制台输出文件路径提示。
- PR 评论缺失产物排障
  - `.github/workflows/stability-e2e.yml`
  - 当 `quality-gate-tracking-governance-summary` 缺失时，PR 评论新增专项 triage 模板（定位校验与 artifact 上传步骤）。
- 回归与台账
  - `scripts/tests/tracking-governance-strict-codes-check.test.sh`
  - 新增 strict code 快速预检测试（通过/失败/allow_unknown）。
  - `scripts/tests/tracking-governance-fix-template.test.sh`
  - 新增 JSON `--out` 输出测试与非法参数组合失败测试。
  - `scripts/tests/release-automation-check.test.sh`
  - 增加 strict 模式下前置预检步骤断言。
  - 同步 `S15` 台账（`US-10901~US-10910`）并追加 `REL-052`。
- 验证
  - `npm run test:release-scripts`
  - `npm run validate:tracking-governance:strict-codes -- --strict_warning_codes TGW001`
  - `TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_PATH=/tmp/ielts-strict-codes-summary.json npm run validate:tracking-governance:strict-codes -- --strict_warning_codes TGW001,TGW999`
  - `bash scripts/tracking-governance-fix-template.sh --summary /tmp/ielts-tracking-governance-summary.json --dry_run true --output_format json --out /tmp/tracking-governance-fix-plan.json`
  - `RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001 npm run release:checklist`

### 2.52 持续推进（四十九期收口：治理强化七期）
- strict code 非空约束
  - `scripts/tracking-governance-strict-codes-check.mjs`
  - 新增 `--require_non_empty` 与 `TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY`，空输入时可快速失败并给出修复提示。
  - summary 新增 `require_non_empty`、`empty_input` 字段，便于预检追溯。
- checklist/local gate 透传增强
  - `scripts/release-automation-check.sh`
  - 新增 `RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY`，strict 预检步骤可开启非空约束；summary 新增同名布尔字段。
  - `scripts/local-quality-gate-smoke.sh`
  - 新增 `QUALITY_GATE_LOCAL_TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY` 透传，并在失败归档 `manifest` 增加该字段。
- fix-template JSON 可执行动作透出
  - `scripts/tracking-governance-fix-template.sh`
  - dry-run JSON payload 新增 `recommended_actions`，可直接驱动后续自动化修复任务。
- quality-gate strict 预检可观测增强
  - `.github/workflows/stability-e2e.yml`
  - `typecheck-and-test` job 新增 strict code 预检步骤与 artifact 上传（`quality-gate-tracking-governance-strict-codes-summary`）。
  - 聚合 `quality-gate-summary.json` 与 PR 评论新增 strict 预检字段展示；当 strict-codes artifact 缺失时输出专项 triage 模板。
- 回归与台账
  - `scripts/tests/tracking-governance-strict-codes-check.test.sh`
  - 增加 `require_non_empty` 空输入失败测试。
  - `scripts/tests/release-automation-check.test.sh`
  - 增加 summary 字段 `tracking_governance_strict_codes_require_non_empty` 断言。
  - `scripts/tests/tracking-governance-fix-template.test.sh`
  - 增加 `recommended_actions` JSON 输出断言并保留 out-file/参数约束测试。
  - 同步 `S16` 台账（`US-11001~US-11010`）并追加 `REL-053`。
- 验证
  - `npm run test:release-scripts`
  - `npm run validate:tracking-governance:strict-codes -- --strict_warning_codes TGW001 --require_non_empty true`
  - `TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_PATH=/tmp/ielts-strict-codes-summary.json npm run validate:tracking-governance:strict-codes -- --strict_warning_codes TGW001,TGW999`
  - `TRACKING_GOVERNANCE_SUMMARY_PATH=/tmp/ielts-tracking-governance-summary.json npm run validate:tracking-governance -- --strict true --strict_warning_codes TGW001`
  - `bash scripts/tracking-governance-fix-template.sh --summary /tmp/ielts-tracking-governance-summary.json --dry_run true --output_format json --out /tmp/tracking-governance-fix-plan.json`
  - `RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001 npm run release:checklist`

### 2.53 持续推进（五十期收口：治理强化八期）
- strict-codes 发现模式与输出可观测增强
  - `scripts/tracking-governance-strict-codes-check.mjs`
  - 新增 `--supported_codes`（`true|text|json`），支持以文本或 JSON 发现 strict warning code 支持列表。
  - summary 新增 `mode`（`validate|supported_codes`）与 `duration_ms`，并保持 `supported_warning_codes` 可机读输出。
  - 修复 `supported_codes=json` 输出纯净性：summary-file 日志改写 stderr，避免污染 stdout JSON。
- fix-template JSON 推荐动作字段对齐
  - `scripts/tracking-governance-fix-template.sh`
  - `--dry_run true --output_format json` 输出补齐 `recommended_actions`，便于自动化消费。
- quality-gate strict 预检聚合与 PR 评论增强
  - `.github/workflows/stability-e2e.yml`
  - `typecheck-and-test` 新增 strict-codes 预检步骤与 artifact 上传（`quality-gate-tracking-governance-strict-codes-summary`）。
  - 聚合 `quality-gate-summary.json` 解析 strict-codes 字段（状态、未知 code、`require_non_empty`、`duration_ms`、artifact 状态）。
  - PR 评论支持 `QUALITY_GATE_PR_COMMENT_ABNORMAL_ONLY` 精简模式，仅展示异常字段与异常步骤。
- 回归与台账
  - `scripts/tests/tracking-governance-strict-codes-check.test.sh`
  - 新增 `supported_codes=true/json` 回归测试。
  - `scripts/tests/tracking-governance-fix-template.test.sh`
  - 增加 `recommended_actions` JSON 断言。
  - 同步 `S17` 台账（`US-11011~US-11020`）并追加 `REL-054`。
- 验证
  - `npm run test:release-scripts`
  - `npm run validate:tracking-governance:strict-codes -- --supported_codes json`
  - `npm run validate:tracking-governance:strict-codes -- --strict_warning_codes TGW001 --require_non_empty true`
  - `RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001 RELEASE_AUTOMATION_SUMMARY_PATH=/tmp/ielts-quality-gate-summary.json TRACKING_GOVERNANCE_SUMMARY_PATH=/tmp/ielts-tracking-governance-summary.json npm run release:checklist`

### 2.54 持续推进（五十一期收口：治理强化九期）
- strict-codes 输出控制与参数解析增强
  - `scripts/tracking-governance-strict-codes-check.mjs`
  - 新增 `--summary_to_stderr`（默认 `true`）与 `--quiet`（默认 `false`）参数，用于分离 summary 日志输出与非必要控制台输出。
  - 参数解析改为“显式参数 > 环境变量 > 默认值”优先级，修复 `require_non_empty` 等环境变量在默认值场景无法覆盖的问题。
- strict-codes 回归测试补齐
  - `scripts/tests/tracking-governance-strict-codes-check.test.sh`
  - 新增 `summary_to_stderr=false` stdout 场景、`quiet=true` 静默场景、`require_non_empty` 环境变量透传场景。
- quality-gate strict 语义可观测与评论限幅
  - `.github/workflows/stability-e2e.yml`
  - 聚合 `quality-gate-summary.json` 的 `tracking_governance.strict_codes_check` 增加 `mode` 字段。
  - Step Summary 与 PR 评论 full 模式同步展示 strict-codes `mode`。
  - PR 评论异常模式新增 `QUALITY_GATE_PR_COMMENT_ABNORMAL_MAX_STEPS`，超限时输出截断提示。
- 回归与台账
  - `npm run test:release-scripts`
  - `npm run validate:tracking-governance:strict-codes -- --supported_codes json --quiet true`
  - `TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY=true npm run validate:tracking-governance:strict-codes`
  - 同步 `S18` 台账（`US-11021~US-11030`）并追加 `REL-055`。

### 2.55 持续推进（五十二期收口：治理强化十期）
- strict-codes 统一输出模式
  - `scripts/tracking-governance-strict-codes-check.mjs`
  - 新增 `--output_mode auto|text|json|silent` 与 `TRACKING_GOVERNANCE_STRICT_CODES_OUTPUT_MODE`，统一 validate/supported 场景输出策略。
  - `output_mode=json` 时强制 summary-file 日志写入 stderr，保证 stdout 机读 JSON 纯净。
- strict-codes Node 单测接入
  - `scripts/tests/tracking-governance-strict-codes-check.test.mjs`
  - 新增 Node 原生测试（输出模式、静默模式、env 透传、非法参数等），降低 shell 夹具复杂度。
  - `package.json` `test:release-scripts` 接入该测试文件。
- quality-gate PR 评论异常排序增强
  - `.github/workflows/stability-e2e.yml`
  - 在异常模式下，异常步骤按 `typecheck/test > e2e > postgres > visual` 优先级排序后再限幅展示。
  - 保留 `QUALITY_GATE_PR_COMMENT_ABNORMAL_MAX_STEPS` 限幅与截断提示。
- 回归与台账
  - `npm run test:release-scripts`
  - `npm run validate:tracking-governance:strict-codes -- --strict_warning_codes TGW001 --output_mode json`
  - `npm run validate:tracking-governance:strict-codes -- --strict_warning_codes TGW001 --output_mode silent`
  - 同步 `S19` 台账（`US-11031~US-11040`）并追加 `REL-056`。

### 2.56 持续推进（五十三期收口：治理强化十一期）
- strict-codes 输出版本标识
  - `scripts/tracking-governance-strict-codes-check.mjs`
  - strict-codes summary 与 JSON 输出新增 `schema_version`（当前 `1.0`），便于后续消费端兼容演进。
- strict-codes Node 单测降噪执行
  - `scripts/tests/run-node-test-summary.sh`
  - 新增 Node 测试摘要执行脚本：通过时输出测试统计摘要，失败时回放完整日志。
  - `package.json` `test:release-scripts` 切换为调用摘要执行脚本，并保留 `RELEASE_SCRIPT_TESTS_NODE_VERBOSE=true` 全量日志开关。
- quality-gate 评论优先级变量化
  - `.github/workflows/stability-e2e.yml`
  - 新增 `QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY`（默认 `typecheck,test,e2e,postgres,visual`），异常模式下按自定义优先级排序后再限幅。
- 回归与台账
  - `npm run test:release-scripts`
  - `npm run validate:tracking-governance:strict-codes -- --supported_codes json`
  - `npm run validate:tracking-governance:strict-codes -- --strict_warning_codes TGW001 --output_mode json`
  - 同步 `S20` 台账（`US-11041~US-11050`）并追加 `REL-057`。

### 2.57 持续推进（五十四期收口：治理强化十二期）
- strict-codes schema 路径标识与机读契约补齐
  - `scripts/tracking-governance-strict-codes-check.mjs`
  - strict-codes summary 与 JSON 输出新增 `schema_url`（当前 `docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json`）。
  - 新增 `docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json`，固定当前 payload 结构，便于下游联调与验收。
- Node 单测摘要执行聚合增强
  - `scripts/tests/run-node-test-summary.sh`
  - 支持多测试文件聚合摘要输出（`files/tests/pass/fail`），失败场景自动回放完整日志。
  - 新增 `scripts/tests/run-node-test-summary.test.sh` 覆盖聚合统计、失败回放与 verbose 透传。
- quality-gate PR 评论异常排序匹配模式增强
  - `.github/workflows/stability-e2e.yml`
  - 新增 `QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY_MATCH=contains|exact`（默认 `contains`）。
  - 异常步骤排序新增双模式匹配；非法值自动回退 `contains`，避免配置错误导致评论失效。
- 回归与台账
  - `npm run test:release-scripts`
  - `RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001 RELEASE_AUTOMATION_SUMMARY_PATH=/tmp/ielts-quality-gate-summary.json TRACKING_GOVERNANCE_SUMMARY_PATH=/tmp/ielts-tracking-governance-summary.json npm run release:checklist`
  - `npm run validate:tracking-governance`
  - `bash docs/tracking/scripts/validate_tracking.sh`
  - `bash docs/tracking/scripts/status_summary.sh`
  - 同步 `S21` 台账（`US-11051~US-11060`）并追加 `REL-058`。

### 2.58 持续推进（五十五期收口：治理强化十三期）
- quality-gate PR 评论逻辑模块化与可测试化
  - `scripts/ci/quality-gate-pr-comment.js`
  - 将 workflow 内联评论生成逻辑抽离为独立模块，集中维护 abnormal 模式配置解析、字段汇总与步骤排序。
  - `.github/workflows/stability-e2e.yml`
  - `github-script` 步骤改为调用模块生成评论正文，保留 comment upsert 行为。
- abnormal priority token 参考与 exact 命中提示
  - 评论异常模式新增标准 token 参考（含示例映射）。
  - `exact` 匹配模式下新增 `abnormal_priority_exact_hits` 与 `abnormal_priority_exact_hint`，便于快速修正优先级 token。
- strict-codes schema 契约一致性
  - `scripts/tracking-governance-strict-codes-check.mjs`
  - `supported_codes + output_mode=json` 输出改为完整 summary payload，确保与 schema 字段契约一致。
  - `scripts/tests/tracking-governance-strict-codes-schema-contract.test.mjs`
  - 新增 schema 契约测试（`validate/json` 与 `supported_codes/json` 双模式）。
- 测试与门禁链路
  - `scripts/tests/quality-gate-pr-comment.test.mjs`
  - 新增 PR 评论生成逻辑单测（contains/exact/fallback/排序断言）。
  - `package.json`
  - `test:release-scripts` 接入上述 Node 测试并继续通过 `run-node-test-summary.sh` 聚合输出。
- 回归与台账
  - `npm run test:release-scripts`
  - `RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001 RELEASE_AUTOMATION_SUMMARY_PATH=/tmp/ielts-quality-gate-summary.json TRACKING_GOVERNANCE_SUMMARY_PATH=/tmp/ielts-tracking-governance-summary.json npm run release:checklist`
  - `npm run validate:tracking-governance`
  - `bash docs/tracking/scripts/validate_tracking.sh`
  - `bash docs/tracking/scripts/status_summary.sh`
  - 同步 `S22` 台账（`US-11061~US-11070`）并追加 `REL-059`。

### 2.59 持续推进（五十六期收口：治理强化十四期）
- PR 评论本地预览能力
  - `scripts/quality-gate-pr-comment-preview.mjs`
  - 新增 CLI：输入 `quality-gate-summary.json` 可直接生成 PR 评论 markdown，支持 `--out` 输出到文件，便于本地联调评论模板。
  - `package.json`
  - 新增命令 `quality-gate:pr-comment:preview`。
- strict-codes schema 契约负向回归
  - `scripts/tests/tracking-governance-strict-codes-schema-contract.test.mjs`
  - 增加负向断言：缺失必填字段与字段类型错配应触发契约失败。
- 评论预览自动化回归
  - `scripts/tests/quality-gate-pr-comment-preview.test.mjs`
  - 覆盖异常模式渲染、`--out` 文件输出、缺失 summary 报错场景。
  - `package.json`
  - `test:release-scripts` 接入预览 CLI Node 测试。
- 文档与操作模板
  - `docs/tracking/README.md`、`docs/engineering/S9-Release-Runbook.md`
  - 补充 `quality-gate:pr-comment:preview` 使用方式与 `exact` 模式推荐 token 模板。
- 回归与台账
  - `npm run test:release-scripts`
  - `RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001 RELEASE_AUTOMATION_SUMMARY_PATH=/tmp/ielts-quality-gate-summary.json TRACKING_GOVERNANCE_SUMMARY_PATH=/tmp/ielts-tracking-governance-summary.json npm run release:checklist`
  - `npm run validate:tracking-governance`
  - `bash docs/tracking/scripts/validate_tracking.sh`
  - `bash docs/tracking/scripts/status_summary.sh`
  - 同步 `S23` 台账（`US-11071~US-11080`）并追加 `REL-060`。

### 2.60 持续推进（五十七期收口：治理强化十五期）
- PR 评论预览 CLI 支持 env-file 注入
  - `scripts/quality-gate-pr-comment-preview.mjs`
  - 新增 `--env_file` 参数，支持加载本地 env 文件并注入评论渲染变量；文件不存在或语法非法时输出明确错误（含文件行号）。
  - 变量合并顺序为 `env_file < process.env`，确保本地覆盖与 CI 运行时行为一致。
- strict-codes schema 契约测试标准化
  - `scripts/tests/tracking-governance-strict-codes-schema-contract.test.mjs`
  - 移除手写递归校验，改为 Ajv2020 编译并校验 JSON Schema，契约验证逻辑与生产 schema 保持同源语义。
  - 负向断言同步改为匹配 Ajv 关键报错片段（required/type），减少断言对文案细节的耦合。
- 评论预览回归增强
  - `scripts/tests/quality-gate-pr-comment-preview.test.mjs`
  - 增加 `--env_file` 正向场景断言，并补充 env-file 缺失失败路径，验证 CLI 报错可定位。
- runbook 排障模板完善
  - `docs/engineering/S9-Release-Runbook.md`
  - 在 `QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY_MATCH` 章节新增 `contains` vs `exact` 故障排查清单（选型、命中字段、误配示例、复核命令）。
- 回归与台账
  - `npm run test:release-scripts`
  - `RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001 RELEASE_AUTOMATION_SUMMARY_PATH=/tmp/ielts-quality-gate-summary.json TRACKING_GOVERNANCE_SUMMARY_PATH=/tmp/ielts-tracking-governance-summary.json npm run release:checklist`
  - `npm run validate:tracking-governance`
  - `bash docs/tracking/scripts/validate_tracking.sh`
  - `bash docs/tracking/scripts/status_summary.sh`
  - 同步 `S24` 台账（`US-11081~US-11090`）并追加 `REL-061`。

### 2.61 持续推进（五十八期收口：治理强化十六期）
- PR 评论预览 env-file 解析稳健性增强
  - `scripts/quality-gate-pr-comment-preview.mjs`
  - `--env_file` 支持转义字符（`\\n`/`\\r`/`\\t`/通用单字符转义）、unquoted 尾随注释、quoted 尾随注释。
  - quoted 值闭合后若存在非法尾随内容会返回明确错误：`invalid trailing env content at <file>:<line>`。
- 评论预览回归扩展
  - `scripts/tests/quality-gate-pr-comment-preview.test.mjs`
  - 增加“转义+尾随注释”正向断言（含截断语义校验）与 quoted 尾随非法内容负向断言。
- strict-codes schema 契约边界收紧
  - `docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json`
  - 增加 `additionalProperties=false`，禁止未声明字段。
  - `scripts/tests/tracking-governance-strict-codes-schema-contract.test.mjs`
  - 新增 unknown 字段负向断言，验证 schema 可阻断额外字段。
- runbook 值班模板增强
  - `docs/engineering/S9-Release-Runbook.md`
  - 增补 `exact` 命中异常示例输出与一键排障命令模板（env-file + preview 命令）。
- 回归与台账
  - `npm run test:release-scripts`
  - `RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001 RELEASE_AUTOMATION_SUMMARY_PATH=/tmp/ielts-quality-gate-summary.json TRACKING_GOVERNANCE_SUMMARY_PATH=/tmp/ielts-tracking-governance-summary.json npm run release:checklist`
  - `npm run validate:tracking-governance`
  - `bash docs/tracking/scripts/validate_tracking.sh`
  - `bash docs/tracking/scripts/status_summary.sh`
  - 同步 `S25` 台账（`US-11091~US-11100`）并追加 `REL-062`。

### 2.62 持续推进（五十九期收口：治理强化十七期）
- PR 评论预览 env-file export 兼容
  - `scripts/quality-gate-pr-comment-preview.mjs`
  - 新增 `export KEY=VALUE` 兼容（支持 `export\\s+` 前缀），并保持既有 key/assignment 校验与行号定位能力。
  - `scripts/tests/quality-gate-pr-comment-preview.test.mjs`
  - 增加 export 正向解析测试与 export 非法赋值负向测试。
- strict-codes 时间字段契约收紧
  - `docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json`
  - `checked_at` 增加 `format: date-time` 约束，避免非标准时间字符串漂移。
  - `scripts/tests/tracking-governance-strict-codes-schema-contract.test.mjs`
  - 契约测试引入 `ajv-formats`，新增 invalid `checked_at` 负向断言。
- runbook 截断调参可操作性增强
  - `docs/engineering/S9-Release-Runbook.md`
  - 增加 `abnormal_steps_truncated` 调参建议区间（常规 `8~12`，临时 `15~20`）与回落策略。
- 回归与台账
  - `npm run test:release-scripts`
  - `RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001 RELEASE_AUTOMATION_SUMMARY_PATH=/tmp/ielts-quality-gate-summary.json TRACKING_GOVERNANCE_SUMMARY_PATH=/tmp/ielts-tracking-governance-summary.json npm run release:checklist`
  - `npm run validate:tracking-governance`
  - `bash docs/tracking/scripts/validate_tracking.sh`
  - `bash docs/tracking/scripts/status_summary.sh`
  - 同步 `S26` 台账（`US-11111~US-11120`）并追加 `REL-063`。

### 2.63 持续推进（六十期收口：治理强化十八期）
- env-file 组合输入回归完善
  - `scripts/tests/quality-gate-pr-comment-preview.test.mjs`
  - 增加 `export + quoted` 空白变体回归（空格/tab/尾随注释组合），并保持既有 export/quoted 失败语义断言稳定。
- strict-codes schema_url 路径契约收紧
  - `docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json`
  - `schema_url` 增加路径 pattern 约束（`docs/tracking/schemas/*.schema.json`）。
  - `scripts/tests/tracking-governance-strict-codes-schema-contract.test.mjs`
  - 新增 invalid `schema_url` 负向断言。
- Sprint 台账同步模板脚本化
  - `scripts/tracking-sprint-sync-template.sh`
  - 新增脚本：按 `sprint + start_story_id` 生成 backlog/activity/metrics/sprint-board/实施报告片段，降低收口手工编辑成本。
  - `scripts/tests/tracking-sprint-sync-template.test.sh`
  - 新增脚本测试并接入 `test:release-scripts` 默认链路。
- 文档与操作入口
  - `docs/tracking/README.md`、`docs/engineering/S9-Release-Runbook.md`
  - 补充 `tracking-sprint-sync-template.sh` 使用方式与命令模板。
- 回归与台账
  - `npm run test:release-scripts`
  - `RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001 RELEASE_AUTOMATION_SUMMARY_PATH=/tmp/ielts-quality-gate-summary.json TRACKING_GOVERNANCE_SUMMARY_PATH=/tmp/ielts-tracking-governance-summary.json npm run release:checklist`
  - `npm run validate:tracking-governance`
  - `bash docs/tracking/scripts/validate_tracking.sh`
  - `bash docs/tracking/scripts/status_summary.sh`
  - 同步 `S27` 台账（`US-11121~US-11130`）并追加 `REL-064`。

## 3. 验收要点结果
1. Beta 白名单可按用户与 release 维护，反馈自动关联 release 并支持一键升级优先级。
2. 稳定性链路可执行 72h 长测，支持检查点采集、趋势报告生成、历史版本对比与 CSV 导出。
3. 告警支持阈值触发、条件查询、处理闭环与审计追踪。
4. 三类故障注入演练可复现并形成告警处理记录。

## 4. 测试结果
执行命令:
```bash
npm run typecheck
npm test
npm run test:e2e --workspace @ielts/client
npm run smoke:postgres:e2e-local
bash docs/tracking/scripts/validate_tracking.sh
bash docs/tracking/scripts/status_summary.sh
npm run db:migrate:release:postgres --workspace @ielts/server -- --connection_string=postgresql://postgres:postgres@127.0.0.1:55432/ielts_app --schema=public
# 启动 Postgres 后端 server 后执行:
PLAYWRIGHT_API_BASE_URL=http://127.0.0.1:8787 npm run test:e2e:stability --workspace @ielts/client
# Postgres 断连恢复专项:
RELEASE_TEST_POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:55433/ielts_app npm run test --workspace @ielts/server -- tests/s8-release-repository-postgres.integration.test.ts tests/s8-release-repository-postgres-recovery.integration.test.ts
```
结果: 全部通过（详见 `docs/tracking/releases.md` REL-019 记录）。
1. Server: 70 通过（另有 2 条 Postgres 集成/恢复用例在无 `RELEASE_TEST_POSTGRES_URL` 时自动跳过）。
2. Client: 27/27 通过。
3. 总计: 97 通过（+2 跳过）。
4. Postgres 后端 API E2E smoke: 1/1 通过（`stability-alert-flow`）。
5. Playwright E2E 套件：3/3 通过（稳定性 API + 系统角色审计 + 稳定性 UI 交互）。

## 5. 约束与后续
1. Postgres 仓储仍采用“内存读 + 异步写回”模型，但已补齐写失败后内存态回读恢复与重试/熔断机制；后续可演进为全异步仓储接口以进一步提升事务级强一致性。
2. Node SQLite 当前为实验特性，建议在生产优先使用 Postgres 后端。
3. 已新增稳定性 UI 交互链路，但当前页面仍为内部 smoke 工具页；后续建议继续补齐正式前端页面级交互回归。
