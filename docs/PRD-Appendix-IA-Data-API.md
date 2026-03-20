# PRD 附录 A: 信息架构、数据模型与接口规范

## 文档信息
- 文档版本: v1.0
- 关联文档: `docs/PRD-IELTS-AI-App.md`
- 创建日期: 2026-02-25

## 1. 信息架构（IA）
### 1.1 客户端一级导航
1. 首页（今日任务、目标进度、考试倒计时）
2. 练习（听力、口语、阅读、写作）
3. 模考（全真模考、阶段测评、历史成绩）
4. 复盘（错题本、能力雷达图、改进建议）
5. 我的（订阅、账户、设置、反馈）

### 1.1B 后台端一级导航（Admin Web）
1. 总览（核心指标、告警摘要）
2. 用户管理（检索、冻结/解冻、账号状态）
3. 订单与权益（订单查询、状态核对、权益校正）
4. 内容管理（题库上架/下架、版本发布）
5. 审计日志（高风险操作追踪）

### 1.2 二级页面定义
1. 首页
- 今日任务卡
- 周目标与完成率
- 学习建议快捷入口
2. 练习
- 听力题型选择页
- 口语对练会话页
- 阅读题组页
- 写作批改页
3. 模考
- 模考创建页
- 模考进行页
- 模考报告页
4. 复盘
- 错题重练队列
- 分项能力趋势
- Agent 计划调整页
5. 我的
- 订阅与权益页
- 学习数据导出/删除页
- 通知偏好设置页

### 1.3 核心流程映射
1. Onboarding 流程: 注册 -> 目标设定 -> 首次诊断 -> 生成计划。
2. 日常训练流程: 任务领取 -> 作答 -> 即时反馈 -> 重练。
3. 阶段复盘流程: 周测/模考 -> 报告 -> 计划更新。
4. 支付流程: 试用 -> 订阅 -> 续费/退订 -> 权益变更。
5. 后台运营流程: Admin 登录 -> 查询用户/订单 -> 执行操作 -> 记录审计。

## 2. 领域模型与数据实体
以下字段为实现默认最小集，新增字段必须向后兼容。

### 2.1 UserGoalProfile
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| user_id | string | 是 | 用户唯一 ID |
| target_overall_band | number | 是 | 目标总分 |
| target_exam_date | string(datetime) | 是 | 目标考试日期 |
| weekly_study_hours | number | 是 | 每周可学习时长 |
| weak_skills | string[] | 否 | 用户自评薄弱项 |
| created_at | string(datetime) | 是 | 创建时间 |
| updated_at | string(datetime) | 是 | 更新时间 |

### 2.2 SkillAssessment
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| assessment_id | string | 是 | 诊断 ID |
| user_id | string | 是 | 用户 ID |
| listening_band_est | number | 是 | 听力估计分 |
| speaking_band_est | number | 是 | 口语估计分 |
| reading_band_est | number | 是 | 阅读估计分 |
| writing_band_est | number | 是 | 写作估计分 |
| confidence | number | 是 | 置信度 0-1 |
| weak_points | string[] | 是 | 主要薄弱点 |
| generated_plan_id | string | 否 | 关联计划 ID |

### 2.3 StudyPlan
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| plan_id | string | 是 | 学习计划 ID |
| user_id | string | 是 | 用户 ID |
| horizon_weeks | number | 是 | 计划周期（默认 8） |
| weekly_goals | object[] | 是 | 每周目标包 |
| adaptive_rules | object[] | 是 | 自动调整规则 |
| status | string | 是 | active/paused/completed |
| updated_by | string | 是 | system/agent/user |

### 2.4 PracticeSession
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| session_id | string | 是 | 会话 ID |
| user_id | string | 是 | 用户 ID |
| skill | string | 是 | listening/speaking/reading/writing |
| task_type | string | 是 | 题型或任务类型 |
| raw_input | object | 是 | 用户作答原始数据 |
| score_breakdown | object | 否 | 分项评分 |
| feedback_items | object[] | 否 | 反馈列表 |
| next_actions | string[] | 否 | 后续建议 |
| created_at | string(datetime) | 是 | 创建时间 |

### 2.5 MockExamReport
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| report_id | string | 是 | 报告 ID |
| user_id | string | 是 | 用户 ID |
| exam_id | string | 是 | 模考 ID |
| overall_band_est | number | 是 | 总分估计 |
| skill_bands | object | 是 | 四科估计 |
| error_distribution | object | 是 | 错因分布 |
| action_plan | object[] | 是 | 下周期建议 |
| generated_at | string(datetime) | 是 | 生成时间 |

### 2.6 SubscriptionEntitlement
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| user_id | string | 是 | 用户 ID |
| tier | string | 是 | free/trial/pro |
| trial_expire_at | string(datetime) | 否 | 试用到期 |
| pro_expire_at | string(datetime) | 否 | 订阅到期 |
| ai_quota_daily | number | 是 | 每日 AI 限额 |
| mock_exam_quota_monthly | number | 是 | 每月模考限额 |
| updated_at | string(datetime) | 是 | 更新时间 |

### 2.7 AdminUser
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| admin_user_id | string | 是 | 后台用户 ID |
| email | string | 是 | 后台登录邮箱 |
| role_codes | string[] | 是 | 角色集合（ops/content/support/finance_ro） |
| status | string | 是 | active/disabled |
| last_login_at | string(datetime) | 否 | 最近登录时间 |
| created_at | string(datetime) | 是 | 创建时间 |
| updated_at | string(datetime) | 是 | 更新时间 |

### 2.8 AdminAuditLog
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| audit_id | string | 是 | 审计 ID |
| operator_id | string | 是 | 操作者 ID |
| action | string | 是 | 执行动作 |
| resource_type | string | 是 | 资源类型 |
| resource_id | string | 否 | 资源 ID |
| before_state | object | 否 | 变更前状态 |
| after_state | object | 否 | 变更后状态 |
| created_at | string(datetime) | 是 | 操作时间 |

## 3. API 规范（v1）
### 3.1 统一规范
1. 协议: HTTPS + JSON。
2. 鉴权: `Authorization: Bearer <token>`。
3. 时间格式: ISO 8601 UTC。
4. 幂等: 写操作支持 `Idempotency-Key`。
5. 错误码:
- `400` 参数错误
- `401` 未授权
- `403` 权限不足
- `404` 资源不存在
- `409` 冲突
- `429` 限流
- `500` 服务器错误
- `503` 依赖服务不可用

### 3.2 核心接口清单
#### 3.2.1 用户与目标
1. `POST /v1/users/onboarding`
- 作用: 提交目标设置并触发首次诊断。
- 请求体:
```json
{
  "target_overall_band": 6.5,
  "target_exam_date": "2026-08-10T00:00:00Z",
  "weekly_study_hours": 10,
  "weak_skills": ["speaking", "writing"]
}
```
- 响应体:
```json
{
  "assessment_id": "asm_123",
  "plan_id": "plan_123",
  "status": "processing"
}
```

2. `GET /v1/users/me/progress`
- 作用: 获取总学习进度和周目标达成率。

3. `GET /v1/users/me/export`
- 作用: 导出当前账户范围内的用户数据副本。
- 查询参数:
```json
{
  "format": "json"
}
```
- 说明:
  - 当前仅支持 `json`。
  - 响应为附件下载，文件名示例 `user-export-<user_id>-<timestamp>.json`。

4. `POST /v1/users/me/deletion-request`
- 作用: 发起注销申请。

5. `POST /v1/users/me/delete`
- 作用: 确认删除账号。
- 请求体:
```json
{
  "confirm_text": "DELETE"
}
```

#### 3.2.2 训练与反馈
1. `POST /v1/practice/sessions`
- 作用: 创建训练会话并返回反馈。
- 请求体:
```json
{
  "skill": "speaking",
  "task_type": "part2",
  "raw_input": {
    "transcript": "....",
    "audio_url": "https://..."
  }
}
```
- 响应体:
```json
{
  "session_id": "ps_123",
  "score_breakdown": {
    "fluency": 6.0,
    "lexical_resource": 5.5,
    "grammar": 5.5,
    "pronunciation": 6.0
  },
  "feedback_items": [
    {
      "type": "grammar",
      "evidence": "I goed to...",
      "suggestion": "Use past tense: I went to..."
    }
  ],
  "next_actions": ["redo_part2_same_topic", "shadowing_5min"]
}
```

2. `POST /v1/practice/sessions/{session_id}/retry`
- 作用: 基于同题进行再练并对比前后差异。

#### 3.2.3 模考与报告
1. `POST /v1/mock-exams`
- 作用: 创建模考实例。
2. `POST /v1/mock-exams/{exam_id}/submit`
- 作用: 提交模考并触发报告生成。
3. `GET /v1/mock-exams/{exam_id}/report`
- 作用: 获取模考复盘报告。

#### 3.2.4 订阅与权益
1. `GET /v1/subscription/entitlement`
- 作用: 查询当前权益。
2. `POST /v1/subscription/upgrade`
- 作用: 升级订阅。
3. `POST /v1/subscription/cancel`
- 作用: 取消续费。

#### 3.2.5 后台管理（Admin）
1. `POST /v1/admin/auth/login`
- 作用: 后台账号登录并返回管理端令牌。
2. `GET /v1/admin/users`
- 作用: 按条件查询用户列表与状态。
3. `POST /v1/admin/users/{user_id}/freeze`
- 作用: 冻结用户账号。
4. `POST /v1/admin/users/{user_id}/unfreeze`
- 作用: 解冻用户账号。
5. `GET /v1/admin/orders`
- 作用: 查询订单与订阅状态。
6. `POST /v1/admin/entitlements/{user_id}/adjust`
- 作用: 人工校正用户权益。
7. `POST /v1/admin/content/items/{item_id}/publish`
- 作用: 发布或上架题库内容版本。
8. `GET /v1/admin/audit-logs`
- 作用: 查询后台操作审计日志。

## 4. 实时会话接口
### 4.1 WebSocket: `/v1/realtime/speaking`
消息类型:
1. `session_start`
2. `partial_transcript`
3. `coach_question`
4. `score_update`
5. `session_end`

超时规则:
1. 心跳间隔 20 秒。
2. 60 秒无心跳自动断开并允许 5 分钟内恢复。

## 5. AI Provider 适配接口（公共能力）
以下接口为服务端内部公共接口，供业务层调用。

```ts
export interface LLMProviderAdapter {
  generateText(request: GenerateTextRequest): Promise<GenerateTextResponse>;
  generateSpeechFeedback(request: GenerateSpeechFeedbackRequest): Promise<SpeechFeedbackResponse>;
  scoreWriting(request: ScoreWritingRequest): Promise<WritingScoreResponse>;
  healthCheck(): Promise<ProviderHealth>;
}

export interface AgentOrchestrator {
  run(sessionContext: SessionContext, taskType: TaskType, payload: unknown): Promise<AgentOutput>;
}

export interface PolicyGuard {
  validate(input: unknown, output: unknown): Promise<GuardResult>;
}

export interface FallbackRouter {
  route(taskType: TaskType, providerHealth: ProviderHealth[], costPolicy: CostPolicy): Promise<string>;
}
```

## 6. 数据流定义
### 6.1 口语训练数据流
1. 客户端上传音频流和实时文本。
2. Orchestrator 调用 ASR 并生成语义片段。
3. Coach Agent 生成追问，Evaluator Agent 生成分项评分。
4. Guardrail Agent 过滤不合规输出。
5. 聚合结果返回客户端，并写入 `PracticeSession`。

### 6.2 写作批改数据流
1. 客户端提交作文文本。
2. Evaluator Agent 按 TR/CC/LR/GRA 评分。
3. Coach Agent 生成修改建议和高分表达替换。
4. 结果写入 `PracticeSession`，并更新 `StudyPlan` 的薄弱项权重。

### 6.3 后台操作数据流
1. Admin 端提交高风险操作（冻结/权益校正/内容发布）。
2. Admin Service 执行 RBAC 权限校验。
3. 领域服务执行业务变更并返回结果。
4. 写入 `AdminAuditLog` 与 `audit_logs`。
5. 将变更事件投递到分析与告警通道。

## 7. 可观测性与埋点事件
### 7.1 关键事件
1. `onboarding_completed`
2. `practice_started`
3. `practice_feedback_viewed`
4. `practice_retry_started`
5. `mock_exam_completed`
6. `plan_adjusted_by_agent`
7. `subscription_trial_started`
8. `subscription_upgraded`
9. `admin_action_performed`

### 7.2 关键字段
1. `user_id`（脱敏）
2. `platform`
3. `skill`
4. `task_type`
5. `latency_ms`
6. `provider_name`
7. `fallback_triggered`

## 8. 接口兼容与版本策略
1. API 主版本使用 `/v1` 前缀。
2. 非破坏性新增字段允许直接发布。
3. 破坏性改动需升级到 `/v2` 并保留 `/v1` 至少 6 个月。
4. Provider Adapter 变更需通过契约测试后合并。

## 9. 默认实现决策
1. 客户端统一 Flutter，后端通过 REST + WebSocket 提供能力。
2. 数据库采用关系型存储 + 对象存储音频文本附件。
3. AI Provider 默认配置主路由 + 备路由，故障自动切换。
4. 所有核心实体均要求 `created_at` 和 `updated_at` 字段。
5. 后台管理端采用 Web 应用，统一通过 `/v1/admin/*` 调用服务。
