# PRD 附录 A: IA、数据模型与 API 清单

## 文档信息
- 版本: v2.0
- 适用分支: `self-hosted`
- 说明: 本附录只描述当前代码中仍然存在的页面、数据模型和接口

## 1. 页面信息架构
### 1.1 页面路由
| 路由 | 页面 | 说明 |
|---|---|---|
| `/register` | 注册页 | 新用户创建账号 |
| `/login` | 登录页 | 用户登录 |
| `/home` | 首页 | 核心入口页 |
| `/onboarding` | 入门目标页 | 目标与备考约束录入 |
| `/diagnostic` | 诊断页 | 入门诊断问答 |
| `/plan` | 学习计划页 | 当前计划与调整历史 |
| `/progress` | 学习进度页 | 当前进度与同步结果 |
| `/account` | 账户页 | 资料、导出与删除 |
| `/practice/listening` | 听力训练页 | 听力练习与播放恢复 |
| `/practice/reading` | 阅读训练页 | 阅读训练与计时模式 |
| `/speaking-live` | 口语对练页 | 实时口语会话 |
| `/writing` | 写作页 | 写作批改、模板、改写复评 |
| `/mock-exam` | 模考页 | 创建模考、恢复、报告 |

### 1.2 已下线路由
以下旧页面入口已不再提供独立能力，当前统一跳转回 `/home`：

1. `/subscription`
2. `/observability`
3. `/system-roles`
4. `/stability`
5. `/admin`

## 2. 核心用户流程
1. 注册/登录 -> 目标设置 -> 诊断 -> 生成计划
2. 首页 -> 进入训练 -> 提交 -> 进入重练
3. 进入口语实时会话 -> 查看摘要/反馈 -> 发起重答
4. 进入写作批改 -> 模板插入 -> 改写复评 -> 查看档案
5. 创建模考 -> 保存进度 -> 恢复 -> 提交 -> 导出报告
6. 查看账户 -> 导出数据 -> 申请/确认删除

## 3. 当前数据模型
### 3.1 UserProfile
| 字段 | 说明 |
|---|---|
| `id` | 用户 ID |
| `email` / `phone` | 登录标识 |
| `status` | `active` / `pending_deletion` / `deleted` |
| `deletion_requested_at` | 删除申请时间 |
| `deleted_at` | 删除完成时间 |

### 3.2 AssessmentJob
| 字段 | 说明 |
|---|---|
| `assessment_id` | 诊断任务 ID |
| `plan_id` | 关联计划 ID |
| `status` | `processing` / `paused` / `completed` / `failed` |
| `answered_count` | 已答题数 |
| `total_questions` | 总题数 |
| `elapsed_seconds` | 已用时 |

### 3.3 StudyPlan
| 字段 | 说明 |
|---|---|
| `plan_id` | 计划 ID |
| `user_id` | 用户 ID |
| `status` | 计划状态 |
| `weeks` | 周维度计划内容 |
| `adjustments` | 调整历史 |

### 3.4 ProgressSnapshot
| 字段 | 说明 |
|---|---|
| `listening_completed` | 听力完成数 |
| `speaking_completed` | 口语完成数 |
| `reading_completed` | 阅读完成数 |
| `writing_completed` | 写作完成数 |
| `total_study_minutes` | 总学习时长 |
| `streak_days` | 连续学习天数 |
| `server_version` | 服务端版本号 |

### 3.5 PracticeSession
| 字段 | 说明 |
|---|---|
| `session_id` | 训练会话 ID |
| `skill` | `listening` / `reading` |
| `task_type` | 题型 |
| `training_mode` | `training` / `exam` |
| `submission` | 提交结果 |
| `playback_state` | 听力播放恢复状态 |
| `timer` | 阅读计时状态 |

### 3.6 SpeakingSession
| 字段 | 说明 |
|---|---|
| `session_id` | 会话 ID |
| `task_type` | `standard` / `role_play` |
| `scenario_type` | 场景类型 |
| `current_part` | 当前 part |
| `resume_token` | 恢复令牌 |
| `turns` | 会话轮次 |

### 3.7 WritingEvaluation
| 字段 | 说明 |
|---|---|
| `evaluation_id` | 写作评分 ID |
| `task_type` | `task_1` / `task_2` |
| `scores` | 分项评分 |
| `suggestions` | 修改建议 |
| `evidence` | 证据句 |

### 3.8 MockExam
| 字段 | 说明 |
|---|---|
| `exam_id` | 模考 ID |
| `status` | 当前状态 |
| `sections` | 四科进度 |
| `report` | 模考报告 |

### 3.9 AnalyticsEvent
| 字段 | 说明 |
|---|---|
| `event_id` | 事件 ID |
| `platform` | 平台 |
| `event_type` | 事件类型 |
| `skill` | 可选技能维度 |
| `trace_id` | 跟踪 ID |

### 3.10 ReminderPreference
| 字段 | 说明 |
|---|---|
| `subscribed` | 是否订阅提醒 |
| `active_hour_utc` | 推荐触达时间 |
| `updated_at` | 更新时间 |

## 4. API 清单
### 4.1 Auth
1. `POST /v1/auth/register`
2. `POST /v1/auth/login`
3. `POST /v1/auth/refresh`
4. `POST /v1/auth/logout`

### 4.2 Account
1. `GET /v1/users/me/profile`
2. `GET /v1/users/me/export`
3. `POST /v1/users/me/deletion-request`
4. `POST /v1/users/me/delete`

### 4.3 Onboarding And Plan
1. `POST /v1/users/onboarding`
2. `GET /v1/users/onboarding/:assessment_id/status`
3. `GET /v1/users/onboarding/:assessment_id/questions`
4. `POST /v1/users/onboarding/:assessment_id/answers`
5. `POST /v1/users/onboarding/:assessment_id/pause`
6. `POST /v1/users/onboarding/:assessment_id/resume`
7. `POST /v1/users/onboarding/:assessment_id/complete`
8. `GET /v1/users/plans/active`
9. `PATCH /v1/users/plans/:plan_id/tasks/:task_id`
10. `GET /v1/users/plans/:plan_id/adjustments`

### 4.4 Progress
1. `GET /v1/users/me/progress`
2. `POST /v1/users/me/progress/sync`
3. `GET /v1/users/me/progress/conflicts`

### 4.5 Practice
1. `POST /v1/practice/sessions`
2. `GET /v1/practice/sessions/:session_id`
3. `POST /v1/practice/sessions/:session_id/submit`
4. `PATCH /v1/practice/sessions/:session_id/mode`
5. `GET /v1/practice/sessions/:session_id/timer`
6. `POST /v1/practice/sessions/:session_id/timer/pause`
7. `POST /v1/practice/sessions/:session_id/timer/resume`
8. `POST /v1/practice/sessions/:session_id/timer/recover`
9. `POST /v1/practice/sessions/:session_id/retry-queue`
10. `GET /v1/practice/retry-queue`
11. `POST /v1/practice/retry-queue/:queue_item_id/start`
12. `GET /v1/practice/sessions/:session_id/playback`
13. `PATCH /v1/practice/sessions/:session_id/playback`

### 4.6 Realtime Speaking
1. `GET /v1/realtime/speaking/scenarios`
2. `POST /v1/realtime/speaking/sessions`
3. `POST /v1/realtime/speaking/sessions/:session_id/retry`
4. `GET /v1/realtime/speaking/sessions/:session_id`
5. `PATCH /v1/realtime/speaking/sessions/:session_id/part`
6. `GET /v1/realtime/speaking/sessions/:session_id/comparison`
7. `GET /v1/realtime/speaking/sessions/:session_id/pronunciation-feedback`
8. `POST /v1/realtime/speaking/sessions/:session_id/pronunciation-feedback/tasks/:task_id/track`
9. `GET /v1/realtime/speaking/sessions/:session_id/events`
10. `POST /v1/realtime/speaking/sessions/:session_id/end`
11. `GET /v1/realtime/speaking` WebSocket

### 4.7 Writing
1. `GET /v1/writing/templates`
2. `POST /v1/writing/templates/:template_id/insert`
3. `GET /v1/writing/templates/adoption`
4. `POST /v1/writing/evaluations`
5. `GET /v1/writing/evaluations/:evaluation_id`
6. `POST /v1/writing/evaluations/:evaluation_id/rewrite`
7. `GET /v1/writing/archives`

### 4.8 Mock Exam
1. `POST /v1/mock-exams`
2. `GET /v1/mock-exams/:exam_id`
3. `POST /v1/mock-exams/:exam_id/progress`
4. `POST /v1/mock-exams/:exam_id/recover`
5. `POST /v1/mock-exams/:exam_id/submit`
6. `GET /v1/mock-exams/:exam_id/report`
7. `POST /v1/mock-exams/:exam_id/report/writeback/undo`
8. `GET /v1/mock-exams/:exam_id/report/export`

### 4.9 Analytics
1. `POST /v1/analytics/events/batch`
2. `GET /v1/analytics/summary`
3. `PUT /v1/analytics/experiments/:experiment_key`
4. `POST /v1/analytics/experiments/:experiment_key/stop`
5. `GET /v1/analytics/experiments`
6. `GET /v1/analytics/experiments/:experiment_key/assignment`

### 4.10 Reminders
1. `GET /v1/reminders/preferences`
2. `PUT /v1/reminders/preferences`
3. `GET /v1/reminders/recommendation`
4. `GET /v1/reminders/devices`
5. `PUT /v1/reminders/devices/:installation_id`
6. `DELETE /v1/reminders/devices/:installation_id`
7. `POST /v1/reminders/:reminder_id/dispatch-preview`
8. `POST /v1/reminders/:reminder_id/dispatch`
9. `POST /v1/reminders/:reminder_id/click`
10. `POST /v1/reminders/:reminder_id/dispatch` 的 item 结果当前额外包含 `retry_count`
11. `POST /v1/reminders/:reminder_id/dispatch` 的 `failure_code` 当前归一化为 `SENDER_UNAVAILABLE`、`NETWORK_ERROR`、`AUTH_ERROR`、`INVALID_REQUEST`、`DEVICE_UNREGISTERED`、`RATE_LIMITED`、`PROVIDER_UNAVAILABLE`、`PROVIDER_ERROR`

### 4.11 Internal And Health
1. `GET /health`
2. `GET /internal/audit-events` 仅在 `INTERNAL_DEBUG_ROUTES_ENABLED=true` 时暴露
3. `GET /internal/users/:user_id` 仅在 `INTERNAL_DEBUG_ROUTES_ENABLED=true` 时暴露

## 5. 当前错误边界
1. 参数错误统一返回 `400`
2. 鉴权失败返回 `401`
3. 资源不存在返回 `404`
4. 状态冲突返回 `409`
5. 对应仓储不可写时返回 `503`

## 6. 当前接口约束
1. 所有业务接口都以 `/v1` 开头
2. 当前不存在 `/v1/admin/*`
3. 当前不存在 `/v1/system/*`
4. 当前不存在支付 webhook 与订阅接口
