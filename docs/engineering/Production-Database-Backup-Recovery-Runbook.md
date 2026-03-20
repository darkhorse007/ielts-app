# Production Database Backup / Recovery Runbook（生产数据库备份与恢复手册）

## 1. 目的
1. 作为 `GA-05` 的首个正式产物，明确当前仓库对 Postgres 持久化、恢复验证、备份要求与回退路径的真实边界。
2. 将“已有恢复演练证据”和“仍未落地的生产备份编排”明确区分，避免把本地 smoke 误当作完整容灾能力。
3. 为 `GA-14` 总演练和最终 `GA Go / No-Go` 决策提供数据库侧输入。

## 2. 适用范围（截至 2026-03-13）
1. 适用于当前推荐生产基线：`apps/server + Postgres`。
2. 覆盖以下持久化域：
- `release`
- `auth-account`
- `learner-state`
- `practice-state`
- `speaking-state`
- `writing-state`
- `mock-state`
3. 默认沿用以下文档：
- `docs/engineering/Production-Environment-Matrix.md`
- `docs/engineering/Production-Deploy-Rollback-Runbook.md`
- `docs/engineering/Production-Incident-Runbook.md`

## 3. 目标值与当前状态
### 3.1 架构目标
来自 `docs/architecture/Technical-Architecture.md` 的容灾目标：
1. 数据库每日全量备份 + 高频增量备份。
2. `RPO <= 15 分钟`
3. `RTO <= 60 分钟`

### 3.2 当前结论
| capability | current status | repo evidence |
|---|---|---|
| Postgres 迁移入口 | Ready | 各域均有 `db:migrate:*:postgres` |
| 进程重启后状态恢复 | Ready（演练环境） | learner / content restart recovery smoke |
| 发布链路写失败后的恢复 | Ready（演练环境） | Postgres chaos drill + recovery integration tests |
| 外部 Postgres 复用模式 | Ready（演练环境） | `POSTGRES_CONNECTION_STRING` / `RELEASE_TEST_POSTGRES_URL` |
| 正式生产备份编排 | Partial | 仓库内已补 `scripts/backup-evidence-manifest.mjs` 生成标准化 restore evidence manifest，但尚未接管平台侧 snapshot / PITR 编排 |
| RPO / RTO 实测记录 | Missing | 当前只有本地恢复验证，没有生产级计时记录 |

结论：
1. 当前仓库已经具备“迁移 + 持久化 + 跨重启恢复 + 瞬时断连恢复”的工程基线。
2. 当前还不具备“正式生产 backup / restore / PITR 编排闭环”，这仍是 GA 阻断项。

## 4. 已有恢复证据
### 4.1 统一 Postgres smoke
入口：
```bash
npm run smoke:postgres:e2e-local
```

覆盖：
1. `release`
2. `auth-account`
3. `learner-state`
4. `practice-state`
5. `speaking-state`
6. `writing-state`
7. `mock-state`
8. Postgres-backed API smoke

特性：
1. 默认可自动拉起本地 Docker / OrbStack Postgres。
2. 也支持显式复用外部实例：
```bash
POSTGRES_CONNECTION_STRING=postgresql://... POSTGRES_SMOKE_START_DOCKER=false npm run smoke:postgres:e2e-local
```

### 4.2 Learner 主链路跨重启恢复
入口：
```bash
npm run smoke:learner-restart:e2e-local
```

覆盖：
1. `auth-account`
2. `learner-state`
3. `release`
4. 浏览器级 learner 主链路回归

### 4.3 Content 主链路跨重启恢复
入口：
```bash
npm run smoke:content-restart:e2e-local
```

覆盖：
1. `practice-state`
2. `speaking-state`
3. `writing-state`
4. `mock-state`
5. learner / auth / release 的联合持久化场景
6. 浏览器级 `practice -> writing -> mock` 回归

### 4.4 瞬时断连与恢复演练
入口：
```bash
npm run drill:postgres-chaos:local
```

当前仓库已有样例产物 `apps/server/artifacts/postgres-chaos-drill-report.json`，其中记录了：
1. `baseline.status = 200`
2. `during_disconnect.status = 503`
3. `during_disconnect.code = RELEASE_STORAGE_UNAVAILABLE`
4. `recovered.status = 200`

这证明当前发布链路至少已验证：
1. 数据库不可用时，系统写接口会返回可识别的 `503`.
2. 数据库恢复后，写链路可以恢复成功。

## 5. 迁移与恢复入口
### 5.1 迁移顺序
1. `npm run db:migrate:release:postgres --workspace @ielts/server -- --connection_string=... --schema=...`
2. `npm run db:migrate:auth-account:postgres --workspace @ielts/server -- --connection_string=... --schema=...`
3. `npm run db:migrate:learner-state:postgres --workspace @ielts/server -- --connection_string=... --schema=...`
4. `npm run db:migrate:practice-state:postgres --workspace @ielts/server -- --connection_string=... --schema=...`
5. `npm run db:migrate:speaking-state:postgres --workspace @ielts/server -- --connection_string=... --schema=...`
6. `npm run db:migrate:writing-state:postgres --workspace @ielts/server -- --connection_string=... --schema=...`
7. `npm run db:migrate:mock-state:postgres --workspace @ielts/server -- --connection_string=... --schema=...`

### 5.2 SQLite -> Postgres 迁移
```bash
npm run db:migrate:release:sqlite-to-postgres -- --sqlite_db_path=apps/server/data/release.db --connection_string=... --schema=public --truncate_target=true
npm run db:verify:release:sqlite-postgres -- --sqlite_db_path=apps/server/data/release.db --connection_string=... --schema=public --strict=true
```

说明：
1. 该路径当前只显式覆盖 release 域的 SQLite -> Postgres 迁移。
2. 生产正式切换前，必须先确认其余域不会残留在 `memory` 或旧存储后端。

## 6. 备份策略
### 6.1 当前仓库内已落地的部分
1. 迁移入口已标准化。
2. 恢复验证 smoke 已标准化。
3. 数据库不可用时的应用层错误码、告警与审计事件已标准化。
4. 已新增 `npm run backup:evidence:manifest`，用于在真实 drill 后沉淀 backup id / restore point / RTO / RPO / evidence paths。

### 6.2 当前仓库内未落地的部分
1. 未见正式 `pg_dump` / restore 执行脚本。
2. 未见托管数据库 snapshot / PITR 自动编排脚本。
3. 虽已补 evidence manifest 产物，但备份保留策略、加密策略与定期 restore drill 记录仍需平台侧落定。

### 6.3 生产必备外部控制项
以下能力必须由生产数据库平台或运维平台补齐：
1. 每日全量备份。
2. 高频增量备份或 PITR。
3. 备份 retention policy。
4. 至少一条“恢复到隔离实例”的标准操作路径。
5. 备份完成与恢复成功的审计记录。

## 7. 恢复场景与动作
### 7.1 场景 A：数据库瞬时不可用，但实例未损坏
识别信号：
1. `/v1/system/release/metrics` 中 `storage_resilience.circuit_open=true`
2. 发布写接口返回 `503 RELEASE_STORAGE_UNAVAILABLE`
3. Postgres chaos 语义复现

动作：
1. 先恢复数据库实例可用性。
2. 不立刻重跑迁移，先验证现有实例是否恢复。
3. 查询：
- `/health`
- `/v1/system/release/metrics`
4. 如服务恢复但用户面仍异常，再进入应用层 rollback 或进程级 rollback。

### 7.2 场景 B：服务重启后需要验证状态恢复
动作：
1. 使用与生产等价的 Postgres 连接串启动服务。
2. 验证 `/health`。
3. 按域做最小抽检：
- learner
- practice
- speaking
- writing
- mock
4. 在演练环境中，可使用：
- `npm run smoke:learner-restart:e2e-local`
- `npm run smoke:content-restart:e2e-local`

### 7.3 场景 C：需要从备份恢复到新实例
前提：
1. 该动作当前依赖外部数据库平台，不在仓库脚本内。

动作：
1. 在数据库平台将最近可接受的备份恢复到新实例。
2. 记录新的 connection string 与 schema。
3. 将所有 `*_STORAGE_CONNECTION_STRING` 指向新实例。
4. 仅在以下情况下执行迁移：
- 恢复的是空实例
- 恢复点早于当前发布需要的 schema 版本
5. 若恢复的是已包含当前 schema 的快照，不应先盲目重跑迁移。
6. 启动服务并执行最小验收：
- `/health`
- `/v1/system/release/metrics`
- `/v1/system/health/providers`

### 7.4 场景 D：多仓储配置回退
按以下顺序回退：
1. `MOCK_STATE_STORAGE_BACKEND`
2. `WRITING_STATE_STORAGE_BACKEND`
3. `SPEAKING_STATE_STORAGE_BACKEND`
4. `PRACTICE_STATE_STORAGE_BACKEND`
5. `LEARNER_STATE_STORAGE_BACKEND`
6. `AUTH_ACCOUNT_STORAGE_BACKEND`
7. `RELEASE_STORAGE_BACKEND`

要求：
1. 每回退一层，都要同步检查对应连接串是否仍然指向正确实例。
2. 回退后重新验证 `/health` 与主链路。

## 8. 验收与证据留存
### 8.1 每次恢复后最低验收
1. `/health` 通过。
2. `/v1/system/release/metrics` 中 `failed_writes` 不再继续增长。
3. `storage_resilience.circuit_open=false`。
4. 至少一条 learner 或 content 主链路可以成功完成。

### 8.2 建议留存的证据
1. `quality-gate-summary-json`
2. `postgres-chaos-drill-report`
3. learner / content restart recovery 执行结果
4. 备份恢复窗口开始 / 完成时间
5. 新旧 connection string 所属实例标识
6. 若为真实 backup / restore drill，补一份：
```bash
npm run backup:evidence:manifest -- --drill_id PROD-DRILL-2026-03-13-01 --release_id REL-070 --env_name pre-prod --backup_provider <platform> --backup_artifact_id <snapshot-or-backup-id> --restore_target <restored-instance> --restore_started_at <ISO8601> --restore_completed_at <ISO8601> --actual_rpo_minutes <n> --evidence_paths <path1,path2>
```

## 9. RTO / RPO 当前判断
| item | target | current evidence | current judgement |
|---|---|---|---|
| RPO | `<= 15 分钟` | 架构目标已定义，但仓库内无正式增量备份 / PITR 编排 | Not yet proven |
| RTO | `<= 60 分钟` | 本地 chaos / restart recovery 已证明“可恢复”，但没有生产级计时记录 | Partially evidenced, not signed off |

结论：
1. 当前只能证明“恢复路径存在”，不能证明“已满足正式 RTO / RPO 目标”。
2. `GA-05` 真正完成还需要一次真实备份恢复演练记录与计时结果。

## 10. 当前缺口
1. 缺少正式 backup / restore 执行脚本。
2. 缺少生产数据库平台的 snapshot / PITR 配置留档。
3. 缺少真实 RTO / RPO 演练记录。
4. 目前恢复验证主要集中在演练环境，而非真实生产副本环境。
5. 当前 evidence manifest 只负责沉淀证据，不替代平台侧编排。

## 11. 下一步建议
1. `docs/engineering/Production-Deployment-Recovery-Drill-Record.md` 已落为 `GA-04` / `GA-05` 的联合签署模板。
2. 下一步应在 production-like 环境按该模板补一次真实 backup / restore / rollback drill，并记录 `RTO` / `RPO` 实测值，同时生成 `backup_recovery_evidence` manifest。
3. 若优先补商业与合规，则转入 `GA-08` 或 `GA-11`。
