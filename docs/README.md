# 文档索引（Self-Hosted）

## 1. 当前有效文档
以下文档是 `self-hosted` 分支当前工作的主事实源。其中标记为“下一阶段”的条目定义移动端完整能力边界；当前仓库已包含移动端骨架、首日学习链路、听力/阅读训练、实时口语、写作批改、模考与报告，以及账户中心接入，移动端核心用户域已基本对齐当前 Web 应用。

1. 产品范围与阶段边界: `docs/PRD-IELTS-AI-App.md`
2. 页面、数据模型与接口清单（当前已实现 Web/API）: `docs/PRD-Appendix-IA-Data-API.md`
3. QA 与发布验收口径: `docs/PRD-Appendix-QA-Acceptance.md`
4. Mobile 客户端需求附录（下一阶段）: `docs/PRD-Appendix-Mobile-Client.md`
5. 技术架构（含当前实现与移动端规划）: `docs/architecture/Technical-Architecture.md`
6. Mobile 技术选型（下一阶段）: `docs/architecture/Mobile-Technology-Selection.md`
7. Self-Hosted learner 交付路线图: `docs/engineering/Self-Hosted-Learner-Delivery-Roadmap.md`
8. 自托管部署指南: `docs/engineering/Self-Hosted-Deployment-Guide.md`
9. Mobile 交付 runbook: `docs/engineering/Mobile-Delivery-Runbook.md`
10. 数据存储与 Postgres 表结构: `docs/engineering/Database-Schema-Draft.md`
11. 当前代码完成度审计: `docs/engineering/Codebase-Completion-Audit-2026-04-10.md`
12. self-hosted 补洞 backlog: `docs/backlog/Self-Hosted-Completion-Followups-2026-04-10.md`
13. self-hosted gap-closure 执行计划: `docs/engineering/Self-Hosted-Gap-Closure-Execution-Plan-2026-04-10.md`
14. 口语 AI 技术演进路线: `docs/engineering/Speaking-AI-Technology-Evolution-Roadmap.md`

## 2. 当前代码范围
`self-hosted` 分支当前代码实现包含 Web 客户端、Fastify 服务端，以及一个初始的 `apps/mobile` React Native + Expo 骨架。当前可运行代码只保留 IELTS 备考核心能力：

1. 注册、登录、会话刷新与退出
2. 入门目标、诊断、学习计划与进度同步
3. 听力、阅读练习与错题重练
4. 实时口语对练
5. 写作批改、模板插入、改写复评与档案
6. 全科模考、报告导出与计划回写
7. 学习行为分析、提醒与轻量实验能力
8. 账号导出与删除
9. Mobile 当前已落地：实例配置、安全会话存储、注册/登录、首页工作台、入门目标、首次诊断、学习计划、学习进度、听力训练、阅读训练、实时口语、写作批改、模考与报告、账户中心、提醒偏好、未成年人监护留痕、未成年人专门学习时长控制、数据导出、删除账号、API/WS smoke、route-level vitest smoke，以及 iOS simulator / Android emulator-device Maestro smoke baseline 和 CI workflow
10. 共享基础层：`packages/shared-client` 复用 Web 侧 API 契约与校验逻辑

以下能力已从代码中移除，不应再作为当前产品能力理解：

1. 支付、订阅、会员与退款
2. Admin 后台、审核、报表与内容运营
3. Beta 白名单、稳定性演练、发布门禁、混沌演练
4. Provider health、支付 runtime、system RBAC、release storage

## 3. 历史资料说明
仓库内仍保留部分历史材料，主要用于追踪和复盘，不代表 `self-hosted` 当前能力边界：

1. `docs/tracking/`
2. `docs/backlog/`（但 `docs/backlog/Self-Hosted-Completion-Followups-2026-04-10.md` 为当前审计补充）
3. `docs/engineering/S1-Implementation-Report.md` 到 `S8-Implementation-Report.md`

如果历史材料与当前代码冲突，以“当前有效文档”和代码实现为准。

## 4. 推荐阅读顺序
1. 先读 `docs/PRD-IELTS-AI-App.md`
2. 再读 `docs/PRD-Appendix-QA-Acceptance.md`
3. 如需做移动端范围定义，再读 `docs/PRD-Appendix-Mobile-Client.md`
4. 再读 `docs/PRD-Appendix-IA-Data-API.md`
5. 然后读 `docs/architecture/Technical-Architecture.md`
6. 如需推进移动端建设，再读 `docs/architecture/Mobile-Technology-Selection.md`
7. 如需了解剩余落地路径，读 `docs/engineering/Self-Hosted-Learner-Delivery-Roadmap.md`
8. 如需理解当前代码快照的逐项完成度，读 `docs/engineering/Codebase-Completion-Audit-2026-04-10.md`
9. 如需查看剩余补洞项，读 `docs/backlog/Self-Hosted-Completion-Followups-2026-04-10.md`
10. 如需直接进入执行拆解，读 `docs/engineering/Self-Hosted-Gap-Closure-Execution-Plan-2026-04-10.md`
11. 部署前读 `docs/engineering/Self-Hosted-Deployment-Guide.md`
12. 如需执行移动端完整本地质量门禁，可运行 `npm run smoke:quality-gate:mobile-local`
13. 如需执行移动端本地 iOS smoke，可运行 `npm run smoke:e2e:mobile-ios-local`
14. 如需执行移动端本地 Android smoke，可运行 `npm run smoke:e2e:mobile-android-local`
15. 如需生成移动端原生构建或设备验收，读 `docs/engineering/Mobile-Delivery-Runbook.md`
16. 如需给安装包预置默认 self-hosted 实例，可在构建前创建 `apps/mobile/.env.local`，填写 `EXPO_PUBLIC_API_BASE_URL`；`EXPO_PUBLIC_WS_BASE_URL` 可省略并由脚本自动推导
17. 如需落 Postgres，再读 `docs/engineering/Database-Schema-Draft.md`
