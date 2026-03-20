# Production Deployment / Recovery Drill Record（生产部署与恢复演练记录）

## 1. 目的
1. 作为 `GA-04` 与 `GA-05` 的联合签署入口，记录一次完整的生产部署、回滚、数据库恢复演练。
2. 把“仓库内已有演练环境证据”和“正式 production-like drill 已签署”严格区分，避免用本地 smoke 代替上线前总演练。
3. 为 `GA-14` 总演练和最终 `GA Go / No-Go` 提供可追溯的计时、证据和开放问题清单。

## 2. 适用范围（截至 2026-03-14）
1. 适用于当前推荐生产基线：`同域前端 + 反向代理 + apps/server + Postgres`。
2. 默认联合以下文档一起使用：
- `docs/engineering/Production-Environment-Matrix.md`
- `docs/engineering/Production-Deploy-Rollback-Runbook.md`
- `docs/engineering/Production-Database-Backup-Recovery-Runbook.md`
- `docs/engineering/Production-Incident-Runbook.md`
3. 本文既记录 `server-only` / `server + db migration` 发布演练，也记录数据库恢复与应用层回滚演练。
4. 若本次演练包含 client 代码变更，则只有在补齐正式 `build` / `artifact` / `publish` 方案后，本文记录才可作为 GA 级签署材料。

## 3. 当前状态结论
| item | current status | evidence | gap |
|---|---|---|---|
| 部署 runbook | Ready | `Production-Deploy-Rollback-Runbook.md` | 还缺一次真实窗口执行记录 |
| 数据恢复 runbook | Ready | `Production-Database-Backup-Recovery-Runbook.md` | 还缺一次真实 backup / restore 计时记录 |
| 演练环境 smoke / recovery | Ready | `REL-066` ~ `REL-069` + 本地 smoke / chaos drill | 不能直接替代 production-like sign-off |
| `server-only` / `server + db` 演练 | Can start now | 仓库已有启动、迁移、健康检查、回滚接口与 Postgres smoke | 需在隔离环境完成一次真实计时 |
| `client included` 演练 | Can start now with manual host sync | 仓库已具备 `build / artifact / publish` 与本地 smoke；宿主平台同步仍需人工执行 | 需在隔离环境完成一次真实计时 |

结论：
1. 当前可以先对 `server-only` 或 `server + db migration` 做正式演练签署。
2. 当前已可以安排“包含 client 代码变更的生产发布演练”，但正式 CDN / 反向代理同步与切回仍依赖宿主平台。
3. 当前数据库侧仍缺正式 backup / restore / PITR 平台配置与实测 RTO / RPO。

## 4. 已有证据（演练环境，非正式签署）
| evidence_id | date | source | what it proves | signoff_value |
|---|---|---|---|---|
| `REL-066` | `2026-03-08` | `docs/tracking/releases.md` | Postgres smoke 与严格 release checklist 已打通 | 证明服务端 + Postgres 门禁可重复执行 |
| `REL-067` | `2026-03-10` | `docs/tracking/releases.md` | learner 主链路跨重启恢复通过 | 证明 `auth-account` / `learner-state` / `release` 可持久化恢复 |
| `REL-068` | `2026-03-12` | `docs/tracking/releases.md` | content 主链路跨重启恢复通过，逐层回退顺序已落盘 | 证明 `practice` / `speaking` / `writing` / `mock` 持久化恢复基线存在 |
| `REL-069` | `2026-03-12` | `docs/tracking/releases.md` | strict governance + release checklist + script tests 通过 | 证明 RC 级收口链路稳定 |
| `REL-070` | `2026-03-13` | `docs/tracking/releases.md` | payment/AI runtime freeze、backup evidence manifest 与 strict checklist 通过 | 证明 GA 供应商冻结入口、runbook 与质量门禁已可重复执行 |
| `REL-071` | `2026-03-14` | `docs/tracking/releases.md` | `Stripe + Alipay / OpenAI / user export` 文档与台账同步后再次通过 strict checklist | 证明供应商冻结值、用户导出能力与 release 台账已形成可重复收口记录 |
| `postgres-chaos-drill-report` | Repo current | `apps/server/artifacts/postgres-chaos-drill-report.json` | 数据库断连时返回 `503`，恢复后写链路回到 `200` | 证明“故障可识别、恢复路径存在” |

说明：
1. 上述证据都属于“演练环境 / 本地门禁 / 本地恢复”。
2. 它们足以支撑 runbook 成稿，但不足以单独签署 `GA-04` / `GA-05` 完成。

## 5. 正式演练记录模板
以下内容在真实演练窗口中逐项填写；没有实际数据时，不应预填为 `PASS`。

### 5.1 演练元数据
| field | value |
|---|---|
| drill_id | `[待填写，例如 PROD-DRILL-2026-03-XX-01]` |
| drill_date | `[待填写]` |
| env_name | `[待填写，例如 staging-prodlike / pre-prod]` |
| release_type | `[待填写：server-only / server+db / client-included]` |
| release_scope | `[待填写：涉及模块 / 版本 / 发布单号]` |
| release_manager | `[待填写]` |
| db_operator | `[待填写]` |
| qa_owner | `[待填写]` |
| admin_operator | `[待填写]` |
| observer | `[待填写，可为空]` |
| related_release_id | `[待填写]` |
| related_risk_ids | `[待填写]` |

### 5.2 前置条件检查
| check | expected | actual | result | note |
|---|---|---|---|---|
| `SYSTEM_RBAC_ENFORCED=true` | 已确认 | `[待填写]` | `[PASS/FAIL]` |  |
| 所有状态域使用 `postgres` | 已确认 | `[待填写]` | `[PASS/FAIL]` |  |
| `admin` token 可用 | 已确认 | `[待填写]` | `[PASS/FAIL]` |  |
| DB 备份或恢复点已创建 | 已确认 | `[待填写]` | `[PASS/FAIL]` |  |
| 本次发布范围已冻结 | 已确认 | `[待填写]` | `[PASS/FAIL]` |  |
| 已知问题接受边界已确认 | 已确认 | `[待填写]` | `[PASS/FAIL]` |  |
| client 构建发布路径已确认 | 仅在 `client-included` 时必填 | `[待填写/N.A.]` | `[PASS/FAIL/N.A.]` |  |
| 认证签名密钥已外置 | GA 级演练必填 | `[待填写]` | `[PASS/FAIL]` |  |
| payment / AI runtime 已冻结 | 若本次涉及 billing 或 AI provider 调整则必填 | `[待填写/N.A.]` | `[PASS/FAIL/N.A.]` | 对照 `/v1/system/payments/runtime` 与 `/v1/system/health/providers` `runtime_config` |

### 5.3 部署执行记录
| step | started_at | ended_at | duration_min | operator | evidence | result | note |
|---|---|---|---|---|---|---|---|
| 发布前冻结与口令确认 | `[待填写]` | `[待填写]` | `[待填写]` | `[待填写]` | 会议记录 / IM 截图 | `[PASS/FAIL]` |  |
| 数据库迁移 | `[待填写]` | `[待填写]` | `[待填写]` | `[待填写]` | migration log | `[PASS/FAIL]` |  |
| 停旧进程 | `[待填写]` | `[待填写]` | `[待填写]` | `[待填写]` | process log | `[PASS/FAIL]` |  |
| 启动新进程 | `[待填写]` | `[待填写]` | `[待填写]` | `[待填写]` | startup log | `[PASS/FAIL]` |  |
| `/health` 验证 | `[待填写]` | `[待填写]` | `[待填写]` | `[待填写]` | HTTP 200 记录 | `[PASS/FAIL]` |  |
| `provider health` 验证 | `[待填写]` | `[待填写]` | `[待填写]` | `[待填写]` | API response | `[PASS/FAIL]` |  |
| `release metrics` 验证 | `[待填写]` | `[待填写]` | `[待填写]` | `[待填写]` | API response | `[PASS/FAIL]` |  |
| 主链路抽检 | `[待填写]` | `[待填写]` | `[待填写]` | `[待填写]` | QA checklist | `[PASS/FAIL]` |  |

### 5.4 回滚执行记录
仅在本次 drill 明确包含回滚演练时填写；若未执行，必须说明原因。

| step | started_at | ended_at | duration_min | operator | evidence | result | note |
|---|---|---|---|---|---|---|---|
| 触发条件确认 | `[待填写]` | `[待填写]` | `[待填写]` | `[待填写]` | alert / note | `[PASS/FAIL/N.A.]` |  |
| 应用层 rollback | `[待填写]` | `[待填写]` | `[待填写]` | `[待填写]` | rollback API response | `[PASS/FAIL/N.A.]` |  |
| 进程级回滚 | `[待填写]` | `[待填写]` | `[待填写]` | `[待填写]` | process log | `[PASS/FAIL/N.A.]` |  |
| 回滚后 `/health` 验证 | `[待填写]` | `[待填写]` | `[待填写]` | `[待填写]` | HTTP 200 记录 | `[PASS/FAIL/N.A.]` |  |
| 回滚后主链路抽检 | `[待填写]` | `[待填写]` | `[待填写]` | `[待填写]` | QA checklist | `[PASS/FAIL/N.A.]` |  |

### 5.5 数据恢复执行记录
| step | started_at | ended_at | duration_min | operator | evidence | result | note |
|---|---|---|---|---|---|---|---|
| 备份点确认 | `[待填写]` | `[待填写]` | `[待填写]` | `[待填写]` | backup id / snapshot id | `[PASS/FAIL]` |  |
| 恢复到隔离实例或原实例 | `[待填写]` | `[待填写]` | `[待填写]` | `[待填写]` | platform restore log | `[PASS/FAIL]` |  |
| 连接串切换 | `[待填写]` | `[待填写]` | `[待填写]` | `[待填写]` | config diff | `[PASS/FAIL]` |  |
| schema 校验 / 必要迁移 | `[待填写]` | `[待填写]` | `[待填写]` | `[待填写]` | migration / verify log | `[PASS/FAIL]` |  |
| 恢复后 `/health` 验证 | `[待填写]` | `[待填写]` | `[待填写]` | `[待填写]` | HTTP 200 记录 | `[PASS/FAIL]` |  |
| 恢复后主链路抽检 | `[待填写]` | `[待填写]` | `[待填写]` | `[待填写]` | QA checklist | `[PASS/FAIL]` |  |
| backup evidence manifest 归档 | `[待填写]` | `[待填写]` | `[待填写]` | `[待填写]` | `backup_recovery_evidence` JSON | `[PASS/FAIL]` | 建议使用 `npm run backup:evidence:manifest` |

### 5.6 关键计时与结论
| metric | target | actual | result | note |
|---|---|---|---|---|
| deployment_window_total | `[待填写]` | `[待填写]` | `[PASS/FAIL]` |  |
| rollback_window_total | `[待填写]` | `[待填写]` | `[PASS/FAIL/N.A.]` |  |
| `RTO` | `<= 60 min` | `[待填写]` | `[PASS/FAIL]` |  |
| `RPO` | `<= 15 min` | `[待填写]` | `[PASS/FAIL]` |  |
| user_visible_impact | `<= agreed threshold` | `[待填写]` | `[PASS/FAIL]` |  |

### 5.7 演练结论
| item | value |
|---|---|
| final_result | `[PASS / PASS-WITH-GAPS / FAIL]` |
| go_for_ga | `[Yes / No / Conditional]` |
| blocking_gaps | `[待填写]` |
| followups | `[待填写]` |
| owner_and_due_date | `[待填写]` |

### 5.8 签署
| role | name | signoff | signed_at |
|---|---|---|---|
| release manager | `[待填写]` | `[Agree / Reject / Conditional]` | `[待填写]` |
| db operator | `[待填写]` | `[Agree / Reject / Conditional]` | `[待填写]` |
| qa owner | `[待填写]` | `[Agree / Reject / Conditional]` | `[待填写]` |
| admin operator | `[待填写]` | `[Agree / Reject / Conditional]` | `[待填写]` |

## 6. 最低签署标准
1. 真实执行过一次部署，不接受只贴命令模板。
2. 至少执行一次 rollback 验证，不接受“理论上可回滚”。
3. 至少执行一次数据库恢复验证，并留下 backup id / snapshot id / restore log。
4. 明确记录 `RTO` 与 `RPO` 的实际值，不能只写“满足目标”。
5. 若本次包含 client 变更，必须同时记录 client artifact 来源、发布步骤和缓存刷新路径。
6. 若目标环境未提供 `AUTH_SECRET` / `AUTH_SECRET_FILE` 或 secret 轮换记录缺失，本演练最多只能记为 `PASS-WITH-GAPS`。

## 7. 当前已知阻断项
1. client 已有正式 `build` / `preview` / artifact publish 流程，但宿主平台静态同步与快速回退仍未冻结。
2. 服务端认证签名密钥已支持外置，但生产环境 secret manager / 文件挂载与轮换记录仍待落实。
3. 仓库内未见正式 `pg_dump`、snapshot orchestration 或 PITR 执行脚本；当前仅补了 evidence manifest 产物。
4. `Stripe + Alipay`、`OpenAI` 与退款 `manual_review` 的首发口径虽已冻结，但真实密钥托管、region/DPA 与生产 fallback 签署材料仍未形成闭环。
5. 当前仓库没有正式 artifact registry、service manager 或 immutable server build 产物。

## 8. 最先可开始做的事
1. 先在隔离的 production-like 环境执行一次 `server-only` 或 `server + db migration` drill，因为这条路径已具备 runbook 和脚本基线。
2. 演练时严格记录四个时间点：开始冻结、迁移完成、新版本健康检查通过、回滚或恢复完成。
3. 若计划近期发布 client 变更，先用 `Client-Build-Artifact-Publish-Runbook` 跑一次本地 smoke，再安排包含 client 的 drill。
4. 数据库恢复演练结束后，统一用 `npm run backup:evidence:manifest` 生成 evidence manifest 并挂到本模板。
5. 并行补齐生产 secret manager / secret rotation 与数据库平台 backup / PITR 配置，否则 `GA-04` / `GA-05` 只能停留在条件通过。
