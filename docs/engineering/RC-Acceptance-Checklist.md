# RC 验收清单（Release Candidate Acceptance Checklist）

## 1. 适用范围
1. 适用于当前 IELTS App 候选发布（RC）在本地、预发或演练环境的收口验收。
2. 目标是把“代码已完成”提升为“可发布、可演示、可排障”。

## 2. 验收前提
1. `docs/tracking/backlog.csv`、`docs/tracking/activity-log.csv`、`docs/tracking/metrics-weekly.csv`、`docs/tracking/releases.md` 已同步到最新状态。
2. 当前版本需要演示的主链路至少包括：
- 学员主链路：登录 → 入门目标 → 首次诊断 → 8 周计划
- 内容主链路：听力训练 → 写作批改 / 改写 → 全科模考与复盘
- 运维主链路：稳定性控制台 / Observability / 系统角色管理（如本次 RC 涉及）
3. 若 RC 包含 Postgres 后端验证，需提前确认：
- Docker / OrbStack 已启动，或
- 可提供外部 Postgres 连接串 `POSTGRES_CONNECTION_STRING=postgresql://...`
  默认 `smoke:postgres:e2e-local` 会先尝试本地容器路径；若脚本输出 `docker CLI is not installed` 或 `docker daemon is not available`，应切换到显式外部连接串模式而不是继续重试默认路径。

## 3. 命令矩阵（推荐顺序）
| phase | command | 目的 | 阻断级别 |
|---|---|---|---|
| 基线 | `npm run typecheck` | 类型安全校验 | Blocking |
| 基线 | `npm test` | 单元 / 集成回归 | Blocking |
| 治理 | `bash docs/tracking/scripts/validate_tracking.sh` | 文件完整性校验 | Blocking |
| 治理 | `npm run validate:tracking-governance` | release / metrics / retro / activity 一致性校验 | Blocking |
| 治理（严格建议） | `npm run validate:tracking-governance -- --strict true --strict_warning_codes TGW001,TGW003` | 将关键 warning 升级为失败 | Strongly Recommended |
| 主链路 | `npm run test:e2e:learner --workspace @ielts/client` | 学员主链路浏览器级回归 | Blocking |
| 主链路 | `npm run test:e2e:practice-writing-mock --workspace @ielts/client` | 训练 / 写作 / 模考主链路浏览器级回归 | Blocking |
| 全链路 | `FRONTEND_FULL_E2E_PARALLEL=true npm run smoke:e2e:frontend-full-local` | 本地前端全链路回归 | Strongly Recommended |
| Postgres | `npm run smoke:postgres:e2e-local` | 服务端 Postgres 集成测试 + postgres-backed API smoke | Conditional Blocking |
| 恢复（Learner） | `npm run smoke:learner-restart:e2e-local` | 学员主链路恢复验证 | Strongly Recommended |
| 恢复（Content） | `npm run smoke:content-restart:e2e-local` | 内容训练主链路恢复验证 | Strongly Recommended |
| 发布门禁 | `RELEASE_AUTOMATION_RUN_POSTGRES_SMOKE=true RELEASE_AUTOMATION_RUN_FRONTEND_FULL_E2E=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001,TGW003 npm run release:checklist` | 统一收口门禁 | Blocking |

## 4. 验收标准
### 4.1 必须满足
1. `typecheck`、`npm test`、`validate_tracking`、`validate:tracking-governance` 全部通过。
2. 浏览器级主链路用例：
- `test:e2e:learner`
- `test:e2e:practice-writing-mock`
  均通过。
3. tracking 总览不出现明显失真：
- Epic / Story 状态一致
- retro Action Items 不保留已过期但未标记状态的条目
4. 若本次 RC 涉及 Postgres 后端交付，则必须完成一次：
- `smoke:postgres:e2e-local`
  或等效外部 Postgres 验证。

### 4.2 建议满足
1. `smoke:e2e:frontend-full-local` 通过。
2. `release:checklist` 在启用所需开关后通过。
3. learner / content recovery smoke 至少各完成一次（如本次 RC 涉及持久化演进）。
4. 已生成候选发布记录草案或正式候选行。
5. 已生成 RC 交付包目录快照（如本次验收需要对外共享产物）。

## 5. RC 决策规则
| 条件 | 决策 |
|---|---|
| 所有 Blocking 项通过，且无 P0 / P1 阻断问题 | Go |
| Blocking 项通过，但存在可回避的中低风险问题 | Go with Known Issues |
| 任一 Blocking 项失败，或主链路无法演示 | No-Go |

## 6. 产物要求
1. 已知问题清单：使用 `docs/engineering/RC-Known-Issues-Template.md`
2. 演示脚本：使用 `docs/engineering/RC-Demo-Script.md`
3. 候选发布说明：使用 `docs/engineering/RC-Release-Notes-Template.md`
4. 发布门禁与回滚说明：参考 `docs/engineering/S9-Release-Runbook.md`
5. 发布记录：写入 `docs/tracking/releases.md`
6. 如需生成可交付的 RC 目录快照，执行 `npm run rc:package:from-gate -- --scope "RC scope" --rollback "执行发布回滚方案"`

## 7. 常用命令示例
### 7.1 本地标准 RC 预检
```bash
npm run typecheck
npm test
bash docs/tracking/scripts/validate_tracking.sh
npm run validate:tracking-governance -- --strict true --strict_warning_codes TGW001,TGW003
npm run test:e2e:learner --workspace @ielts/client
npm run test:e2e:practice-writing-mock --workspace @ielts/client
FRONTEND_FULL_E2E_PARALLEL=true npm run smoke:e2e:frontend-full-local
npm run smoke:learner-restart:e2e-local
npm run smoke:content-restart:e2e-local
RELEASE_AUTOMATION_RUN_POSTGRES_SMOKE=true \
RELEASE_AUTOMATION_RUN_FRONTEND_FULL_E2E=true \
RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true \
RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001,TGW003 \
npm run release:checklist
```

### 7.2 使用外部 Postgres 的 RC 预检
```bash
POSTGRES_CONNECTION_STRING=postgresql://... \
POSTGRES_SMOKE_START_DOCKER=false \
npm run smoke:postgres:e2e-local
```
若仅想复用外部实例执行服务端集成测试，可改用：
```bash
RELEASE_TEST_POSTGRES_URL=postgresql://... \
npm run test:server:integration:postgres
```

## 8. 最终签署记录
| item | owner | result | notes |
|---|---|---|---|
| 工程验收 | codex | Pass | `RELEASE_AUTOMATION_RUN_SCRIPT_TESTS=true` + strict governance 的 `npm run release:checklist` 通过；`rc:package:from-gate` 与 `release-record-candidate` 已完成真实 smoke |
| 测试验收 | codex | Pass | `npm run test:release-scripts`、`bash scripts/tests/rc-package-from-gate.test.sh`、`bash scripts/tests/release-record-from-gate.test.sh` 与 tracking strict 校验通过 |
| 产品验收 | codex | Pass（S31 RC 运维基线） | RC 交付包目录、候选发布记录、runbook/RC 清单与 tracking strict 治理已形成一键收口闭环 |
| 发布决策 | codex | Go | 记录见 `docs/tracking/releases.md` 中 `REL-069`；S31 已完成最终收口 |
