# Technical Architecture（Self-Hosted）

## 文档信息
- 版本: v2.9
- 状态: Baseline + Mobile Core Coverage
- 适用分支: `self-hosted`

## 1. 总览
当前系统的可运行基线是一套自托管 Web 架构，并已经在同一套服务端之上落下 iOS 与 Android 原生移动客户端骨架：

1. 当前 Web 客户端: React 19 + React Router + Vite
2. 已选移动端方案: React Native + Expo
3. 服务端: Fastify 5 + `@fastify/websocket`
4. 语言: TypeScript
5. 存储: 各业务域可独立运行于 `memory` 或 `postgres`

这套架构只服务于 IELTS 备考核心业务，不再包含商业化后台和发布治理域。

## 2. 系统边界
### 2.1 In Scope
1. Web 学习端
2. iOS 与 Android 学习端
3. 认证和账户
4. 入门诊断与学习计划
5. 进度同步
6. 听力、阅读、口语、写作训练
7. 模考与报告
8. 分析事件、提醒、轻量实验
9. 账号导出与删除

### 2.2 Out Of Scope
1. 订阅、支付、会员、退款
2. Admin 后台与内容审核
3. 发布管理、稳定性演练、灰度控制
4. Provider runtime 管理和系统级控制台
5. 独立移动端专用后端、Pad/桌面专版、完全离线模式

## 3. 运行时拓扑
### 3.1 当前最小部署
1. 一个静态 Web 前端进程或静态资源宿主
2. 一个 Fastify API/WS 进程
3. 可选 Postgres

### 3.2 扩展后的多端部署
1. Web 前端静态资源通过反向代理或 CDN 暴露
2. iOS 与 Android 客户端通过 HTTPS/WSS 访问同一套 API/WS 服务
3. 服务端单进程承载 REST 与 WebSocket
4. 需要持久化时，为认证、学习、训练、口语、写作、模考、分析分别接入 Postgres

### 3.3 多端运行时配置
1. Web 端继续通过 `VITE_API_BASE_URL` 与 `VITE_WS_BASE_URL` 注入目标地址
2. 移动端必须支持构建时默认地址与运行时实例配置
3. 若客户端与 API/WS 不同源，服务端必须按客户端类型配置允许来源或访问策略

## 4. 客户端结构
### 4.1 当前 Web 路由
Web 前端以 React Router 管理页面访问，未登录用户只能进入：

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

### 4.2 规划中的移动端模块
移动端按业务域对齐 Web 能力，不追求复刻 Web 路由结构：

1. 认证: 登录、注册、会话恢复
2. 首页: 学习入口与当前计划摘要
3. 入门目标与诊断
4. 学习计划与进度
5. 听力训练
6. 阅读训练
7. 实时口语
8. 写作批改
9. 全科模考
10. 账户、导出、删除

当前已落地的移动端模块仍是分阶段推进，但已经覆盖首日链路、训练主链路、模考报告与账户域：

1. 实例配置
2. 安全会话存储
3. 注册与登录
4. 首页工作台
5. 入门目标
6. 首次诊断
7. 学习计划
8. 学习进度
9. 听力训练
10. 阅读训练
11. 实时口语
12. 写作批改
13. 模考与报告
14. 账户中心
15. 提醒偏好
16. 数据导出与删除账号
17. API/WS smoke

### 4.3 共享代码抽取策略
移动端建设优先抽取可复用的 TypeScript 契约与领域逻辑，而不是强行复用 Web UI：

1. 通过 `packages/shared-client` 复用 `apps/client/src/lib/api-client.ts`、`api-types.ts` 与 `validators.ts`
2. 优先共享 API 客户端、类型和校验逻辑，而不是共享 Web 页面
3. 从 `apps/client/src/lib/session-manager.ts` 抽取会话刷新逻辑
4. `apps/client/src/lib/token-storage.ts` 需要改造成可注入存储适配器，Web 继续使用浏览器存储，移动端改用安全存储
5. `apps/client/src/lib/runtime-config.ts` 的 URL 解析逻辑可以迁移为多端共享模块

### 4.4 移动端架构基线
1. 新增独立应用目录 `apps/mobile`
2. 采用 React Native + Expo 构建 iOS 与 Android 原生应用
3. 采用 Expo Router 组织页面与深链接
4. 使用安全存储保存 token 与实例配置
5. 使用原生 WebSocket 接入实时口语链路
6. 第一阶段不尝试用 React Native Web 替代现有 Web 客户端

## 5. 服务端结构
### 5.1 入口
服务端入口是 `apps/server/src/index.ts`，负责：

1. 解析 `AUTH_SECRET`
2. 解析 `BROWSER_ALLOWED_ORIGINS`
3. 解析各域存储后端与连接串
4. 调用 `buildServer()`
5. 监听 `PORT`

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

这些路由继续作为 Web 与移动端的统一契约入口，不新增移动端专用 BFF。

## 6. 存储架构
### 6.1 设计原则
1. 每个业务域可以独立选择 `memory` 或 `postgres`
2. Postgres 仓储以 `payload_json` 快照方式持久化领域对象
3. 系统默认优先保证自托管易部署，而不是复杂的中心化关系模型
4. 移动端本地缓存只承担体验优化与状态恢复作用，不承担跨端事实源职责

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
1. 客户端提交 `/v1/users/onboarding`
2. 服务端生成目标、诊断任务和计划草稿
3. 用户通过 questions/answers/pause/resume/complete 完成诊断
4. 学习计划被持久化到 learner-state 仓储

### 7.2 训练与重练
1. 客户端创建 `/v1/practice/sessions`
2. 用户提交答案到 `/submit`
3. 错题写入 `/retry-queue`
4. 用户从 `/retry-queue/:queue_item_id/start` 发起重练

### 7.3 口语会话
1. 客户端先创建 `/v1/realtime/speaking/sessions`
2. 再通过 `/v1/realtime/speaking` 建立 WebSocket
3. 服务端维护会话轮次、恢复窗口和摘要
4. 用户可查看发音反馈、事件流和重答对比

### 7.4 写作批改
1. 客户端调用 `/v1/writing/evaluations`
2. 服务端生成分项评分和建议
3. 用户可通过模板插入和 rewrite 做二次提升

### 7.5 模考与计划回写
1. 客户端创建 `/v1/mock-exams`
2. 中途通过 `/progress` 保存
3. 异常后通过 `/recover` 恢复
4. `/submit` 生成报告
5. `/report` 将结果回写到学习计划
6. `/report/writeback/undo` 撤销一次回写

### 7.6 分析与提醒
1. 客户端通过 `/v1/analytics/events/batch` 上报事件
2. 服务端基于事件生成 summary 和提醒推荐
3. `/v1/reminders/*` 提供偏好、推荐、点击追踪、设备登记、dispatch preview 与真实 dispatch attempt 记录
4. self-hosted server 在未注入自定义 sender 时，默认通过 APNs token auth 与 FCM HTTP v1 直接发送移动端提醒
5. APNs 运行时配置使用 `REMINDER_PUSH_APNS_ENABLED`、`REMINDER_PUSH_APNS_BUNDLE_ID`、`REMINDER_PUSH_APNS_TEAM_ID`、`REMINDER_PUSH_APNS_KEY_ID`、`REMINDER_PUSH_APNS_PRIVATE_KEY(_FILE)`
6. FCM 运行时配置使用 `REMINDER_PUSH_FCM_ENABLED`、`REMINDER_PUSH_FCM_PROJECT_ID`、`REMINDER_PUSH_FCM_CLIENT_EMAIL`、`REMINDER_PUSH_FCM_PRIVATE_KEY(_FILE)`，或 `REMINDER_PUSH_FCM_SERVICE_ACCOUNT_JSON(_FILE)`
7. dispatch 会在单次请求内对 `NETWORK_ERROR`、`RATE_LIMITED`、`PROVIDER_UNAVAILABLE` 做有界重试，并在 attempt 中记录 `retryCount`
8. dispatch failure code 归一化为 `SENDER_UNAVAILABLE`、`NETWORK_ERROR`、`AUTH_ERROR`、`INVALID_REQUEST`、`DEVICE_UNREGISTERED`、`RATE_LIMITED`、`PROVIDER_UNAVAILABLE`、`PROVIDER_ERROR`
9. `/v1/reminders/devices` 当前会返回每台设备最近一次 `last_delivery_attempt`，供 mobile account 页面直接展示最新投递状态与失败原因
10. 若 provider 返回 `DEVICE_UNREGISTERED`，dispatch 会自动移除 stale device，并在本次 dispatch 结果中返回 `device_removed / removed_device_count`

### 7.7 移动端状态恢复
1. 应用启动时读取安全存储中的实例配置与会话信息
2. 若 access token 已失效，客户端通过 `/v1/auth/refresh` 尝试续期
3. 训练、诊断、口语、模考等中断后优先从服务端恢复状态，再结合本地缓存恢复 UI

## 8. 可用性与错误模型
1. `/health` 用于健康检查
2. 各 Postgres 仓储在 `flush()` 失败时返回对应 `503`
3. 资源不存在返回 `404`
4. 状态冲突返回 `409`
5. 移动端必须对 `401`、`409`、`503` 提供明确提示与恢复路径

## 9. 安全基线
1. 服务端启动必须提供 `AUTH_SECRET` 或 `AUTH_SECRET_FILE`
2. 业务接口默认通过 Bearer Token 鉴权
3. 浏览器跨 origin 访问必须显式配置 `BROWSER_ALLOWED_ORIGINS`
4. 移动端 token 与实例配置必须保存在安全存储中
5. 麦克风、通知等设备权限按需申请，不默认常驻开启
6. 内部调试接口默认关闭，只用于本地或受控环境
7. 推送私钥建议通过 `*_FILE` 挂载，不直接写入进程环境日志或镜像层

## 10. 当前架构刻意不做的事
1. 不维护中心化 Admin 网关
2. 不维护支付回调或会员权益链路
3. 不维护发布门禁、灰度和运行时治理服务
4. 不维护多 provider 健康探针和供应商冻结配置
5. 不为移动端额外维护一套业务接口或独立数据模型

## 11. 阶段说明
1. 截至 2026-03-28，仓库中实际存在的应用为 `apps/client`、`apps/server` 与 `apps/mobile`
2. `apps/mobile` 当前覆盖实例配置、安全会话存储、注册/登录、首页、入门目标、首次诊断、学习计划、学习进度、听力训练、阅读训练、实时口语、写作批改、模考与报告、账户中心、提醒偏好、数据导出、删除账号，以及 API/WS smoke 和 route-level vitest smoke；当前 Web 主链路与账户主链路都已建立移动端入口
3. `packages/shared-client` 已作为跨端共享基础层接入
4. 移动端技术决策与后续落地路径见 `docs/architecture/Mobile-Technology-Selection.md`
