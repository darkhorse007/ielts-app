# S9 发布运行手册（稳定性与回滚）

## 1. 适用范围
1. 适用于 `/v1/system/release/*`、`/v1/system/stability/*`、`/v1/system/beta/*` 发布链路。
2. 适用于灰度发布、稳定性长测、告警处理与回滚操作。

## 2. 告警分级与 SLA
| 等级 | 触发条件（任一） | 首次响应 SLA | 处置闭环 SLA | 责任角色 |
|---|---|---|---|---|
| P1 | `red` 告警且持续 2 个检查点；或 API 成功率 <= 99.0 | 10 分钟 | 60 分钟 | QA 值班 + 发布管理员 |
| P2 | `yellow` 告警持续 2 个检查点；或延迟 P95 >= 1500ms | 30 分钟 | 4 小时 | QA 值班 |
| P3 | 单点 `yellow` 告警，且下一个检查点恢复 | 2 小时 | 24 小时 | 运营/QA |

## 3. 值班流程
1. 值班 QA 每日检查 nightly `stability-drill-nightly` 产物。
2. 发现 `red` 告警时，15 分钟内在审计中补充处理说明并标记处理动作。
3. 运营负责 Beta 反馈关联核对，发布管理员负责回滚决策与执行。

## 4. 回滚决策树
1. 条件 A: `red` 告警连续 2 次且指标恶化
2. 条件 B: 发布门禁任一核心项失败（P0 缺陷、回归通过率、API 成功率）
3. 条件 C: 人工复核判定用户面影响 > 5%

决策:
1. 命中 A + (B 或 C): 立即执行回滚。
2. 仅命中 A: 先冻结扩量，30 分钟内复测一轮检查点。
3. 未命中 A: 继续观察并记录告警处理。

执行:
1. `POST /v1/system/release/canary/{canary_id}/rollback`
2. `POST /v1/system/stability/alerts/{alert_id}/handle`（`resolve` + 处置说明）
3. 审计回溯确认 `canary_release_rolled_back`、`stability_alert_handled` 已落库。

## 5. 发布前检查清单
1. 建议优先执行一键校验：`npm run release:checklist`。
2. `npm run typecheck` 通过。
3. `npm test` 全量通过。
4. `bash docs/tracking/scripts/validate_tracking.sh` 通过。
5. `bash docs/tracking/scripts/status_summary.sh` 输出无异常状态。
6. 已完成存储迁移:
- SQLite: `npm run db:migrate:release --workspace @ielts/server`
- SQLite（可选初始化）: `npm run db:seed:release --workspace @ielts/server -- --reset=true --with_sample=true`
- Postgres: `npm run db:migrate:release:postgres --workspace @ielts/server -- --connection_string=... --schema=public`
- Postgres（可选初始化）: `npm run db:seed:release:postgres --workspace @ielts/server -- --connection_string=... --schema=public --reset=true --with_sample=true`
7. 如需执行 SQLite -> Postgres 迁移，请按顺序执行:
- `npm run db:migrate:release:sqlite-to-postgres -- --sqlite_db_path=apps/server/data/release.db --connection_string=... --schema=public --truncate_target=true`
- `npm run db:verify:release:sqlite-postgres -- --sqlite_db_path=apps/server/data/release.db --connection_string=... --schema=public --strict=true`
8. 若使用 SQLite，确认 `RELEASE_STORAGE_PATH` 目录可写；若使用 Postgres，确认 `RELEASE_STORAGE_CONNECTION_STRING` 与 `RELEASE_STORAGE_SCHEMA` 已正确配置。
9. 关键接口 RBAC 已开启（`SYSTEM_RBAC_ENFORCED=true`）。
10. 若本地具备 Docker 环境，建议执行一次 Postgres 后端 API smoke:
- `npm run smoke:postgres:e2e-local`
  该脚本默认会串行执行三类 Postgres 集成测试（仓储持久化 / 恢复 / SQLite→Postgres 迁移校验）以及 postgres-backed API smoke。
  如需直接复用外部 Postgres，可传入：
  `POSTGRES_CONNECTION_STRING=postgresql://... POSTGRES_SMOKE_START_DOCKER=false npm run smoke:postgres:e2e-local`
  如只想单独跑服务端 Postgres 集成测试，可执行：
  `RELEASE_TEST_POSTGRES_URL=postgresql://... npm run test:server:integration:postgres`
  常见预检语义：
- 出现 `ERROR: docker CLI is not installed or not in PATH.` 时，说明默认本地容器路径不可用；请安装/暴露 Docker CLI，或改走外部 Postgres。
- 出现 `ERROR: docker daemon is not available.` 时，说明 CLI 存在但 Docker / OrbStack daemon 未启动；可先拉起 daemon，或直接执行外部 Postgres fallback 命令。
- 若显式设置 `POSTGRES_SMOKE_START_DOCKER=false` 但未提供 `POSTGRES_CONNECTION_STRING` / `RELEASE_TEST_POSTGRES_URL`，脚本会继续复用默认本地连接串并打印 warning；RC / 值班场景建议显式传入连接串，避免误连到错误实例。
11. 若需验证 learner 主链路在 Postgres 后端下的恢复能力，建议执行:
- `npm run smoke:learner-restart:e2e-local`
12. 若需验证 content（practice / writing / mock）主链路在 Postgres 后端下的恢复能力，建议执行:
- `npm run smoke:content-restart:e2e-local`
13. 若需验证正式前端稳定性操作链路，建议执行:
- `npm run smoke:stability-page:e2e-local`
14. 若需采集页面视觉快照用于回归对比，建议执行:
- `npm run smoke:visual-snapshots:e2e-local`
15. 若需本地验证 Postgres 断连恢复链路，建议执行:
- `npm run drill:postgres-chaos:local`
16. 若需验证 Observability 页面 `storage_alerting` 指标与过滤器交互，建议执行:
- `npm run smoke:observability-storage:e2e-local`

## 6. 发布后检查清单
1. 执行一次 `stability-soak-drill`（至少 `high-latency` 场景）。
2. 检查告警是否可查询、可处理、可审计追溯。
3. 校验趋势报告导出是否可用（CSV 内容包含 `metric,baseline,target,delta`）。
4. 更新发布记录到 `docs/tracking/releases.md`。
5. 如使用 Postgres 后端，需额外验证写接口 durability barrier:
- 在数据库不可用时，系统写接口返回 `503` 且错误码为 `RELEASE_STORAGE_UNAVAILABLE`。
- 在数据库恢复后，写接口可恢复成功并保持读写一致。
6. 发布写接口已迁移为服务层 async 写路径（含 gate/canary/soak-start/checkpoint/alert-handle/beta whitelist/feedback/escalate），排障时优先检查对应 API 调用链路与存储 flush 状态。
7. 若客户端具备重试逻辑，建议在 canary/beta/stability 写接口使用 `x-idempotency-key`，以避免重复写导致副作用重复执行。
8. 若存在并发写风险，建议在 canary/beta 关键更新接口携带 `expected_version`，并在冲突返回 `*_VERSION_CONFLICT` 时先读取最新状态再重试。

## 7. Postgres 故障演练（标准步骤）
1. 先用 Postgres 后端启动服务并确认 `/health` 正常。
2. 若采用自动化 drill（注册新用户发起系统写操作），建议临时关闭 RBAC（`SYSTEM_RBAC_ENFORCED=false`）或准备具备 `release:manage` 权限的 token。
3. 人为制造数据库不可用（例如停止 Postgres 容器/实例）。
4. 执行任一系统写接口（如 `/v1/system/release/gate/evaluate`），预期返回 `503 RELEASE_STORAGE_UNAVAILABLE`。
5. 恢复数据库后重试同一写接口，预期恢复 `2xx`。
6. 查询发布链路指标接口 `/v1/system/release/metrics`，确认:
- `write_latency.failed_writes` 有记录增长。
- 可看到高延迟/失败样本与阈值告警记录（若触发）。
7. 在审计流中核对 `release_write_latency_alerted`（如触发）与业务审计事件。
8. Nightly 自动化演练可查看 `.github/workflows/stability-drill-nightly.yml` 的 `postgres-chaos-drill` job 产物（`postgres-chaos-drill-report.json`）。

## 8. PR 门禁与分支保护
1. CI 统一门禁 workflow: `.github/workflows/stability-e2e.yml`（workflow 名称 `quality-gate`）。
2. 建议在 GitHub 分支保护中将以下检查设为 Required:
- `quality-gate / quality-gate`
3. `quality-gate` 覆盖范围:
- `npm run typecheck`
- `npm test`
- `npm run validate:tracking-governance`（校验 release/metrics/risk/activity/retro 同步状态）
- Playwright API/系统 E2E 套件（`test:e2e`：稳定性 API 链路 + 系统角色审计链路 + 内置稳定性 UI 链路）
- Postgres 仓储 smoke test（GitHub Actions `postgres` service）
- Postgres API E2E smoke（Postgres 后端启动 + `test:e2e:stability`）
  当前本地 `smoke:postgres:e2e-local` 已对齐为“release + auth/account + learner-state + practice-state + speaking-state + writing-state + mock-state Postgres 迁移 + 服务端 Postgres 集成测试 + postgres-backed API smoke”的统一入口，适合 nightly / RC 前手动复核。
  如需额外验证“持久化后的 learner 主链路恢复”，可执行 `npm run smoke:learner-restart:e2e-local`。
  如需额外验证“持久化后的 content 主链路恢复”，可执行 `npm run smoke:content-restart:e2e-local`。
4. 页面视觉快照回归（`visual-snapshots`）已纳入 gate 失败聚合判定，并继续归档 artifacts 供对比分析。
5. `quality-gate` 会在 Step Summary 输出各 job 结果表，失败时可直接据此定位首个失败环节。
6. Postgres 相关 job 会额外归档数据库日志（`postgres-smoke.log` / `postgres-e2e.log`）用于排障。
7. `quality-gate` 聚合 job 会生成并上传 `quality-gate-summary-json` artifact，包含 `failed_steps` 列表，可直接用于发布台账与值班排障。
8. `typecheck-and-test` job 会上传 `quality-gate-tracking-governance-summary` artifact，用于追溯治理校验结果。
9. `typecheck-and-test` job 会上传 `quality-gate-tracking-governance-strict-codes-summary` artifact，用于追溯 strict code 预检结果。
10. 在 `pull_request` 事件中，workflow 会自动更新 PR 评论（`quality-gate summary`）展示失败步骤与 summary artifact 名称。
11. PR 评论会附带 artifact 下载提示：`quality-gate-summary-json`、`quality-gate-tracking-governance-summary`、`quality-gate-tracking-governance-strict-codes-summary`，值班可在当前 workflow run 的 Artifacts 区域直接下载。
12. 当 tracking artifact 或 strict-codes artifact 缺失时，PR 评论会追加专项 triage 模板，提示优先检查 `typecheck-and-test` 中对应校验与 artifact 上传步骤。
13. 可通过 Repo Variables 设置 `QUALITY_GATE_PR_COMMENT_ABNORMAL_ONLY=true`，将 PR 评论切换为“仅异常字段”精简模式。
14. 可通过 Repo Variables 设置 `QUALITY_GATE_PR_COMMENT_ABNORMAL_MAX_STEPS=10`，控制异常模式下展示的最大异常步骤数量（超限会显示截断提示）。
15. `abnormal_steps_truncated` 调参建议：常规建议 `8~12`；若 PR 经常出现多维失败且需一次排查可临时升到 `15~20`，排障完成后建议恢复默认值以控制评论长度。
16. `quality-gate-summary-json` 中 `tracking_governance.strict_codes_check` 已包含 `mode` 与 `duration_ms`，可用于预检语义与耗时排障。
17. 可通过 Repo Variables 设置 `QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY=typecheck,test,e2e,postgres,visual`，自定义异常步骤排序优先级（从左到右优先）。
18. 异常模式下，评论中的异常步骤会按优先级排序展示，默认：`typecheck > test > e2e > postgres > visual`。
19. 可通过 Repo Variables 设置 `QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY_MATCH=contains|exact` 控制优先级匹配模式（默认 `contains`，非法值会回退 `contains`）。
20. 异常模式会输出标准 token 参考（含示例），`exact` 模式下会额外输出 `abnormal_priority_exact_hits` 与 `abnormal_priority_exact_hint`，用于调整精确 token 命中。
21. 若启用 `exact` 模式，建议优先使用当前 gate step 名称模板：
- `QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY=typecheck-and-test,e2e,postgres-smoke,postgres-e2e-smoke,visual-snapshots`
22. 仅当上述检查全部通过时，允许合并到受保护分支。
23. `contains`/`exact` 模式排障清单：
- 目标是“按类别粗分流”（如把 `postgres-*` 归在一起）时，优先用 `contains`，token 可写为 `postgres`、`visual` 等短关键字。
- 目标是“固定命中具体 step”时，使用 `exact`，并将 token 写成完整 step 名称（如 `typecheck-and-test`、`visual-snapshots`）。
- 若 `exact` 模式下命中异常，先查看评论中的 `abnormal_priority_exact_hits`：值为 `0` 说明 token 与当前 step 名称未精确匹配。
- 结合 `abnormal_priority_exact_hint` 对照修正 token，再本地执行 `npm run quality-gate:pr-comment:preview -- --summary ...` 复核命中结果。
- 常见误配：沿用旧 step 名称、token 带多余空格、逗号分隔后出现空 token、误把 `contains` 的短 token 直接用于 `exact`。
- `exact` 命中异常示例（优先处理 `=0` 的 token）：
- `abnormal_priority_exact_hits: typecheck-and-test=0, visual-snapshots=1`
- `abnormal_priority_exact_hint: add exact token(s) like typecheck-and-test`
- 一键排障命令模板（本地）：
- `cat >/tmp/quality-gate-preview.env <<'EOF'`
- `QUALITY_GATE_PR_COMMENT_ABNORMAL_ONLY=true`
- `QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY_MATCH=exact`
- `QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY=typecheck-and-test,visual-snapshots`
- `EOF`
- `npm run quality-gate:pr-comment:preview -- --summary /tmp/ielts-quality-gate-summary.json --env_file /tmp/quality-gate-preview.env`

## 9. 发布自动化脚本
1. 根命令 `npm run release:checklist` 默认执行:
- `npm run typecheck`
- `npm test`
- `bash docs/tracking/scripts/validate_tracking.sh`
- `bash docs/tracking/scripts/status_summary.sh`
- `npm run validate:tracking-governance`
2. 可选扩展:
- `RELEASE_AUTOMATION_RUN_E2E=true npm run release:checklist`
- `RELEASE_AUTOMATION_RUN_POSTGRES_SMOKE=true npm run release:checklist`
- `RELEASE_AUTOMATION_RUN_STABILITY_PAGE_E2E=true npm run release:checklist`
- `RELEASE_AUTOMATION_RUN_VISUAL_SNAPSHOTS=true npm run release:checklist`
- `RELEASE_AUTOMATION_RUN_POSTGRES_CHAOS=true npm run release:checklist`
- `RELEASE_AUTOMATION_RUN_OBSERVABILITY_STORAGE_E2E=true npm run release:checklist`
- `RELEASE_AUTOMATION_RUN_SCRIPT_TESTS=true npm run release:checklist`
- `RELEASE_AUTOMATION_RUN_FRONTEND_FULL_E2E=true npm run release:checklist`
- `RELEASE_AUTOMATION_RUN_POSTGRES_SMOKE=true RELEASE_AUTOMATION_RUN_FRONTEND_FULL_E2E=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001,TGW003 RELEASE_AUTOMATION_SUMMARY_PATH=/tmp/ielts-quality-gate-summary.json TRACKING_GOVERNANCE_SUMMARY_PATH=/tmp/ielts-tracking-governance-summary.json npm run release:checklist`（S30 推荐最终收口命令）
- `RELEASE_AUTOMATION_RUN_SCRIPT_TESTS=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001,TGW003 RELEASE_AUTOMATION_SUMMARY_PATH=/tmp/ielts-quality-gate-summary-s31.json TRACKING_GOVERNANCE_SUMMARY_PATH=/tmp/ielts-tracking-governance-summary-s31.json npm run release:checklist`（S31 推荐最终收口命令）
- `RELEASE_AUTOMATION_RUN_TRACKING_GOVERNANCE=false npm run release:checklist`（跳过治理同步校验）
- `RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true npm run release:checklist`（将治理 warning 升级为失败）
- `RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_RUN_TRACKING_GOVERNANCE_STRICT_CODES_CHECK=true npm run release:checklist`（strict 模式前置执行 warning code 快速校验）
- `RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY=true npm run release:checklist`（strict code 预检要求非空配置）
- `RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001 npm run release:checklist`（仅升级指定 warning code）
- `RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001,TGW999 npm run release:checklist`（非法 code 会在治理 summary 中以 `TGW002` 提示，并输出 `strict_warning_codes_unknown`）
- `npm run validate:tracking-governance:strict-codes -- --strict_warning_codes TGW001`（仅校验 strict warning code 配置，不执行全量治理校验）
- `npm run validate:tracking-governance:strict-codes -- --supported_codes json`（以 JSON 发现 strict warning code 支持列表）
- `npm run validate:tracking-governance:strict-codes -- --strict_warning_codes TGW001 --summary_to_stderr false`（将 summary-file 日志输出到 stdout）
- `npm run validate:tracking-governance:strict-codes -- --strict_warning_codes TGW001 --quiet true`（静默非必要日志，仅保留退出码语义）
- `npm run validate:tracking-governance:strict-codes -- --strict_warning_codes TGW001 --output_mode json`（统一 strict-codes 为 JSON 输出模式）
- `npm run validate:tracking-governance:strict-codes -- --strict_warning_codes TGW001 --output_mode silent`（统一 strict-codes 为静默输出模式）
  启用 `--supported_codes` 时，`output_mode` 仅支持 `text|json`，`silent` 组合会失败。
  strict-codes JSON 输出包含 `schema_version`（当前 `1.0`）与 `schema_url`（当前 `docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json`），下游建议按版本与 schema 路径做兼容解析。
- `TRACKING_GOVERNANCE_SUMMARY_PATH=/tmp/tracking-governance-summary.json npm run release:checklist`（输出治理校验 JSON）
- `npm run validate:tracking-governance -- --sprint S12`（仅校验单个 sprint，适合状态流转前自检）
- `bash scripts/tracking-governance-fix-template.sh --summary /tmp/tracking-governance-summary.json`（根据治理 summary 生成补齐模板）
- `bash scripts/tracking-governance-fix-template.sh --summary /tmp/tracking-governance-summary.json --dry_run true`（仅预览修复计划，不生成文件）
- `bash scripts/tracking-governance-fix-template.sh --summary /tmp/tracking-governance-summary.json --dry_run true --output_format json`（以 JSON 机读方式输出修复计划）
- `bash scripts/tracking-governance-fix-template.sh --summary /tmp/tracking-governance-summary.json --dry_run true --output_format json --out /tmp/tracking-governance-fix-plan.json`（以 JSON 文件输出 dry-run 修复计划）
  JSON payload 现包含 `recommended_actions`，可直接用于自动化修复流程编排。
- `bash scripts/tracking-sprint-sync-template.sh --sprint S27 --start_story_id US-11121 --dependency_anchor US-11120`（生成 Sprint 收口台账模板片段：backlog/activity/metrics/board/report）
- `bash scripts/tracking-sprint-sync-template.sh --sprint S27 --start_story_id US-11121 --dependency_anchor US-11120 --backlog_file docs/tracking/backlog.csv`（生成前执行 Story ID 冲突预检，重号会阻断）
- `bash scripts/tracking-sprint-sync-template.sh --sprint S27 --start_story_id US-11121 --dependency_anchor US-11120 --apply true`（安全写回模式：预检通过后自动追加 backlog/activity/metrics/sprint-board）
- `bash scripts/tracking-sprint-sync-template.sh --sprint S27 --start_story_id US-11121 --dependency_anchor US-11120 --apply true --dry_run true`（仅预览写回计划，不落盘）
- `RELEASE_AUTOMATION_SUMMARY_PATH=/tmp/release-check-summary.json npm run release:checklist`（将门禁结果以 JSON 写入文件，同时控制台输出 `summary-json`）
- `RELEASE_AUTOMATION_CONTINUE_ON_ERROR=true npm run release:checklist`（失败后继续执行剩余步骤，最终仍以非 0 退出并在 summary 中输出 `failed_steps`）
- `RELEASE_AUTOMATION_DRY_RUN=true npm run release:checklist`（仅预览执行步骤，不真正执行命令）
  `test:release-scripts` 现包含 strict-codes Node 原生测试（`scripts/tests/tracking-governance-strict-codes-check.test.mjs`）、quality-gate PR 评论生成测试（`scripts/tests/quality-gate-pr-comment.test.mjs`）与 strict-codes schema 契约测试（`scripts/tests/tracking-governance-strict-codes-schema-contract.test.mjs`）。
  默认通过 `scripts/tests/run-node-test-summary.sh` 输出摘要结果；如需完整日志可设 `RELEASE_SCRIPT_TESTS_NODE_VERBOSE=true`。
- `npm run quality-gate:pr-comment:preview -- --summary /tmp/ielts-quality-gate-summary.json`（本地预览 PR 评论正文）
- `npm run quality-gate:pr-comment:preview -- --summary /tmp/ielts-quality-gate-summary.json --out /tmp/quality-gate-pr-comment.md`（预览结果输出到文件）
3. 本地一键对齐 quality-gate 关键步骤:
- `npm run smoke:quality-gate:local`
  默认会执行 `QUALITY_GATE_LOCAL_RUN_SCRIPT_TESTS=true`。
4. `smoke:quality-gate:local` 支持附加开关与失败日志归档:
- `QUALITY_GATE_LOCAL_RUN_OBSERVABILITY_STORAGE_E2E=true npm run smoke:quality-gate:local`
- `QUALITY_GATE_LOCAL_RUN_SCRIPT_TESTS=true npm run smoke:quality-gate:local`
- `QUALITY_GATE_LOCAL_RUN_FRONTEND_FULL_E2E=true npm run smoke:quality-gate:local`
- `QUALITY_GATE_LOCAL_RUN_TRACKING_GOVERNANCE=false npm run smoke:quality-gate:local`
- `QUALITY_GATE_LOCAL_TRACKING_GOVERNANCE_STRICT=true npm run smoke:quality-gate:local`
- `QUALITY_GATE_LOCAL_TRACKING_GOVERNANCE_STRICT=true QUALITY_GATE_LOCAL_RUN_TRACKING_GOVERNANCE_STRICT_CODES_CHECK=true npm run smoke:quality-gate:local`
- `QUALITY_GATE_LOCAL_TRACKING_GOVERNANCE_STRICT=true QUALITY_GATE_LOCAL_TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY=true npm run smoke:quality-gate:local`
- `QUALITY_GATE_LOCAL_TRACKING_GOVERNANCE_STRICT=true QUALITY_GATE_LOCAL_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001 npm run smoke:quality-gate:local`
- `QUALITY_GATE_LOCAL_ARTIFACTS_DIR=/tmp/ielts-quality-gate-artifacts npm run smoke:quality-gate:local`
- `QUALITY_GATE_LOCAL_SUMMARY_JSON_PATH=/tmp/ielts-quality-gate-summary.json npm run smoke:quality-gate:local`
- `QUALITY_GATE_LOCAL_TRACKING_GOVERNANCE_SUMMARY_PATH=/tmp/ielts-tracking-governance-summary.json npm run smoke:quality-gate:local`
- `QUALITY_GATE_LOCAL_CONTINUE_ON_ERROR=true npm run smoke:quality-gate:local`
- `QUALITY_GATE_LOCAL_DRY_RUN=true npm run smoke:quality-gate:local`
5. 发布记录候选模板可从 summary-json 生成:
- `npm run release:record:candidate -- --summary /tmp/release-check-summary.json --scope "E10(S9)" --rollback "执行 release 回滚方案" --out /tmp/release-row.md`
  可直接使用门禁默认路径生成（推荐）：
  `npm run release:record:from-gate`
  如需直接生成 RC 交付包目录（验收清单 / 已知问题 / 演示脚本 / 发布说明模板 + summary 副本）：
  `npm run rc:package:from-gate -- --scope "RC scope" --rollback "执行发布回滚方案"`
  默认输出到 `artifacts/rc-packages/RC-<release-id>-<timestamp>/`。
  如需指定输出目录：
  `npm run rc:package:from-gate -- --out_dir /tmp/ielts-rc-package`
  如需按最终 checklist summary 直接生成 S31 RC 包：
  `npm run rc:package:from-gate -- --summary /tmp/ielts-quality-gate-summary-s31.json --tracking_summary /tmp/ielts-tracking-governance-summary-s31.json --scope "S31(US-11157~US-11160)" --rollback "执行发布回滚方案" --out_dir /tmp/ielts-rc-package`
  如需仅预览生成计划：
  `npm run rc:package:from-gate -- --dry_run true`
  若指定输出目录已存在，可显式允许覆盖：
  `npm run rc:package:from-gate -- --out_dir /tmp/ielts-rc-package --overwrite true`
  如需将治理同步结果写入 notes，可附加：
  `npm run release:record:candidate -- --summary /tmp/release-check-summary.json --tracking_summary /tmp/tracking-governance-summary.json --append true`
  支持直接追加到 `releases.md`：
  `npm run release:record:candidate -- --summary /tmp/release-check-summary.json --append true`
  支持 dry-run 预览追加结果：
  `npm run release:record:candidate -- --summary /tmp/release-check-summary.json --append true --dry_run true`
  其中 `release:record:from-gate` 会在缺失 tracking summary 时输出告警并继续生成候选行，可结合 `tracking-governance-fix-template.sh` 先补齐台账后再重跑。
  当前 release notes 会自动合并 tracking 字段：`tracking_warnings`、`tracking_strict_mode`、`tracking_strict_warning_codes`、`tracking_strict_warning_codes_unknown`、`tracking_strict_promoted_warning_codes`。
  `quality-gate-summary-json` 中 `tracking_governance.strict_codes_check` 已包含 `mode` 与 `duration_ms`，可用于预检语义与耗时排障。
  可通过以下环境变量补充 artifact 信息：
  `RELEASE_GATE_SUMMARY_ARTIFACT=quality-gate-summary-json`
  `TRACKING_GOVERNANCE_SUMMARY_ARTIFACT=quality-gate-tracking-governance-summary`
6. Playwright 脚本补充说明:
- `npm run test:e2e --workspace @ielts/client` 仅执行 API/系统链路（后端可独立启动）。
- `npm run test:e2e:learner --workspace @ielts/client` 执行学员主链路浏览器级回归（登录 → 入门目标 → 首次诊断 → 8 周计划）。
- `npm run test:e2e:practice-writing-mock --workspace @ielts/client` 执行训练 / 写作 / 模考主链路浏览器级回归。
- `npm run test:e2e:all --workspace @ielts/client` 执行 `apps/client/e2e` 全量套件（包含前端页面流与视觉快照相关用例）。
- `npm run smoke:e2e:frontend-full-local` 本地一键执行 API + 学员主链路 + 训练/写作/模考 + stability-page + observability-storage + visual 全链路前端回归。
- `FRONTEND_FULL_E2E_PARALLEL=true npm run smoke:e2e:frontend-full-local` 启用并行模式（单次 Playwright 运行多套件）。
7. 前端运行时地址配置:
- 客户端示例配置见 `apps/client/.env.example`。
- `VITE_API_BASE_URL` 留空时，前端通过同源路径访问 `/v1/*`；本地 `vite` 开发服务器会将其代理到 `VITE_DEV_PROXY_TARGET`（默认 `http://127.0.0.1:8787`）。
- `VITE_WS_BASE_URL` 留空时，会优先从 `VITE_API_BASE_URL` 推导；若 API 也留空，则使用当前页面来源并依赖 `vite` 的 `/v1` WebSocket 代理。
- 如前后端部署在不同域名，需显式配置 `VITE_API_BASE_URL` 与 `VITE_WS_BASE_URL`，避免浏览器将请求错误地发送到当前页面域名。
- 前端标准出包命令：
  `npm run build:client`
  `npm run client:artifact -- --release_id REL-XXX`
  `npm run client:publish -- --artifact_dir artifacts/client-builds/<build-id>`
  `npm run smoke:client-build-publish:local`
- 详细目录结构与手工宿主同步边界见 `docs/engineering/Client-Build-Artifact-Publish-Runbook.md`。

## 10. RC 验收包
1. RC 验收清单: `docs/engineering/RC-Acceptance-Checklist.md`
2. 已知问题模板: `docs/engineering/RC-Known-Issues-Template.md`
3. 演示脚本: `docs/engineering/RC-Demo-Script.md`
4. 候选发布说明模板: `docs/engineering/RC-Release-Notes-Template.md`
5. 如需将上述模板按当前 gate summary 复制为独立 RC 包，可执行：
- `npm run rc:package:from-gate -- --scope "RC scope" --rollback "执行发布回滚方案"`
6. 建议在 RC 评审前，至少完成：
- `npm run test:e2e:learner --workspace @ielts/client`
- `npm run test:e2e:practice-writing-mock --workspace @ielts/client`
- `npm run smoke:learner-restart:e2e-local`
- `npm run smoke:content-restart:e2e-local`
- `npm run validate:tracking-governance -- --strict true --strict_warning_codes TGW001,TGW003`
- `RELEASE_AUTOMATION_RUN_POSTGRES_SMOKE=true RELEASE_AUTOMATION_RUN_FRONTEND_FULL_E2E=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001,TGW003 RELEASE_AUTOMATION_SUMMARY_PATH=/tmp/ielts-quality-gate-summary.json TRACKING_GOVERNANCE_SUMMARY_PATH=/tmp/ielts-tracking-governance-summary.json npm run release:checklist`
- `RELEASE_AUTOMATION_RUN_SCRIPT_TESTS=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001,TGW003 RELEASE_AUTOMATION_SUMMARY_PATH=/tmp/ielts-quality-gate-summary-s31.json TRACKING_GOVERNANCE_SUMMARY_PATH=/tmp/ielts-tracking-governance-summary-s31.json npm run release:checklist`
- `npm run rc:package:from-gate -- --summary /tmp/ielts-quality-gate-summary-s31.json --tracking_summary /tmp/ielts-tracking-governance-summary-s31.json --scope "S31(US-11157~US-11160)" --rollback "执行发布回滚方案" --out_dir /tmp/ielts-rc-package`

## 11. Postgres 写恢复参数（可选）
### 11.1 业务状态仓储环境变量
1. `AUTH_ACCOUNT_STORAGE_BACKEND`: `memory|postgres`，控制认证/账户仓储后端（默认 `memory`）。
2. `AUTH_ACCOUNT_STORAGE_CONNECTION_STRING`: 认证/账户仓储连接串；未显式提供时可复用 `RELEASE_STORAGE_CONNECTION_STRING`。
3. `AUTH_ACCOUNT_STORAGE_SCHEMA`: 认证/账户仓储 schema（默认 `public`）。
4. `LEARNER_STATE_STORAGE_BACKEND`: `memory|postgres`，控制 onboarding / plan / progress 仓储后端（默认 `memory`）。
5. `LEARNER_STATE_STORAGE_CONNECTION_STRING`: learner-state 仓储连接串；未显式提供时会回退到 auth-account 或 release 的连接串。
6. `LEARNER_STATE_STORAGE_SCHEMA`: learner-state 仓储 schema（默认 `public`）。
7. `PRACTICE_STATE_STORAGE_BACKEND`: `memory|postgres`，控制 listening/reading practice 与 retry queue 仓储后端（默认 `memory`）。
8. `PRACTICE_STATE_STORAGE_CONNECTION_STRING`: practice-state 连接串；未显式提供时按 learner/auth/release 顺序回退。
9. `PRACTICE_STATE_STORAGE_SCHEMA`: practice-state 仓储 schema（默认 `public`）。
10. `SPEAKING_STATE_STORAGE_BACKEND`: `memory|postgres`，控制 speaking realtime session 仓储后端（默认 `memory`）。
11. `SPEAKING_STATE_STORAGE_CONNECTION_STRING`: speaking-state 连接串；未显式提供时按 practice/learner/auth/release 顺序回退。
12. `SPEAKING_STATE_STORAGE_SCHEMA`: speaking-state 仓储 schema（默认 `public`）。
13. `WRITING_STATE_STORAGE_BACKEND`: `memory|postgres`，控制 writing evaluation / rewrite / template usage 仓储后端（默认 `memory`）。
14. `WRITING_STATE_STORAGE_CONNECTION_STRING`: writing-state 连接串；未显式提供时按 speaking/practice/learner/auth/release 顺序回退。
15. `WRITING_STATE_STORAGE_SCHEMA`: writing-state 仓储 schema（默认 `public`）。
16. `MOCK_STATE_STORAGE_BACKEND`: `memory|postgres`，控制 mock exam / report 仓储后端（默认 `memory`）。
17. `MOCK_STATE_STORAGE_CONNECTION_STRING`: mock-state 连接串；未显式提供时按 writing/speaking/practice/learner/auth/release 顺序回退。
18. `MOCK_STATE_STORAGE_SCHEMA`: mock-state 仓储 schema（默认 `public`）。
19. RC / 演练环境建议显式设置所有业务状态仓储的 `*_STORAGE_BACKEND=postgres`，不要仅依赖 connection string 回退链推断当前后端。
20. 若需要逐层回退多仓储配置，建议按 `MOCK_STATE_STORAGE_BACKEND -> WRITING_STATE_STORAGE_BACKEND -> SPEAKING_STATE_STORAGE_BACKEND -> PRACTICE_STATE_STORAGE_BACKEND -> LEARNER_STATE_STORAGE_BACKEND -> AUTH_ACCOUNT_STORAGE_BACKEND -> RELEASE_STORAGE_BACKEND` 顺序处理，并同步核对对应 connection string 是否仍通过上游回退链复用。

### 11.2 推荐 smoke 顺序
1. `npm run smoke:postgres:e2e-local`
2. `npm run smoke:learner-restart:e2e-local`
3. `npm run smoke:content-restart:e2e-local`
4. `RELEASE_AUTOMATION_RUN_POSTGRES_SMOKE=true RELEASE_AUTOMATION_RUN_FRONTEND_FULL_E2E=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001,TGW003 RELEASE_AUTOMATION_SUMMARY_PATH=/tmp/ielts-quality-gate-summary.json TRACKING_GOVERNANCE_SUMMARY_PATH=/tmp/ielts-tracking-governance-summary.json npm run release:checklist`

### 11.3 Postgres smoke FAQ
1. 默认模式是 `POSTGRES_SMOKE_START_DOCKER=auto`：未显式提供连接串时，脚本会尝试启动本地 Docker / OrbStack Postgres。
2. 若要强制走外部实例，推荐显式执行：
- `POSTGRES_CONNECTION_STRING=postgresql://... POSTGRES_SMOKE_START_DOCKER=false npm run smoke:postgres:e2e-local`
3. 若只想让服务端 Postgres 集成测试复用外部实例，可执行：
- `RELEASE_TEST_POSTGRES_URL=postgresql://... npm run test:server:integration:postgres`
4. daemon 未就绪时，优先判断是“缺少 Docker CLI”还是“daemon 未启动”；脚本会分别输出对应错误与 fallback 命令。
5. RC / 值班复核时，不建议依赖 `POSTGRES_SMOKE_START_DOCKER=false` + 默认本地连接串的隐式行为，优先显式传入连接串。

### 11.4 Release 仓储写恢复参数
1. `RELEASE_POSTGRES_WRITE_MAX_ATTEMPTS`: 单次写最大重试次数（默认 `3`）。
2. `RELEASE_POSTGRES_WRITE_RETRY_BASE_MS`: 退避基础时延毫秒（默认 `60`）。
3. `RELEASE_POSTGRES_WRITE_RETRY_MAX_MS`: 退避上限毫秒（默认 `800`）。
4. `RELEASE_POSTGRES_WRITE_CIRCUIT_FAILURE_THRESHOLD`: 连续失败触发熔断阈值（默认 `5`）。
5. `RELEASE_POSTGRES_WRITE_CIRCUIT_COOLDOWN_MS`: 熔断冷却毫秒（默认 `5000`）。
6. `RELEASE_POSTGRES_CIRCUIT_ALERT_THRESHOLD_MS`: circuit 持续打开触发 `release_write_circuit_prolonged` 审计的阈值毫秒（默认 `30000`）。
7. `RELEASE_POSTGRES_CIRCUIT_ALERT_RECENT_LIMIT`: `storage_resilience.alerting.recent` 环形缓冲区长度（默认 `30`）。
8. 可通过 `/v1/system/release/metrics` 中的 `storage_resilience` 观察运行时状态与告警统计（`circuit_open`、`consecutive_write_failures`、`last_error`、`alerting.recent_limit`、`alerting.recent_count`、`alerting.capped_count`）。
9. 建议在运维审计中关注事件：
- `release_write_circuit_opened`
- `release_write_circuit_prolonged`
- `release_write_circuit_recovered`
