# Codebase Completion Audit

- 日期: 2026-04-10
- 适用分支: `self-hosted`
- 审计性质: 当前代码快照评估，不替代 PRD / IA / QA 文档作为需求事实源

## 1. 审计范围
本次审计覆盖以下目录与事实源:

1. `docs/PRD-IELTS-AI-App.md`
2. `docs/PRD-Appendix-IA-Data-API.md`
3. `docs/PRD-Appendix-QA-Acceptance.md`
4. `docs/PRD-Appendix-Mobile-Client.md`
5. `apps/server`
6. `apps/client`
7. `apps/mobile`
8. `packages/shared-client`

本次审计已执行:

1. `npm run typecheck`
2. `npm test`

本次审计未实际执行:

1. Playwright Web E2E
2. Maestro iOS / Android device smoke
3. Postgres 真实环境集成 smoke

## 2. 评分口径

- `95%-100%`: 主链路、接口、页面、自动化证据基本闭环，仅剩非阻断细节
- `85%-94%`: 核心能力已落地，但仍存在体验、原生能力或工程收敛缺口
- `70%-84%`: 业务语义已接通，但前端消费、恢复语义或验证证据不完整
- `<70%`: 仍停留在部分实现、后端单边完成或工程占位状态

## 3. 总体结论

### 3.1 Learner 主链路完成度
若只按当前 self-hosted learner 范围评估，代码库完成度约为 `90%-92%`。

原因:

1. 认证、入门目标、诊断、计划、进度、听力、阅读、口语、写作、模考、账户主链路均已实现
2. Web 与 Mobile 两端都已有入口，且大部分能力存在服务端测试和前端 route/page smoke
3. `npm run typecheck` 与 `npm test` 当前可通过

### 3.2 含工程收敛与专项能力的整体完成度
若把以下项纳入“需求完成度”一起评估，整体更接近 `83%-86%`:

1. 分析事件与 A/B 实验的前端真实消费
2. Mobile 真正的原生音频输入 / 播放深度
3. `packages/shared-client` 的独立工程化收敛
4. Postgres 与设备级 smoke 的实际执行留痕

## 4. 逐项审计

### 4.1 认证与会话
- 完成度: `95%`
- 结论: 已完成
- 服务端证据:
  1. `AuthService` 覆盖 register / login / refresh / logout / revoke / roles
  2. 路由已完整暴露 `/v1/auth/*`
- 客户端证据:
  1. Web 已接 `register` / `login`
  2. Mobile 已接实例配置、SecureStore、安全会话恢复和前后台 refresh
- 测试证据:
  1. `apps/server/tests/auth.register-login.test.ts`
  2. `apps/server/tests/auth.session.test.ts`
  3. `apps/mobile/tests/app-session.test.tsx`
- 主要缺口:
  1. 无明显功能缺口
  2. 更偏剩余的是部署 / 真机验证而非实现缺失

### 4.2 首页 / 学习主线收口
- 完成度: `90%`
- 结论: 已完成核心语义
- 证据:
  1. Web 首页会根据 active plan 推导下一步动作
  2. Mobile 有 `study-loop`、`today actions`、`resume checkpoints`
  3. Mobile 首页能统一收口最近训练结果、恢复入口和计划 / 进度 follow-up
- 测试证据:
  1. `apps/client/tests/home-page.test.tsx`
  2. `apps/mobile/tests/routes.smoke.test.tsx`
- 主要缺口:
  1. 当前主线引导主要依赖本地推导规则，尚未看到更强的服务端编排层

### 4.3 入门目标 / 首次诊断
- 完成度: `95%`
- 结论: 已完成
- 证据:
  1. 服务端已有 goal profile、assessment enqueue、pause / resume / complete
  2. Web 页已覆盖目标录入、状态拉取、诊断答题
  3. Mobile 页已覆盖目标录入、诊断首题预览、断点恢复、本地中间态保存
- 测试证据:
  1. `apps/server/tests/onboarding.test.ts`
  2. `apps/server/tests/diagnostic.plan.test.ts`
  3. `apps/client/tests/onboarding-page.test.tsx`
  4. `apps/client/tests/s2-diagnostic-plan-pages.test.tsx`
  5. `apps/mobile/tests/routes.smoke.test.tsx`
- 主要缺口:
  1. 无明显功能缺口

### 4.4 学习计划
- 完成度: `95%`
- 结论: 已完成
- 证据:
  1. 服务端支持 active plan、task adjust、adaptive adjustment、history
  2. Web 与 Mobile 均支持查看下一任务、调整任务分钟数、查看历史
  3. Mobile 已与 study-loop 联动，训练完成后能驱动 plan refresh
- 测试证据:
  1. `apps/server/tests/s5-plan-adaptive.test.ts`
  2. `apps/client/tests/s2-diagnostic-plan-pages.test.tsx`
  3. `apps/mobile/tests/routes.smoke.test.tsx`
- 主要缺口:
  1. 无明显功能缺口

### 4.5 学习进度 / 同步 / 冲突
- 完成度: `93%`
- 结论: 已完成
- 证据:
  1. 服务端有 snapshot、stale request、conflict history
  2. Web 与 Mobile 均支持同步结果解释、冲突列表与下一步动作
  3. Mobile 端可基于 recent activity 自动刷新进度
- 测试证据:
  1. `apps/server/tests/progress.sync.test.ts`
  2. `apps/client/tests/s2-progress-account-pages.test.tsx`
  3. `apps/mobile/tests/routes.smoke.test.tsx`
- 主要缺口:
  1. 冲突处理已能看见与回流，但仍偏“解释型 UI”，缺少更强的冲突修复工具

### 4.6 听力训练
- 完成度: `85%`
- 结论: 业务语义完成，原生媒体深度偏弱
- 证据:
  1. 服务端支持 session、submit、playback state、retry queue、dictation mode
  2. Web 已支持核心题型 / 听写、播放状态、重练队列
  3. Mobile 已支持本地 snapshot 恢复、前后台重拉、提交后写入 study-loop
- 测试证据:
  1. `apps/server/tests/s3-practice.listening-reading.test.ts`
  2. `apps/server/tests/s7-listening-dictation.test.ts`
  3. `apps/client/tests/s3-practice-speaking-pages.test.tsx`
  4. `apps/mobile/tests/routes.smoke.test.tsx`
- 主要缺口:
  1. Mobile 当前是“播放状态语义 + 恢复状态”闭环，不是完整原生播放器闭环
  2. 未看到真实音频资源控制、耳机切换与系统播放打断的具体实现

### 4.7 阅读训练
- 完成度: `90%`
- 结论: 已完成
- 证据:
  1. 服务端支持 training / exam、timer pause / resume / recover
  2. Web 已支持模式切换、计时状态和证据定位
  3. Mobile 已支持本地中间态、恢复和前后台刷新
- 测试证据:
  1. `apps/server/tests/s3-practice.listening-reading.test.ts`
  2. `apps/client/tests/s4-reading-speaking-writing-pages.test.tsx`
  3. `apps/mobile/tests/routes.smoke.test.tsx`
- 主要缺口:
  1. 无明显功能缺口

### 4.8 实时口语
- 完成度: `82%-85%`
- 结论: 业务语义完成，原生录音深度不足
- 证据:
  1. 服务端支持 speaking session、WebSocket、part switch、retry、comparison、pronunciation feedback、task tracking
  2. Mobile 已实现麦克风权限校验、前后台断开与恢复重连、实时事件消费
  3. Mobile 已实现会话 checkpoint 和恢复重连意图
- 测试证据:
  1. `apps/server/tests/s3-speaking-realtime.test.ts`
  2. `apps/server/tests/s4-speaking-advanced.test.ts`
  3. `apps/client/tests/s4-reading-speaking-writing-pages.test.tsx`
  4. `apps/mobile/tests/routes.smoke.test.tsx`
- 主要缺口:
  1. 当前 Mobile 主要通过“手动输入 transcript 再发送”驱动实时会话
  2. 未形成真正的原生录音、音频采集或语音流上传闭环
  3. 因此它更接近“实时口语协议层 + 状态恢复已完成”，而不是“原生 speaking UX fully done”

### 4.9 写作批改
- 完成度: `95%`
- 结论: 已完成
- 证据:
  1. 服务端支持评分、建议、证据句、rewrite compare、archives、templates、adoption
  2. Web 与 Mobile 都支持批改、模板插入、改写复评、档案查看
  3. Mobile 已实现草稿本地保存与恢复
- 测试证据:
  1. `apps/server/tests/s4-reading-writing.test.ts`
  2. `apps/server/tests/s7-writing-templates.test.ts`
  3. `apps/client/tests/s4-reading-speaking-writing-pages.test.tsx`
  4. `apps/mobile/tests/routes.smoke.test.tsx`
- 主要缺口:
  1. 长文本输入已具备，但编辑器能力仍偏基础

### 4.10 模考 / 报告 / 回写撤销
- 完成度: `95%`
- 结论: 已完成
- 证据:
  1. 服务端支持 create / save progress / recover / submit / report / export / undo writeback
  2. Web 与 Mobile 都支持完整模考链路
  3. Mobile 已接系统分享导出
- 测试证据:
  1. `apps/server/tests/s5-writing-mock-subscription.test.ts`
  2. `apps/client/tests/s5-mock-exam-page.test.tsx`
  3. `apps/mobile/tests/routes.smoke.test.tsx`
  4. `apps/mobile/e2e/maestro/*mock-exam-smoke.yaml`
- 主要缺口:
  1. 真机设备级导出能力本次未实际验证

### 4.11 账户 / 导出 / 删除
- 完成度: `92%`
- 结论: 已完成
- 证据:
  1. 服务端支持 profile、export、deletion request、delete
  2. Web 与 Mobile 均有删除申请与删除执行入口
  3. Mobile 删除与登出时会清理本地会话和远程 reminder device
- 测试证据:
  1. `apps/server/tests/account.deletion.test.ts`
  2. `apps/server/tests/s34-user-data-export.test.ts`
  3. `apps/client/tests/s2-progress-account-pages.test.tsx`
  4. `apps/mobile/tests/routes.smoke.test.tsx`
  5. `apps/mobile/e2e/maestro/*account-smoke.yaml`
- 主要缺口:
  1. 无明显功能缺口

### 4.12 提醒偏好 / 本地提醒 / 远端设备注册
- 完成度: `92%`
- 结论: 已完成
- 证据:
  1. 服务端支持 reminder preference、recommendation、click、device register/remove、dispatch
  2. Mobile 已实现通知权限申请、本地通知调度、debug open、远程设备同步
  3. AppSession 会在 restore / foreground / logout / instance switch 时同步或清理设备注册
- 测试证据:
  1. `apps/server/tests/s7-reminders.test.ts`
  2. `apps/mobile/tests/app-session.test.tsx`
  3. `apps/mobile/tests/reminder-notification-bridge.test.tsx`
  4. `apps/mobile/tests/routes.smoke.test.tsx`
  5. `apps/mobile/e2e/maestro/*reminder-notification-smoke.yaml`
- 主要缺口:
  1. APNs / FCM provider runtime 的真实外部环境联调本次未执行

### 4.13 未成年人保护 / 监护支持
- 完成度: `90%`
- 结论: 已完成且相对完整
- 证据:
  1. 服务端支持 age band、guardian notice、support requests、internal ops processing
  2. Web 有内部监护人工单处理台
  3. Mobile 有注册期监护确认、登录后 notice 同步、学习时长提醒和强制休息
- 测试证据:
  1. `apps/server/tests/account.minor-guardian.test.ts`
  2. `apps/client/tests/admin-minor-guardian-support-page.test.tsx`
  3. `apps/mobile/tests/minor-guardian.test.tsx`
  4. `apps/mobile/tests/study-duration-reminder.test.tsx`
  5. `apps/mobile/tests/routes.smoke.test.tsx`
- 主要缺口:
  1. 该域功能完整度高，剩余主要是运营流程和实际真机验证

### 4.14 学习行为分析 / A/B 实验
- 完成度: `60%-70%`
- 结论: 服务端完成，产品接入不足
- 证据:
  1. 服务端已有 analytics ingest、summary、experiments、assignment 全套路由
  2. 客户端 API SDK 已声明 analytics / experiments 调用
- 测试证据:
  1. `apps/server/tests/s31-analytics-postgres.integration.test.ts`
  2. `apps/server/tests/s7-reminders.test.ts`
  3. `apps/server/tests/s34-user-data-export.test.ts`
- 主要缺口:
  1. 未发现 Web / Mobile 业务页面实际调用 `analyticsBatch`
  2. 未发现前端使用 experiment assignment 影响交互
  3. 当前更像“后端能力准备好了”，而不是“业务需求已真正消费”

### 4.15 Shared Client 工程收敛
- 完成度: `65%`
- 结论: 方向已建立，工程独立性不足
- 证据:
  1. Mobile 通过 `@ielts/shared-client` 复用 api-client、types、validators
  2. 但 `packages/shared-client` 当前只是 re-export Web 侧实现
- 主要缺口:
  1. shared-client 未真正独立维护实现
  2. package 自身 test / typecheck 仍是空实现
  3. 后续若 Web / Mobile 差异扩大，当前结构会带来边界模糊问题

### 4.16 自托管 / 内存模式 / Postgres
- 完成度: `85%-90%`
- 结论: 已完成实现，验证深度有待继续
- 证据:
  1. server 已支持 memory / postgres 分域仓储
  2. 分域 migration script 齐全
  3. health、internal debug routes、scheduler status 均已具备
- 测试证据:
  1. server 当前单测全过
  2. Postgres integration tests 已存在，但本次执行中有条件跳过
- 主要缺口:
  1. 本次未实际完成 Postgres 真实环境 smoke
  2. 因而更适合定义为“实现 ready”，不是“当前会话内已完全验收”

## 5. 自动化验证结论

本次已执行并通过:

1. `npm run typecheck`
2. `npm test`

统计结果:

1. `apps/server`: 27 个 test files 通过，1 个跳过；88 个测试通过，10 个跳过
2. `apps/client`: 14 个 test files 通过；63 个测试通过
3. `apps/mobile`: 5 个 test files 通过；117 个测试通过

说明:

1. 当前分支基础门禁稳定
2. 自动化证据对 learner 主链路覆盖较强
3. 设备级 smoke 与 Postgres 实测仍应视为下一轮验证动作，而不是本次已完成事实

## 6. 当前最主要缺口

### P1
1. Mobile 口语未形成真正原生录音 / 流式语音输入闭环
2. Mobile 听力未形成真正播放器能力闭环，当前更偏播放状态语义验证
3. Analytics / A/B 以前端产品接入视角看仍未完成

### P2
1. `packages/shared-client` 仍偏别名层，不是独立共享层
2. 冲突处理与计划 / 进度解释能力已存在，但仍以引导型 UI 为主
3. 真机 / Postgres / device smoke 的执行留痕仍需补强

## 7. 建议优先级

### 下一步优先做
1. 补上 Mobile speaking 的原生录音 / 采集链路，使实时口语从“文本驱动”进入“音频驱动”
2. 补上 Mobile listening 的真实播放器与音频中断处理
3. 选择 3-5 个关键用户动作，在 Web / Mobile 真实接入 `analyticsBatch`
4. 把 `packages/shared-client` 从 re-export 收敛成真正共享实现

### 验收前必须补
1. 实跑 `smoke:postgres:e2e-local`
2. 实跑 iOS / Android Maestro smoke
3. 对导出、删除、提醒、实例切换保留一轮执行留痕

## 8. 最终判断

当前代码库可以被定义为:

1. `Web learner + Mobile learner core coverage + self-hosted server` 已经成型
2. learner 主链路可以认为已完成
3. 若按“PRD 所有文字都要达到强实现闭环”来衡量，仍有少量但明确的补洞项

建议当前口径:

1. 对外可表述为“核心 learner 产品已完成并可演示 / 可持续迭代”
2. 对内不建议表述为“100% fully complete”
3. 更准确的说法是“主链路已完成，专项原生能力、分析接入和共享层收敛仍有后续工作”
