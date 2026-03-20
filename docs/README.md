# 文档索引（Self-Hosted）

## 1. 当前有效文档
以下文档与 `self-hosted` 分支当前代码保持一致，应作为部署、开发和维护的主事实源。

1. 产品范围: `docs/PRD-IELTS-AI-App.md`
2. 页面、数据模型与接口清单: `docs/PRD-Appendix-IA-Data-API.md`
3. 技术架构: `docs/architecture/Technical-Architecture.md`
4. 数据存储与 Postgres 表结构: `docs/engineering/Database-Schema-Draft.md`
5. 自托管部署指南: `docs/engineering/Self-Hosted-Deployment-Guide.md`

## 2. 当前代码范围
`self-hosted` 分支只保留 IELTS 备考核心能力：

1. 注册、登录、会话刷新与退出
2. 入门目标、诊断、学习计划与进度同步
3. 听力、阅读练习与错题重练
4. 实时口语对练
5. 写作批改、模板插入、改写复评与档案
6. 全科模考、报告导出与计划回写
7. 学习行为分析、提醒与轻量实验能力
8. 账号导出与删除

以下能力已从代码中移除，不应再作为当前产品能力理解：

1. 支付、订阅、会员与退款
2. Admin 后台、审核、报表与内容运营
3. Beta 白名单、稳定性演练、发布门禁、混沌演练
4. Provider health、支付 runtime、system RBAC、release storage

## 3. 历史资料说明
仓库内仍保留部分历史材料，主要用于追踪和复盘，不代表 `self-hosted` 当前能力边界：

1. `docs/tracking/`
2. `docs/backlog/`
3. `docs/engineering/S1-Implementation-Report.md` 到 `S8-Implementation-Report.md`

如果历史材料与当前代码冲突，以“当前有效文档”和代码实现为准。

## 4. 推荐阅读顺序
1. 先读 `docs/PRD-IELTS-AI-App.md`
2. 再读 `docs/PRD-Appendix-IA-Data-API.md`
3. 然后读 `docs/architecture/Technical-Architecture.md`
4. 部署前读 `docs/engineering/Self-Hosted-Deployment-Guide.md`
5. 如需落 Postgres，再读 `docs/engineering/Database-Schema-Draft.md`
