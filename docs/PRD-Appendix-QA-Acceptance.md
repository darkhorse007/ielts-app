# PRD 附录 C: Self-Hosted QA 与发布验收

## 文档信息
- 文档版本: v2.0
- 适用分支: `self-hosted`
- 对齐文档: `docs/PRD-IELTS-AI-App.md`, `docs/PRD-Appendix-Mobile-Client.md`, `docs/architecture/Mobile-Technology-Selection.md`
- 说明: 本文只覆盖当前 `self-hosted` learner 产品的测试与验收，不再包含支付、订阅、Admin、运营后台或桌面原生客户端范围。

## 1. 验收目标
1. 验证 Web、iOS、Android 是否都能完成 learner 主链路。
2. 验证自托管部署后的 API/WS、状态恢复、跨端同步是否稳定。
3. 验证数据导出、删除账号、提醒偏好等账户能力可执行。
4. 验证移动端的实例配置、原生构建与设备级 smoke 已具备落地条件。

## 2. 当前验收范围
### 2.1 In Scope
1. Web learner 主链路: 注册、登录、入门目标、诊断、计划、进度、听力、阅读、口语、写作、模考、账户。
2. Mobile learner 主链路: 实例配置、安全会话存储、首页工作台、入门目标、诊断、计划、进度、听力、阅读、口语、写作、模考、账户。
3. Web 与 Mobile 共享的 API / WebSocket 契约。
4. 账号导出、删除账号、提醒偏好、实例切换、断点恢复、冲突回流。
5. 自托管部署所需的最小运行模式与可选 Postgres 模式。

### 2.2 Out Of Scope
1. 支付、订阅、会员、退款与订单链路。
2. Admin、审核、报表、内容运营后台。
3. 桌面原生客户端、Pad 专项版本、手表/TV 端。
4. 发布治理、灰度控制台、稳定性演练、混沌演练历史项。

## 3. 环境矩阵
1. Web: Chrome 最新版，必要时补一轮 Safari 最新版手工回归。
2. iOS: 最近 2 个主版本中的至少 1 个 simulator 和 1 台真机验收。
3. Android: 最近 3 个主版本中的至少 1 个 emulator 和 1 台真机验收。
4. 网络条件: 局域网、外网 HTTPS/WSS、弱网重试场景。
5. 服务端模式:
   - 最小模式: memory storage
   - 持久化模式: Postgres for auth/account + learner/content state

## 4. 必过自动化门禁
### 4.1 仓库级
```bash
npm run typecheck
npm test
```

### 4.2 Web learner
```bash
npm run smoke:e2e:api-local
```

### 4.3 Mobile learner
```bash
npm run test:mobile
npm run smoke:quality-gate:mobile-local
```

### 4.4 持久化部署
当目标环境启用 Postgres 时，追加：

```bash
npm run smoke:postgres:e2e-local
npm run smoke:learner-restart:e2e-local
```

## 5. 核心验收场景
### 5.1 首日入门闭环
1. 注册并登录。
2. 完成入门目标录入。
3. 完成首次诊断并生成计划。
4. 进入计划页查看当前下一任务。

通过标准:
1. Web 可完整通过。
2. iOS 与 Android 都可完整通过。
3. 诊断完成后的下一步引导明确，不出现“成功态被覆盖为失败”。

### 5.2 日常学习主线闭环
1. 首页能给出当前下一步学习动作。
2. 听力或阅读提交后，计划/进度侧能正确给出 follow-up。
3. 进度同步后，用户能回到训练页或计划页继续推进。

通过标准:
1. Web 与 Mobile 的下一步引导语义一致。
2. 不因本地缓存写失败把服务端成功操作误判为失败。
3. 首页、计划页、进度页之间的跳转与文案一致。

### 5.3 训练恢复与重试
1. 诊断、听力、阅读、口语、写作、模考在本地中断后都有恢复入口。
2. 关键请求失败后支持重试上次失败操作。
3. 重试必须针对原始失败目标，而不是退化成当前状态的其他动作。

通过标准:
1. 移动端首页能发现最近恢复项。
2. retry 不改变原目标语义，例如口语切 Part 重试仍指向原目标 Part。
3. 服务端快照仍为最终事实源，本地恢复只做体验补偿。

### 5.4 跨端同步与冲突
1. Web 完成训练后，Mobile 进入进度页可看到待消化结果。
2. Mobile 提交同步后，冲突摘要和下一步动作明确。
3. stale request 或 conflict 场景不会把用户引向错误页面。

通过标准:
1. 计划、进度、模考与账户状态在 Web / Mobile 之间保持一致。
2. 冲突摘要至少包含字段、值、时间与建议动作。
3. “回计划页”类文案的按钮必须真的回到计划页。

### 5.5 口语 / 写作 / 模考专项
1. 实时口语可创建会话、切 Part、结束、重答、查看对比与发音反馈。
2. 写作可批改、插模板、改写复评、查看档案。
3. 模考可创建、保存、恢复、提交、加载报告、导出报告、撤销计划回写。

通过标准:
1. 移动端 route smoke 全量通过。
2. 设备级 smoke 至少覆盖首页主线、账户链路、模考链路。
3. 报告导出、账号导出、删除账号有明确结果反馈。

### 5.6 自托管实例与构建交付
1. 移动端可使用运行时实例配置接入目标 self-hosted server。
2. 如使用构建时预置实例，安装包启动后能直接命中目标 API / WS。
3. iOS / Android preview build 可用于 QA 或内测安装。

通过标准:
1. 真机环境不依赖 `localhost` 或 `127.0.0.1` 回环地址。
2. preview 包默认使用 HTTPS/WSS 或部署方明确接受受控内网地址。
3. 本地与 CI 的 iOS/Android smoke 均已跑通。

## 6. 缺陷分级与发布口径
### 6.1 缺陷分级
1. `P0`: 阻断 learner 主链路、导致数据错误或错误删除/错误同步。
2. `P1`: 关键能力受损但存在替代路径，例如恢复入口失效、导出失败、构建不可安装。
3. `P2`: 文案、布局、边缘提示或非阻断体验问题。

### 6.2 发布口径
1. `P0` 必须为 0。
2. 与 learner 主链路直接相关的 `P1` 必须为 0。
3. 自动化门禁必须全部通过。
4. iOS 与 Android 至少各完成 1 轮设备级 smoke。
5. 若目标环境启用 Postgres，持久化 smoke 必须通过。

## 7. 人工签署清单
1. 产品/需求: learner 范围与当前 PRD 一致。
2. 研发: Web、Mobile、API/WS 契约与恢复语义一致。
3. QA/交付: 自动化命令与设备级 smoke 已留痕。
4. 部署方: self-hosted 地址、密钥、证书、构建目标环境已准备完成。

## 8. 明确不再验收的历史项
1. 支付与订阅权益准确性。
2. Admin 权限隔离与后台审计。
3. 桌面端兼容矩阵。
4. 发布治理、稳定性 drill、beta 白名单历史门禁。
