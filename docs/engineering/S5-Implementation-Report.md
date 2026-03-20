# S5 实施报告（US-6103 / US-7101 / US-7102 / US-7103 / US-2104 / US-8101 / US-8102 / US-8103 / US-11101 / US-11103 + US-8201 + US-8202）

## 1. 交付概览
- 完成状态: Done
- 完成日期: 2026-02-27
- 增量完成: US-8201（2026-02-27，P1 优惠券购买订阅）
- 增量完成: US-8202（2026-02-27，P1 家庭双人计划）
- 覆盖 Story: 10/10（S5 基线）+ 2（P1 增量）
- 代码范围:
  - 服务端: `apps/server/`
  - 客户端: `apps/client/`
  - 契约文档: `docs/engineering/openapi/S5-Mock-Subscription-Admin.yaml`

## 2. Story 到交付映射

### 2.1 US-6103 写作改写复评与提升对比
- 服务端
  - `apps/server/src/domain/writing-service.ts`（改写复评、分项差值、档案记录）
  - `apps/server/src/routes/writing.ts`（`/rewrite`、`/archives`）
- 客户端
  - `apps/client/src/pages/WritingEvaluationPage.tsx`（改写复评与档案加载）
- 测试
  - `apps/server/tests/s5-writing-mock-subscription.test.ts`
  - `apps/client/tests/s4-reading-speaking-writing-pages.test.tsx`

### 2.2 US-7101 全科计时模考与恢复
- 服务端
  - `apps/server/src/domain/mock-exam-service.ts`
  - `apps/server/src/routes/mock-exam.ts`（创建、进度保存、恢复、提交）
- 客户端
  - `apps/client/src/pages/MockExamPage.tsx`
- 测试
  - `apps/server/tests/s5-writing-mock-subscription.test.ts`
  - `apps/client/tests/s5-mock-subscription-admin-pages.test.tsx`

### 2.3 US-7102 模考复盘报告生成
- 服务端
  - `apps/server/src/domain/mock-exam-service.ts`（总分估计、分项趋势、错因分布、导出文本）
  - `apps/server/src/routes/mock-exam.ts`（`/report`、`/report/export`）
- 客户端
  - `apps/client/src/pages/MockExamPage.tsx`（报告加载与导出）
- 测试
  - `apps/server/tests/s5-writing-mock-subscription.test.ts`
  - `apps/client/tests/s5-mock-subscription-admin-pages.test.tsx`

### 2.4 US-7103 模考结果回写计划
- 服务端
  - `apps/server/src/domain/mock-exam-service.ts`（自动回写、可读理由、一次撤销）
  - `apps/server/src/routes/mock-exam.ts`（`/report/writeback/undo`）
- 客户端
  - `apps/client/src/pages/MockExamPage.tsx`（撤销操作）
- 测试
  - `apps/server/tests/s5-writing-mock-subscription.test.ts`

### 2.5 US-2104 学习计划随表现自动调整
- 服务端
  - `apps/server/src/domain/onboarding-service.ts`（自动调整规则、变更原因、历史查询）
  - `apps/server/src/domain/practice-service.ts`（训练提交触发计划自适应调整）
  - `apps/server/src/domain/speaking-realtime-service.ts`（口语会话结束触发调整）
  - `apps/server/src/domain/writing-service.ts`（写作评分后触发调整）
  - `apps/server/src/routes/onboarding.ts`（`/v1/users/plans/{plan_id}/adjustments`）
- 客户端
  - `apps/client/src/pages/StudyPlanPage.tsx`（变更历史与最近调整原因展示）
  - `apps/client/src/lib/api-client.ts`（计划调整历史 API）
- 测试
  - `apps/server/tests/s5-plan-adaptive.test.ts`
  - `apps/client/tests/s2-diagnostic-plan-pages.test.tsx`

### 2.6 US-8101 试用额度与限流
- 服务端
  - `apps/server/src/domain/subscription-service.ts`（日额度、消耗、重置）
  - `apps/server/src/routes/subscription.ts`
  - `apps/server/src/routes/mock-exam.ts`（创建模考时执行额度校验）
- 客户端
  - `apps/client/src/pages/SubscriptionPage.tsx`
- 测试
  - `apps/server/tests/s5-writing-mock-subscription.test.ts`
  - `apps/client/tests/s5-mock-subscription-admin-pages.test.tsx`

### 2.7 US-8102 订阅升级取消恢复
- 服务端
  - `apps/server/src/domain/subscription-service.ts`（订单、升级、取消、恢复、Webhook）
  - `apps/server/src/routes/subscription.ts`
- 客户端
  - `apps/client/src/pages/SubscriptionPage.tsx`
- 测试
  - `apps/server/tests/s5-writing-mock-subscription.test.ts`
  - `apps/client/tests/s5-mock-subscription-admin-pages.test.tsx`

### 2.8 US-8103 跨端权益一致性
- 服务端
  - `apps/server/src/domain/subscription-service.ts`（版本号与设备同步标记）
  - `apps/server/src/routes/subscription.ts`（`device_id` 查询参数）
- 客户端
  - `apps/client/src/pages/SubscriptionPage.tsx`
- 测试
  - `apps/server/tests/s5-writing-mock-subscription.test.ts`

### 2.9 US-11101 后台登录与角色菜单
- 服务端
  - `apps/server/src/domain/admin-service.ts`（Admin 登录、会话、RBAC、菜单）
  - `apps/server/src/routes/admin.ts`（`/v1/admin/auth/login`）
- 客户端
  - `apps/client/src/pages/AdminConsolePage.tsx`（后台登录与菜单展示）
- 测试
  - `apps/server/tests/s5-admin.test.ts`
  - `apps/client/tests/s5-mock-subscription-admin-pages.test.tsx`

### 2.10 US-11103 后台订单查询与权益校正
- 服务端
  - `apps/server/src/routes/admin.ts`（订单查询、权益校正、回滚一次）
  - `apps/server/src/domain/subscription-service.ts`（校正落库与回滚标记）
- 客户端
  - `apps/client/src/pages/AdminConsolePage.tsx`
- 测试
  - `apps/server/tests/s5-admin.test.ts`
  - `apps/client/tests/s5-mock-subscription-admin-pages.test.tsx`

### 2.11 US-8201 优惠券购买订阅（P1 增量）
- 服务端
  - `apps/server/src/domain/subscription-service.ts`（优惠券规则、券码校验、折扣计算、退款账务一致性）
  - `apps/server/src/routes/subscription.ts`（升级接口支持 `coupon_code`，订单响应补充账务字段）
  - `apps/server/src/routes/admin.ts`（优惠券规则查询/配置接口）
  - `apps/server/src/domain/admin-service.ts`（新增 `coupon:manage` 权限）
- 客户端
  - `apps/client/src/lib/api-types.ts`（订阅订单与后台优惠券类型扩展）
  - `apps/client/src/lib/api-client.ts`（升级接口 `coupon_code` 与后台优惠券 API）
  - `apps/client/src/pages/SubscriptionPage.tsx`（券码输入、折扣/账务展示、退款回调）
- 契约
  - `docs/engineering/openapi/S5-Mock-Subscription-Admin.yaml`
- 测试
  - `apps/server/tests/s7-subscription-coupon.test.ts`
  - `apps/client/tests/s5-mock-subscription-admin-pages.test.tsx`

### 2.12 US-8202 家庭双人计划（P1 增量）
- 服务端
  - `apps/server/src/domain/subscription-service.ts`（家庭计划组、邀请、接受、成员移除、超员策略）
  - `apps/server/src/routes/subscription.ts`（家庭邀请/接受/成员管理接口）
  - `apps/server/src/domain/types.ts`、`apps/server/src/domain/store.ts`（家庭计划模型与存储结构）
- 客户端
  - `apps/client/src/lib/api-types.ts`（家庭计划响应类型）
  - `apps/client/src/lib/api-client.ts`（家庭邀请与成员管理 API）
  - `apps/client/src/pages/SubscriptionPage.tsx`（家庭计划下单、邀请、成员管理）
- 契约
  - `docs/engineering/openapi/S5-Mock-Subscription-Admin.yaml`
- 测试
  - `apps/server/tests/s7-subscription-family.test.ts`
  - `apps/client/tests/s5-mock-subscription-admin-pages.test.tsx`

## 3. 验收要点结果
1. 写作复评: 支持改写再评，返回前后分项变化并写入档案。
2. 模考恢复: 支持听说读写全科计时与断点恢复，恢复后继续计时。
3. 报告生成: 返回总分估计、分项趋势、错因分布与可导出文本。
4. 计划回写: 报告读取时自动回写下周计划并提供一次撤销能力。
5. 动态计划: 新训练数据触发 2 分钟内计划更新，包含可读原因并支持变更历史查询。
6. 试用限流: 免费额度按日重置，额度耗尽返回明确错误，已开始会话不受影响。
7. 订阅链路: 支持升级、取消、恢复与支付回调，订单状态可追踪。
8. 跨端一致: 权益按用户聚合并可携带设备标识读取同步状态。
9. 后台登录: 支持 Admin 登录、角色菜单下发与失败限流。
10. 后台校正: 支持订单筛选分页、权益人工校正、回滚一次与审计落库。
11. 优惠券购买: 支持券码校验、可配置折扣规则、退款按实付金额回退并保持订单账务一致。
12. 家庭双人计划: 支持成员邀请与管理；成员权益隔离；超员时返回明确冲突错误并阻止加人。

## 4. 测试结果
执行命令:
```bash
npm test
```
结果:
1. Server: 36/36 通过。
2. Client: 21/21 通过。
3. 总计: 57/57 通过。

## 5. 约束与后续
1. 当前支付链路使用 `mockpay` 仿真，S6 需接入真实支付签名验签与重放防护。
2. 当前后台账号为内存预置，S6 需迁移到持久化账号体系并接入更细粒度 RBAC。
