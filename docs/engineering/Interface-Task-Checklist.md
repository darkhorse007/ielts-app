# Interface Task Checklist（API / WebSocket）

## 1. 目标
将 `P0 Story` 拆解为可执行的接口任务清单，供后端、客户端、QA 直接对齐实施与验收。

## 2. 约束基线
1. 协议: HTTPS + JSON；实时口语使用 WebSocket。
2. 鉴权: `Authorization: Bearer <token>`。
3. 写接口均支持 `Idempotency-Key`。
4. 时间字段统一 ISO 8601 UTC。
5. 错误码统一: `400/401/403/404/409/429/500/503`。

## 3. 任务总览（按 Sprint）
| Task ID | 接口 | 关联 Story | Sprint | 优先级 |
|---|---|---|---|---|
| API-001 | `POST /v1/auth/register` `POST /v1/auth/login` | US-1101 | S1 | P0 |
| API-002 | `POST /v1/auth/refresh` `POST /v1/auth/logout` | US-1102 | S1 | P0 |
| API-003 | `POST /v1/users/onboarding` | US-2101, US-2102 | S1-S2 | P0 |
| API-004 | `GET /v1/users/me/progress` | US-2103, US-1103 | S2 | P0 |
| API-005 | `POST /v1/practice/sessions` | US-3101, US-3201, US-4103, US-5101, US-6101 | S3-S4 | P0 |
| API-006 | `POST /v1/practice/sessions/{session_id}/retry` | US-4104, US-6103 | S4-S5 | P0 |
| API-007 | `WS /v1/realtime/speaking` | US-4101, US-4102, US-4201, US-4202 | S3-S4 | P0 |
| API-008 | `POST /v1/mock-exams` | US-7101 | S5 | P0 |
| API-009 | `POST /v1/mock-exams/{exam_id}/submit` | US-7101, US-7102 | S5 | P0 |
| API-010 | `GET /v1/mock-exams/{exam_id}/report` | US-7102, US-7103 | S5 | P0 |
| API-011 | `GET /v1/subscription/entitlement` | US-8101, US-8103 | S5 | P0 |
| API-012 | `POST /v1/subscription/upgrade` | US-8102 | S5 | P0 |
| API-013 | `POST /v1/subscription/cancel` | US-8102 | S5 | P0 |
| API-014 | `POST /v1/payments/webhooks/provider` | US-8102, US-8103 | S5 | P0 |
| API-015 | `POST /v1/analytics/events/batch` | US-9101 | S6 | P0 |
| API-016 | `GET /v1/system/health/providers` | US-9102, US-10102 | S6 | P0 |
| API-017 | `POST /v1/admin/auth/login` | US-11101 | S5 | P0 |
| API-018 | `GET /v1/admin/users` `POST /v1/admin/users/{user_id}/freeze` `POST /v1/admin/users/{user_id}/unfreeze` | US-11102 | S6 | P0 |
| API-019 | `GET /v1/admin/orders` `POST /v1/admin/entitlements/{user_id}/adjust` | US-11103 | S5 | P0 |
| API-020 | `POST /v1/admin/content/items/{item_id}/publish` | US-11104 | S6 | P0 |
| API-021 | `GET /v1/admin/audit-logs` | US-11101, US-11103, US-11104 | S6 | P0 |
| API-022 | `GET /v1/users/plans/{plan_id}/adjustments` | US-2104 | S5 | P0 |
| API-023 | `GET /v1/writing/templates` `POST /v1/writing/templates/{template_id}/insert` `GET /v1/writing/templates/adoption` | US-6201 | S4-S7 | P1 |
| API-024 | `PUT /v1/admin/coupons/{coupon_code}` `GET /v1/admin/coupons` `POST /v1/subscription/upgrade`(coupon_code) | US-8201 | S5-S7 | P1 |
| API-025 | `POST /v1/subscription/family/invitations` `POST /v1/subscription/family/invitations/{invitation_id}/accept` `GET /v1/subscription/family/members` `DELETE /v1/subscription/family/members/{member_user_id}` | US-8202 | S5-S7 | P1 |
| API-026 | `PUT /v1/analytics/experiments/{experiment_key}` `GET /v1/analytics/experiments/{experiment_key}/assignment` `GET /v1/analytics/experiments` `POST /v1/analytics/experiments/{experiment_key}/stop` | US-9201 | S6-S8 | P1 |
| API-027 | `GET /v1/reminders/preferences` `PUT /v1/reminders/preferences` `GET /v1/reminders/recommendation` `POST /v1/reminders/{reminder_id}/click` | US-9202 | S6-S8 | P1 |
| API-028 | `GET /v1/analytics/churn/risks` `POST /v1/analytics/churn/strategies/trigger` `GET /v1/analytics/churn/effect` | US-9203 | S6-S8 | P1 |
| API-029 | `POST /v1/admin/reviews` `GET /v1/admin/reviews` `POST /v1/admin/reviews/{review_id}/approve` `POST /v1/admin/reviews/{review_id}/reject` `POST /v1/admin/content/import/batches` `POST /v1/admin/content/import/batches/{batch_id}/rollback` `POST /v1/admin/content/items/{item_id}/review` `POST /v1/admin/reports/export` `GET /v1/admin/reports/exports/{export_id}/download` | US-11201, US-11202, US-11203 | S7-S9 | P1 |
| API-030 | `PUT /v1/system/beta/whitelist/{user_id}` `GET /v1/system/beta/whitelist` `POST /v1/system/beta/feedback` `GET /v1/system/beta/feedback` `POST /v1/system/beta/feedback/{feedback_id}/escalate` | US-10201 | S8-S10 | P1 |
| API-031 | `POST /v1/system/stability/soak-tests/start` `POST /v1/system/stability/soak-tests/{run_id}/checkpoints` `GET /v1/system/stability/soak-tests/{run_id}/report` `GET /v1/system/stability/reports/compare` `GET /v1/system/stability/reports/export` `GET /v1/system/stability/alerts` `POST /v1/system/stability/alerts/{alert_id}/handle` | US-10202 | S8-S10 | P1 |
| API-032 | `GET /v1/system/users/{user_id}/roles` `PUT /v1/system/users/{user_id}/roles` | US-10202 | S8-S10 | P1 |
| API-033 | `GET /v1/system/users/roles/audit` | US-10202 | S8-S10 | P1 |

## 4. 任务详细清单
### API-001 注册与登录
1. 输出:
- 支持邮箱/手机号注册与登录。
- 返回访问令牌与刷新令牌。
2. 实施检查:
- 请求 DTO 与字段校验。
- 密码或验证码策略接入。
- 失败次数限流与设备指纹记录。
- 审计日志写入。
3. 验收:
- 正常登录成功。
- 错误凭据返回 `401`。
- 连续失败触发限流 `429`。

### API-002 会话刷新与退出
1. 输出:
- 刷新令牌换发新访问令牌。
- 注销当前会话并废弃令牌。
2. 实施检查:
- 刷新令牌轮换与黑名单机制。
- 会话失效策略与 TTL。
- 异地登录风控事件记录。
3. 验收:
- 过期令牌返回 `401`。
- 注销后旧令牌不可再用。

### API-003 入门目标与诊断触发
1. 输出:
- 保存 `target_overall_band/target_exam_date/weekly_study_hours/weak_skills`。
- 异步触发首次诊断任务并返回 `assessment_id/plan_id/status`。
2. 实施检查:
- 参数合法范围校验（分数、日期、时长）。
- 任务队列投递与重试。
- 幂等键防重复提交。
3. 验收:
- 首次提交返回 `processing`。
- 重复请求不产生重复计划。

### API-004 学习进度查询
1. 输出:
- 返回周目标达成率、四科进度、连续学习天数。
2. 实施检查:
- 聚合查询性能优化（索引 + 缓存）。
- 空数据默认值处理。
3. 验收:
- 冷用户和活跃用户都可正常返回。
- P95 响应 <= 1.5 秒。

### API-005 训练会话创建与反馈返回
1. 输出:
- 创建 `PracticeSession` 并返回 `score_breakdown/feedback_items/next_actions`。
- 听力 `task_type=dictation` 时返回 `dictation_summary` 和 `dictation_feedback`。
2. 实施检查:
- 按 `skill/task_type` 路由到相应评估链路。
- AI 调用超时和回退逻辑。
- 会话入库与反馈结构标准化。
3. 验收:
- 写作与口语路径均可返回结构化反馈。
- 模型失败时回退成功并可追踪。
- 听写训练支持句级输入、拼写对比和词块高频错误统计。

### API-006 同题再练
1. 输出:
- 绑定原会话生成 retry 会话并返回前后对比摘要。
2. 实施检查:
- 原会话存在性与权限校验。
- 差异计算（分项分、关键错因）。
3. 验收:
- 非本人会话访问返回 `403`。
- 差异结果字段完整。

### API-007 口语实时 WebSocket
1. 输出:
- 支持 `session_start/partial_transcript/coach_question/score_update/session_end`。
- `score_update` 支持发音热力图字段（词/音素问题、回放片段、任务建议）。
- 支持角色扮演会话（至少 5 类场景）与场景化动态追问。
2. 实施检查:
- 心跳 20 秒；60 秒超时断开。
- 5 分钟内重连恢复上下文。
- 语音转写失败重试与降级。
3. 验收:
- 弱网下会话可恢复。
- 首条反馈在 3 秒内下发。
- 发音反馈包含单词与音素级问题标注，并可关联后续纠音任务。
- 角色扮演场景下追问内容会根据回答内容和轮次动态调整。

### API-008 模考创建
1. 输出:
- 创建模考实例与四科任务编排。
2. 实施检查:
- 模考模板版本管理。
- 会话时钟与断点数据初始化。
3. 验收:
- 创建后可直接进入作答。

### API-009 模考提交
1. 输出:
- 接收模考答案并触发报告生成任务。
2. 实施检查:
- 大 payload 校验与分片上传支持。
- 去重提交与状态机（submitted/processing/done）。
3. 验收:
- 重复提交不生成重复报告。

### API-010 模考报告查询
1. 输出:
- 返回总分估计、分项趋势、错因分布、行动建议。
2. 实施检查:
- 结果缓存与一致性控制。
- 报告不存在时友好状态返回。
3. 验收:
- 报告生成完成后 2 分钟内可查询。

### API-011 权益查询
1. 输出:
- 返回 `tier`、配额、到期时间和当前剩余额度。
2. 实施检查:
- 配额计算含时区边界。
- 缓存 + 回源一致性策略。
3. 验收:
- 免费/试用/订阅状态准确。

### API-012 订阅升级
1. 输出:
- 创建订单并返回支付跳转参数。
2. 实施检查:
- 防重复支付。
- 订单状态机（created/paid/failed/refunded）。
3. 验收:
- 支付成功后权益 1 分钟内生效。

### API-013 取消续费
1. 输出:
- 更新自动续费标记，保留当前周期权益。
2. 实施检查:
- 与支付 Provider 订阅状态对齐。
- 操作审计日志。
3. 验收:
- 取消后下周期不再自动扣费。

### API-014 支付回调
1. 输出:
- 接收支付平台 webhook 并落地权益事件。
2. 实施检查:
- 签名验签。
- webhook 幂等与重放防护。
3. 验收:
- 重复回调不重复发放权益。

### API-015 埋点批量上报
1. 输出:
- 接收客户端事件批量入库/消息队列。
2. 实施检查:
- 单批大小和字段校验。
- PII 脱敏。
3. 验收:
- 核心事件覆盖率 >= 95%。

### API-016 Provider 健康检查
1. 输出:
- 返回各模型 Provider 的可用性、延迟、错误率、回退建议。
2. 实施检查:
- 统一探针周期任务。
- 历史趋势存储。
3. 验收:
- 回退触发前可实时读取健康状态。

### API-017 后台登录
1. 输出:
- 后台账号登录并返回管理端令牌与角色信息。
2. 实施检查:
- Admin 账号状态校验（active/disabled）。
- 登录失败限流与审计写入。
3. 验收:
- 未授权账号无法登录并返回 `403`。

### API-018 后台用户管理
1. 输出:
- 用户检索与冻结/解冻操作。
2. 实施检查:
- RBAC 权限校验。
- 冻结状态同步策略与缓存失效。
3. 验收:
- 冻结/解冻 1 分钟内生效且有审计记录。

### API-019 后台订单与权益校正
1. 输出:
- 订单检索和权益人工调整。
2. 实施检查:
- 高风险操作二次确认参数。
- 调整动作回滚标识与审计日志。
3. 验收:
- 校正后权益状态一致且可回滚一次。

### API-020 后台内容发布
1. 输出:
- 内容上架/下架与版本发布。
2. 实施检查:
- 发布前状态校验。
- 发布失败补偿和回滚机制。
3. 验收:
- 发布记录包含版本号、操作人和时间。

### API-021 后台审计日志查询
1. 输出:
- 按时间、操作人、资源类型查询审计日志。
2. 实施检查:
- 日志脱敏与分页性能优化。
- 高风险操作字段完整性校验。
3. 验收:
- 能追溯冻结、权益校正、内容发布全链路记录。

### API-022 计划调整历史查询
1. 输出:
- 按计划、来源类型、科目查询计划调整历史，并返回调整原因。
2. 实施检查:
- 历史记录包含变更前后目标时长与触发来源。
- 支持分页查询，满足计划页展示需求。
3. 验收:
- 训练数据触发自动调整后，可在 2 分钟内查询到原因与变更记录。

### API-023 写作模板库与采纳率
1. 输出:
- 提供模板列表、模板插入（保留原文）与采纳率查询。
2. 实施检查:
- 模板插入后返回 merged essay，必须包含原文全文。
- 采纳率按用户维度聚合，返回模板使用次数与占比。
3. 验收:
- 至少提供 5 个模板（含 Task1/Task2）。
- 插入模板不覆盖用户原文，且可在页面查看采纳率。

### API-024 优惠券订阅与退款账务一致性
1. 输出:
- 管理端支持优惠券规则配置与查询。
- 用户升级接口支持 `coupon_code` 校验并返回折扣后账务字段。
- 支付退款回调返回订单 `应付/已付/已退` 金额，保证退款不超实付。
2. 实施检查:
- 优惠券规则支持生效状态、折扣类型（百分比/固定额）、适用计划、有效期。
- 升级下单时对无效券码返回明确错误（`INVALID_COUPON`）。
- 退款事件重复到达时保持账务幂等。
3. 验收:
- 有效券码折扣计算正确，订单实付金额准确。
- 无效券码下单被拒绝且不创建有效订单。
- 退款后 `refunded_amount_cny` 不大于 `paid_amount_cny`。

### API-025 家庭双人计划邀请与成员管理
1. 输出:
- 支持家庭计划成员邀请、受邀接受、成员查询和成员移除。
- 家庭计划容量为双人（owner + 1 member），超员时返回明确冲突错误。
2. 实施检查:
- 邀请与接受均需鉴权，禁止跨账号接受邀请。
- 成员权益独立（按用户记录每日用量），但订阅来源关联到同一家庭组。
- 成员不可直接取消/恢复主订阅，只允许 owner 管理。
3. 验收:
- owner 可邀请 1 名成员并完成加入。
- 超过座位上限时返回 `FAMILY_CAPACITY_EXCEEDED`。
- 移除成员后其权益降级为免费，owner 可再次邀请新成员。

### API-026 A/B 实验配置与转化看板
1. 输出:
- 支持实验配置（流量比例、变体权重、转化事件、停止条件）。
- 支持按用户返回稳定分流结果（同一用户同一实验固定分组）。
- 支持实验看板输出样本量、分组转化率、lift 与停止建议。
2. 实施检查:
- 分流算法使用确定性哈希，避免跨端漂移。
- 事件上报时自动采集实验曝光/转化指标并归因到分组。
- 停止建议需基于 `min_sample_size / target_lift_percent / max_duration_days` 可配置阈值。
3. 验收:
- 实验配置后可读取分流结果并回传曝光/转化事件。
- 看板可看到分组指标和 `should_stop` 结论。
- 手动停止后实验状态变为 `stopped` 且分流接口不再分配新实验。

### API-027 个性化学习提醒
1. 输出:
- 支持提醒订阅偏好查询与更新（含退订）。
- 基于用户学习行为活跃时段返回提醒建议与下次提醒时间。
- 提醒点击后可记录追踪并返回任务页 deep-link。
2. 实施检查:
- 活跃时段推断基于 `analytics events` 时间分布，优先学习核心事件。
- 退订后推荐接口返回 `subscribed=false`，不再下发 reminder_id。
- 点击接口按用户鉴权，禁止跨账号读取他人提醒。
3. 验收:
- 活跃时段明显集中时，推荐提醒时间与该时段一致。
- 用户退订后，提醒建议不再下发。
- 点击提醒可回传 `deep_link`，并可直达学习任务页。

### API-028 流失风险识别与挽回效果
1. 输出:
- 支持按用户输出流失风险评分、风险等级与关键因子。
- 支持对目标用户触发挽回策略（提醒/冲刺任务/优惠券）。
- 支持查看策略触发后的召回效果（触发数、转化数、召回率）。
2. 实施检查:
- 风险评分综合最近活跃天数、7 日学习事件量、提醒交互情况与计划活跃状态。
- 策略触发记录必须可追溯（触发时间、策略类型、目标用户、窗口期）。
- 召回效果统计以窗口期内核心学习事件回流作为转化判定。
3. 验收:
- 可筛选出高风险用户并返回可解释因子。
- 运营可对目标用户触发挽回策略并获得触发记录。
- 可在效果接口中观察到策略召回率变化。

### API-029 后台治理增强（双人复核/导入审核/报表导出）
1. 输出:
- 支持高风险操作双人复核流程（提交 审批 驳回 执行回写）。
- 支持题库批量导入 审核发布 回滚导入批次。
- 支持后台操作与业务报表导出 脱敏下载 下载审计追踪。
2. 实施检查:
- 双人复核禁止申请人自审 并按 RBAC 校验执行人权限。
- 批量导入必须支持失败条目记录 原子回滚与发布冲突拦截。
- 报表导出必须支持时间窗口与角色过滤 并记录导出/下载审计事件。
3. 验收:
- 冻结账号 权益校正 内容发布均可走双人审批链路且可查询审计记录。
- 导入流程支持“导入-审核-发布-回滚”全链路且失败可追溯。
- 导出报表字段完成脱敏 下载行为可按导出ID和操作人追溯。

### API-030 Beta 渠道与反馈回流
1. 输出:
- 支持 Beta 白名单维护（按用户与版本）。
- 支持 Beta 用户反馈提交并自动关联版本。
- 支持关键反馈一键升级优先级（high/critical）。
2. 实施检查:
- 白名单支持启用/禁用状态及操作者追溯字段。
- 反馈提交需校验用户已在有效白名单中 并自动写入 release_id。
- 升级优先级动作需保留原优先级 新优先级 升级原因和升级人。
3. 验收:
- 运营可维护 Beta 白名单并按 release 查询。
- Beta 用户反馈可自动关联到白名单版本。
- 关键反馈可一键升级且可通过反馈列表和审计日志追溯。

### API-033 系统角色变更审计查询
1. 输出:
- 支持按目标用户、操作人和分页维度查询 `system_user_roles_updated` 审计记录。
- 返回 `audit_id/operator_user_id/target_user_id/roles/created_at` 字段，支持前端审计看板渲染。
2. 实施检查:
- 接口挂载在系统域并复用 `user_roles:manage` 权限校验，禁止非管理员读取角色审计。
- 查询参数需要校验 UUID 合法性，分页默认值与上限受控（`page_size<=100`）。
3. 验收:
- 角色更新后可在审计接口查询到对应记录。
- 非管理员访问返回 `403`。
- 错误查询参数返回 `400` 且错误码一致。

## 5. 通用工程任务（所有接口共用）
1. OpenAPI 文档自动生成并发布。
2. 契约测试（Contract Test）覆盖所有 P0 接口。
3. 每个接口至少包含:
- 成功路径测试
- 参数异常测试
- 权限测试
- 限流测试
4. 日志字段规范:
- `trace_id`, `user_id(masked)`, `endpoint`, `status_code`, `latency_ms`, `provider_name`, `fallback_triggered`。

## 6. 联调与门禁
1. 客户端联调门禁:
- 所有 P0 接口稳定返回，错误码语义一致。
2. QA 门禁:
- API 回归通过率 100%（P0）。
3. 发布门禁:
- 新增接口必须包含监控与告警规则。
4. 后台门禁:
- Admin 接口越权测试通过率 100%。
