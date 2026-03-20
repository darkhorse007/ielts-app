# S2 实施报告（US-1103 / US-1104 / US-2102 / US-2103 / US-2104）

## 1. 交付概览
- 完成状态: Done
- 完成日期: 2026-02-26
- 覆盖 Story: 5/5
- 代码范围:
  - 服务端: `apps/server/`
  - 客户端: `apps/client/`
  - 契约文档: `docs/engineering/openapi/S2-Sync-Diagnostic-Plan-Account.yaml`

## 2. Story 到交付映射

### 2.1 US-1103 多端进度同步
- 服务端
  - `apps/server/src/domain/progress-service.ts`
  - `apps/server/src/routes/progress.ts`
- 客户端
  - `apps/client/src/pages/ProgressPage.tsx`
  - `apps/client/src/lib/api-client.ts`
- 测试
  - `apps/server/tests/progress.sync.test.ts`
  - `apps/client/tests/s2-progress-account-pages.test.tsx`

### 2.2 US-1104 账号注销与数据删除
- 服务端
  - `apps/server/src/domain/account-service.ts`
  - `apps/server/src/routes/account.ts`
  - `apps/server/src/domain/auth-service.ts`（登录状态/会话撤销）
- 客户端
  - `apps/client/src/pages/AccountPage.tsx`
  - `apps/client/src/lib/api-client.ts`
- 测试
  - `apps/server/tests/account.deletion.test.ts`
  - `apps/client/tests/s2-progress-account-pages.test.tsx`

### 2.3 US-2102 5 分钟首次诊断
- 服务端
  - `apps/server/src/domain/onboarding-service.ts`（最小题量包、答题、暂停/恢复、完成评估）
  - `apps/server/src/routes/onboarding.ts`
- 客户端
  - `apps/client/src/pages/DiagnosticPage.tsx`
  - `apps/client/src/lib/api-client.ts`
- 测试
  - `apps/server/tests/diagnostic.plan.test.ts`
  - `apps/client/tests/s2-diagnostic-plan-pages.test.tsx`

### 2.4 US-2103 8 周学习计划
- 服务端
  - `apps/server/src/domain/onboarding-service.ts`（计划生成、计划读取、任务手动调整）
  - `apps/server/src/routes/onboarding.ts`
- 客户端
  - `apps/client/src/pages/StudyPlanPage.tsx`
  - `apps/client/src/lib/api-client.ts`
- 测试
  - `apps/server/tests/diagnostic.plan.test.ts`
  - `apps/client/tests/s2-diagnostic-plan-pages.test.tsx`

### 2.5 US-2104 学习计划随表现自动调整（S5 回补完成）
- 服务端
  - `apps/server/src/domain/onboarding-service.ts`（自动调整规则、原因生成、变更历史）
  - `apps/server/src/domain/practice-service.ts`（提交训练后触发计划自动调整）
  - `apps/server/src/domain/speaking-realtime-service.ts`（口语会话结束触发自动调整）
  - `apps/server/src/domain/writing-service.ts`（写作评分后触发自动调整）
  - `apps/server/src/routes/onboarding.ts`（`/v1/users/plans/{plan_id}/adjustments`）
- 客户端
  - `apps/client/src/pages/StudyPlanPage.tsx`（变更历史查看、最近变更原因展示）
  - `apps/client/src/lib/api-client.ts`（计划变更历史 API）
- 测试
  - `apps/server/tests/s5-plan-adaptive.test.ts`
  - `apps/client/tests/s2-diagnostic-plan-pages.test.tsx`

## 3. 验收要点结果
1. 进度同步: 支持服务端时间戳合并，冲突记录可追溯。
2. 注销删除: 支持申请注销、确认删除、会话撤销与数据清理。
3. 首次诊断: 提供四科最小题量包，支持中断恢复与状态查询。
4. 学习计划: 生成 8 周计划，包含周目标与任务时长/完成条件，支持任务级手动调整。
5. 动态调整: 新训练数据触发计划自动更新，返回可读原因，并可查询变更历史。

## 4. 测试结果
执行命令:
```bash
npm test
```
结果:
1. Server: 27/27 通过（含 US-2104 新增用例）。
2. Client: 20/20 通过（含计划历史展示用例）。
3. 总计: 47/47 通过。

## 5. 约束与后续
1. 当前诊断评分与计划分配为规则基线，S3 可接入更强策略与 AI 校准。
2. 当前存储仍是内存实现，后续需要迁移至 PostgreSQL/Redis 以满足持久化与并发要求。
