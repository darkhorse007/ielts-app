# Tracking System（纯文件版）

## 1. 目标
在不依赖 Jira/Linear 的前提下，通过静态文件实现一套可跟踪、可交付、可复盘的执行系统。

## 2. 单一事实源
1. 主数据源: `docs/tracking/backlog.csv`
2. 状态变更日志: `docs/tracking/activity-log.csv`
3. 风险登记: `docs/tracking/risk-register.csv`
4. 周度指标: `docs/tracking/metrics-weekly.csv`
5. 决策记录: `docs/tracking/decisions.md`
6. 发布记录: `docs/tracking/releases.md`
7. 联签记录: `docs/tracking/signoffs/`

## 3. 目录结构
1. `docs/tracking/sprints/`: 每个 Sprint 的执行与验收页。
2. `docs/tracking/retrospectives/`: 每个 Sprint 的复盘页。
3. `docs/tracking/templates/`: 新建任务和 Sprint 的模板。
4. `docs/tracking/signoffs/`: 联签记录实例。
5. `docs/tracking/scripts/`: 校验与汇总脚本。
5. `docs/tracking/sprints/S1-Atomic-Tasks.md`: S1 原子任务示例清单。
6. `docs/tracking/sprints/S5-Atomic-Tasks.md`: S5 后台原子任务清单。
7. `docs/tracking/sprints/S6-Atomic-Tasks.md`: S6 后台原子任务清单。
8. `docs/tracking/sprints/S7.md`: S7 后台增强执行页。
9. `docs/tracking/sprints/S7-Atomic-Tasks.md`: S7 后台增强原子任务清单。
10. `docs/tracking/retrospectives/S7.md`: S7 复盘页。
11. `docs/tracking/sprints/S8.md`: S8 质量与发布增强执行页。
12. `docs/tracking/sprints/S8-Atomic-Tasks.md`: S8 质量与发布增强原子任务清单。
13. `docs/tracking/sprints/S9.md`: S9 发布门禁增强执行页。
14. `docs/tracking/sprints/S9-Atomic-Tasks.md`: S9 发布门禁增强原子任务清单。
15. `docs/tracking/sprints/S10.md`: S10 治理自动化执行页。
16. `docs/tracking/sprints/S10-Atomic-Tasks.md`: S10 治理自动化原子任务清单。
17. `docs/tracking/sprints/S11.md`: S11 治理强化二期执行页。
18. `docs/tracking/sprints/S11-Atomic-Tasks.md`: S11 治理强化二期原子任务清单。
19. `docs/tracking/sprints/S12.md`: S12 治理强化三期执行页。
20. `docs/tracking/sprints/S12-Atomic-Tasks.md`: S12 治理强化三期原子任务清单。
21. `docs/tracking/sprints/S13.md`: S13 治理强化四期执行页。
22. `docs/tracking/sprints/S13-Atomic-Tasks.md`: S13 治理强化四期原子任务清单。
23. `docs/tracking/sprints/S14.md`: S14 治理强化五期执行页。
24. `docs/tracking/sprints/S14-Atomic-Tasks.md`: S14 治理强化五期原子任务清单。
25. `docs/tracking/sprints/S15.md`: S15 治理强化六期执行页。
26. `docs/tracking/sprints/S15-Atomic-Tasks.md`: S15 治理强化六期原子任务清单。
27. `docs/tracking/sprints/S16.md`: S16 治理强化七期执行页。
28. `docs/tracking/sprints/S16-Atomic-Tasks.md`: S16 治理强化七期原子任务清单。
29. `docs/tracking/sprints/S17.md`: S17 治理强化八期执行页。
30. `docs/tracking/sprints/S17-Atomic-Tasks.md`: S17 治理强化八期原子任务清单。
31. `docs/tracking/sprints/S18.md`: S18 治理强化九期执行页。
32. `docs/tracking/sprints/S18-Atomic-Tasks.md`: S18 治理强化九期原子任务清单。
33. `docs/tracking/sprints/S19.md`: S19 治理强化十期执行页。
34. `docs/tracking/sprints/S19-Atomic-Tasks.md`: S19 治理强化十期原子任务清单。
35. `docs/tracking/sprints/S20.md`: S20 治理强化十一期执行页。
36. `docs/tracking/sprints/S20-Atomic-Tasks.md`: S20 治理强化十一期原子任务清单。
37. `docs/tracking/sprints/S21.md`: S21 治理强化十二期执行页。
38. `docs/tracking/sprints/S21-Atomic-Tasks.md`: S21 治理强化十二期原子任务清单。
39. `docs/tracking/sprints/S22.md`: S22 治理强化十三期执行页。
40. `docs/tracking/sprints/S22-Atomic-Tasks.md`: S22 治理强化十三期原子任务清单。
41. `docs/tracking/sprints/S23.md`: S23 治理强化十四期执行页。
42. `docs/tracking/sprints/S23-Atomic-Tasks.md`: S23 治理强化十四期原子任务清单。
43. `docs/tracking/sprints/S24.md`: S24 治理强化十五期执行页。
44. `docs/tracking/sprints/S24-Atomic-Tasks.md`: S24 治理强化十五期原子任务清单。
45. `docs/tracking/sprints/S25.md`: S25 治理强化十六期执行页。
46. `docs/tracking/sprints/S25-Atomic-Tasks.md`: S25 治理强化十六期原子任务清单。
47. `docs/tracking/sprints/S26.md`: S26 治理强化十七期执行页。
48. `docs/tracking/sprints/S26-Atomic-Tasks.md`: S26 治理强化十七期原子任务清单。
49. `docs/tracking/sprints/S27.md`: S27 治理强化十八期执行页。
50. `docs/tracking/sprints/S27-Atomic-Tasks.md`: S27 治理强化十八期原子任务清单。
51. `docs/tracking/retrospectives/S27.md`: S27 复盘页。
52. `docs/tracking/templates/support-case-intake-template.md`: GA-13 客服外部受理与升级模板。
53. `docs/tracking/templates/compliance-signoff-record-template.md`: GA-08/09/15 合规联签记录模板。
54. `docs/tracking/templates/content-copyright-ledger-template.csv`: 首发内容版权授权台账模板。

## 4. 状态流转规则
`Draft -> Ready -> In Progress -> In QA -> Done -> Released`

补充规则:
1. 任何状态变更必须同步更新 `backlog.csv` 与 `activity-log.csv`。
2. 缺陷返工使用 `In Progress` 或 `In QA`，不得直接从 `Done` 回到 `Ready`。
3. `Released` 仅用于上线后确认交付完成的条目。

## 5. 每周执行节奏
1. 周一: 从 `backlog.csv` 选取本 Sprint 范围，更新 `sprints/Sx.md`。
2. 周中: 每次状态变更记录到 `activity-log.csv`。
3. 周五: 更新 `metrics-weekly.csv`、`risk-register.csv`。
4. Sprint 结束: 补齐 `retrospectives/Sx.md` 与 `releases.md`。

## 6. 使用方式
1. 校验数据一致性:
```bash
bash docs/tracking/scripts/validate_tracking.sh
```
2. 查看状态汇总:
```bash
bash docs/tracking/scripts/status_summary.sh
```
3. 校验 tracking 治理同步（release/metrics/risk/activity/retro）:
```bash
npm run validate:tracking-governance
```
4. 校验指定 sprint 的治理同步:
```bash
npm run validate:tracking-governance -- --sprint S11
```
5. 根据治理 summary 生成修复模板:
```bash
bash scripts/tracking-governance-fix-template.sh --summary /tmp/tracking-governance-summary.json
```
6. 记录状态变更:
```bash
bash docs/tracking/scripts/log_activity.sh US-4103 "In Progress" "In QA" "alice" "完成口语四维评分接口联调"
```
7. 使用 `set_status.sh` 更新状态（内置治理预检查提醒）:
```bash
bash docs/tracking/scripts/set_status.sh US-4103 Done codex
```
8. 如需将治理预检查改为阻断模式:
```bash
TRACKING_STATUS_ENFORCE_GOVERNANCE=true bash docs/tracking/scripts/set_status.sh US-4103 Done codex
```
9. 如需将治理 warning 升级为失败（严格模式）:
```bash
npm run validate:tracking-governance -- --strict true
```
10. 如需只升级指定 warning code（严格模式分级）:
```bash
npm run validate:tracking-governance -- --strict true --strict_warning_codes TGW001
```
11. 如需仅预览治理修复模板（不落盘）:
```bash
bash scripts/tracking-governance-fix-template.sh --summary /tmp/tracking-governance-summary.json --dry_run true
```
12. 如需检查 strict warning code 配置并观察非法 code 提示:
```bash
npm run validate:tracking-governance -- --strict true --strict_warning_codes TGW001,TGW999
```
13. 如需以 JSON 方式输出 dry-run 修复计划:
```bash
bash scripts/tracking-governance-fix-template.sh --summary /tmp/tracking-governance-summary.json --dry_run true --output_format json
```
14. 如需在发布前快速校验 strict warning code 配置:
```bash
npm run validate:tracking-governance:strict-codes -- --strict_warning_codes TGW001
```
15. 如需将 dry-run JSON 输出写入文件:
```bash
bash scripts/tracking-governance-fix-template.sh --summary /tmp/tracking-governance-summary.json --dry_run true --output_format json --out /tmp/tracking-governance-fix-plan.json
```
16. 如需强制 strict code 非空输入:
```bash
npm run validate:tracking-governance:strict-codes -- --strict_warning_codes TGW001 --require_non_empty true
```
17. dry-run JSON 输出会包含 `recommended_actions`，可直接驱动自动化修复流程。
18. 如需查询 strict warning code 支持列表（JSON）:
```bash
npm run validate:tracking-governance:strict-codes -- --supported_codes json
```
  当前支持列表包含 `TGW001`（缺失 activity log）、`TGW002`（非法 strict code 配置）与 `TGW003`（Epic 状态 roll-up 漂移）。
19. 如需在 PR 评论仅展示异常字段（quality-gate）:
```bash
# GitHub Repo Variables
QUALITY_GATE_PR_COMMENT_ABNORMAL_ONLY=true
```
20. 如需将 strict-codes summary-file 日志输出到 stdout:
```bash
npm run validate:tracking-governance:strict-codes -- --strict_warning_codes TGW001 --summary_to_stderr false
```
21. 如需静默 strict-codes 非必要日志（保留退出码）:
```bash
npm run validate:tracking-governance:strict-codes -- --strict_warning_codes TGW001 --quiet true
```
22. 如需控制 PR 评论异常步骤展示上限:
```bash
# GitHub Repo Variables
QUALITY_GATE_PR_COMMENT_ABNORMAL_MAX_STEPS=10
```
23. 如需自定义 PR 评论异常步骤排序优先级:
```bash
# GitHub Repo Variables
QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY=typecheck,test,e2e,postgres,visual
```
24. 如需将 PR 评论异常步骤匹配模式改为精确匹配:
```bash
# GitHub Repo Variables
QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY_MATCH=exact
```
25. `QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY_MATCH` 支持 `contains|exact`，非法值会回退到 `contains`。
26. strict-codes JSON 输出已包含 `schema_version`（当前 `1.0`）与 `schema_url`（当前 `docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json`），下游消费建议按版本与 schema 路径做兼容解析。
27. 如需统一 strict-codes 输出模式（text/json/silent）:
```bash
npm run validate:tracking-governance:strict-codes -- --strict_warning_codes TGW001 --output_mode json
```
28. 如需静默模式（仅依赖退出码，不输出文本）:
```bash
npm run validate:tracking-governance:strict-codes -- --strict_warning_codes TGW001 --output_mode silent
```
  当启用 `--supported_codes` 时，`output_mode` 仅支持 `text|json`，`silent` 组合会失败。
29. PR 评论异常优先级标准 token（建议）: `typecheck`、`test`、`e2e`、`postgres`、`visual`。
30. `exact` 模式下评论会输出 `abnormal_priority_exact_hits` 与 `abnormal_priority_exact_hint`，用于补全精确 token 配置。
31. 如需本地预览 quality-gate PR 评论正文（读取 summary 生成 markdown）:
```bash
npm run quality-gate:pr-comment:preview -- --summary /tmp/ielts-quality-gate-summary.json
```
32. 如需输出预览结果到文件:
```bash
npm run quality-gate:pr-comment:preview -- --summary /tmp/ielts-quality-gate-summary.json --out /tmp/quality-gate-pr-comment.md
```
33. 如需通过 env-file 模拟 PR 评论变量:
```bash
npm run quality-gate:pr-comment:preview -- --summary /tmp/ielts-quality-gate-summary.json --env_file /tmp/quality-gate-preview.env
```
34. env-file 支持 `\\n/\\r/\\t` 与通用转义、尾随注释（`#`）；若 quoted 值闭合后存在非法字符会提示 `invalid trailing env content`。
35. env-file 支持 `export KEY=VALUE` 前缀写法，便于复用 shell 风格配置片段。
36. 如需在 Sprint 收口前快速生成台账同步模板（backlog/activity/metrics/board/report 片段）:
```bash
bash scripts/tracking-sprint-sync-template.sh --sprint S27 --start_story_id US-11121 --dependency_anchor US-11120
```
37. `tracking-sprint-sync-template` 默认会扫描 `docs/tracking/backlog.csv` 并阻断 Story ID 冲突；可用 `--backlog_file` 指定校验文件。
38. 如需启用安全写回（预检通过后自动追加 backlog/activity/metrics/sprint-board）:
```bash
bash scripts/tracking-sprint-sync-template.sh --sprint S27 --start_story_id US-11121 --dependency_anchor US-11120 --apply true
```
39. 如需仅预览写回计划（不修改 tracking 文件）:
```bash
bash scripts/tracking-sprint-sync-template.sh --sprint S27 --start_story_id US-11121 --dependency_anchor US-11120 --apply true --dry_run true
```
40. 如需基于 gate summary 生成 RC 交付包目录:
```bash
npm run rc:package:from-gate -- --scope "RC scope" --rollback "执行发布回滚方案"
```
41. `rc:package:from-gate` 默认会复制 RC 验收清单、已知问题模板、演示脚本、发布说明模板，并附带 release/tracking summary 副本与 release row 候选文件。
42. 如需指定输出目录或仅预览:
```bash
npm run rc:package:from-gate -- --out_dir /tmp/ielts-rc-package --dry_run true
```

## 7. 与现有文档映射
1. 需求来源: `docs/PRD-IELTS-AI-App.md`
2. Epic 定义: `docs/backlog/Epic-Map.md`
3. Story 定义: `docs/backlog/Story-Catalog-P0.md`, `docs/backlog/Story-Catalog-P1.md`
4. Sprint 基线: `docs/backlog/Sprint-Plan-12-Weeks.md`

## 8. 原子任务拆分规范
1. `Task` 必须挂在一个 `Story` 下（`parent_id=US-xxxx`）。
2. 每个 Task 必须可独立验收并有明确依赖。
3. Task 建议估算为 1-2 点（对应 0.5-1.5 天）。
4. Story 完成条件:
- 其下所有 Task 状态均为 `Done`。
- Story 验收标准通过且回归完成。
