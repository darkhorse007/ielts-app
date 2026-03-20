# Technical Architecture（Self-Hosted）

## 文档信息
- 版本: v2.0
- 状态: Baseline
- 适用分支: `self-hosted`

## 1. 总览
当前系统是一套自托管 Web 架构：

1. 前端: React 19 + React Router + Vite
2. 服务端: Fastify 5 + `@fastify/websocket`
3. 语言: TypeScript
4. 存储: 各业务域可独立运行于 `memory` 或 `postgres`

这套架构只服务于 IELTS 备考核心业务，不再包含商业化后台和发布治理域。

## 2. 系统边界
### 2.1 In Scope
1. 认证和账户
2. 入门诊断与学习计划
3. 进度同步
4. 听力、阅读、口语、写作训练
5. 模考与报告
6. 分析事件、提醒、轻量实验
7. 账号导出与删除

### 2.2 Out Of Scope
1. 订阅、支付、会员、退款
2. Admin 后台与内容审核
3. 发布管理、稳定性演练、灰度控制
4. Provider runtime 管理和系统级控制台

## 3. 运行时拓扑
### 3.1 最小部署
1. 一个静态前端进程或静态资源宿主
2. 一个 Fastify API/WS 进程
3. 可选 Postgres

### 3.2 推荐部署
1. 前端静态资源通过反向代理或 CDN 暴露
2. 服务端单进程承载 REST 与 WebSocket
3. 需要持久化时，为认证、学习、训练、口语、写作、模考、分析分别接入 Postgres

## 4. 前端结构
### 4.1 路由层
前端以 React Router 管理页面访问，未登录用户只能进入：

1. `/login`
2. `/register`

登录后可访问核心学习页：

1. `/home`
2. `/onboarding`
3. `/diagnostic`
4. `/plan`
5. `/progress`
6. `/account`
7. `/practice/listening`
8. `/practice/reading`
9. `/speaking-live`
10. `/writing`
11. `/mock-exam`

### 4.2 运行时配置
前端通过以下环境变量决定 API/WS 地址：

1. `VITE_API_BASE_URL`
2. `VITE_WS_BASE_URL`

若未显式设置，前端默认相对当前页面 origin 推导 WebSocket 地址。

## 5. 服务端结构
### 5.1 入口
服务端入口是 `apps/server/src/index.ts`，负责：

1. 解析 `AUTH_SECRET`
2. 解析各域存储后端与连接串
3. 调用 `buildServer()`
4. 监听 `PORT`

### 5.2 应用装配
`apps/server/src/app.ts` 负责装配：

1. `AuthService`
2. `OnboardingService`
3. `ProgressService`
4. `AccountService`
5. `PracticeService`
6. `SpeakingRealtimeService`
7. `WritingService`
8. `MockExamService`
9. `AnalyticsService`
10. `ReminderService`

### 5.3 路由模块
当前路由模块包括：

1. `auth.ts`
2. `account.ts`
3. `onboarding.ts`
4. `progress.ts`
5. `practice.ts`
6. `realtime-speaking.ts`
7. `writing.ts`
8. `mock-exam.ts`
9. `analytics.ts`
10. `reminder.ts`

## 6. 存储架构
### 6.1 设计原则
1. 每个业务域可以独立选择 `memory` 或 `postgres`
2. Postgres 仓储以 `payload_json` 快照方式持久化领域对象
3. 系统默认优先保证自托管易部署，而不是复杂的中心化关系模型

### 6.2 当前仓储域
1. 认证与账户: `auth-account`
2. 学习状态: `learner-state`
3. 训练状态: `practice-state`
4. 口语状态: `speaking-state`
5. 写作状态: `writing-state`
6. 模考状态: `mock-state`
7. 分析事件: `analytics`

### 6.3 存储后端环境变量
每个域都遵循同一模式：

1. `*_STORAGE_BACKEND=memory|postgres`
2. `*_STORAGE_CONNECTION_STRING`
3. `*_STORAGE_SCHEMA`

## 7. 关键请求流
### 7.1 入门诊断
1. 前端提交 `/v1/users/onboarding`
2. 服务端生成目标、诊断任务和计划草稿
3. 用户通过 questions/answers/pause/resume/complete 完成诊断
4. 学习计划被持久化到 learner-state 仓储

### 7.2 训练与重练
1. 前端创建 `/v1/practice/sessions`
2. 用户提交答案到 `/submit`
3. 错题写入 `/retry-queue`
4. 用户从 `/retry-queue/:queue_item_id/start` 发起重练

### 7.3 口语会话
1. 前端先创建 `/v1/realtime/speaking/sessions`
2. 再通过 `/v1/realtime/speaking` 建立 WebSocket
3. 服务端维护会话轮次、恢复窗口和摘要
4. 用户可查看发音反馈、事件流和重答对比

### 7.4 写作批改
1. 前端调用 `/v1/writing/evaluations`
2. 服务端生成分项评分和建议
3. 用户可通过模板插入和 rewrite 做二次提升

### 7.5 模考与计划回写
1. 前端创建 `/v1/mock-exams`
2. 中途通过 `/progress` 保存
3. 异常后通过 `/recover` 恢复
4. `/submit` 生成报告
5. `/report` 将结果回写到学习计划
6. `/report/writeback/undo` 撤销一次回写

### 7.6 分析与提醒
1. 客户端通过 `/v1/analytics/events/batch` 上报事件
2. 服务端基于事件生成 summary 和提醒推荐
3. `/v1/reminders/*` 提供偏好、推荐和点击追踪

## 8. 可用性与错误模型
1. `/health` 用于健康检查
2. 各 Postgres 仓储在 `flush()` 失败时返回对应 `503`
3. 资源不存在返回 `404`
4. 状态冲突返回 `409`

## 9. 安全基线
1. 服务端启动必须提供 `AUTH_SECRET` 或 `AUTH_SECRET_FILE`
2. 业务接口默认通过 Bearer Token 鉴权
3. 内部调试接口只用于本地或受控环境

## 10. 当前架构刻意不做的事
1. 不维护中心化 Admin 网关
2. 不维护支付回调或会员权益链路
3. 不维护发布门禁、灰度和运行时治理服务
4. 不维护多 provider 健康探针和供应商冻结配置
