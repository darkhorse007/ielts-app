# Database Schema Draft（Self-Hosted）

## 1. 说明
当前 `self-hosted` 分支的 Postgres 持久化不是商业版那种大一统关系模型，而是“按业务域拆分、以 `payload_json` 存快照”为主的轻量仓储结构。

这份文档只描述当前迁移脚本真实创建的表。

## 2. 通用约束
1. 每个业务域都可以落到独立 schema，默认是 `public`
2. 每个表使用文本主键，主键值来自领域对象 ID
3. 大部分业务对象通过 `payload_json` 存整对象快照
4. `updated_at` 或 `created_at` 采用 ISO 时间字符串

## 3. 认证与账户域
迁移脚本: `apps/server/scripts/auth-account-db-migrate-postgres.mjs`

### 3.1 表清单
| 表名 | 说明 |
|---|---|
| `auth_users` | 用户基础资料 |
| `auth_sessions` | 会话与 refresh hash |
| `auth_refresh_blacklist` | 已失效 refresh token |
| `auth_failed_login_counters` | 登录失败计数 |

### 3.2 结构摘要
1. `auth_users(user_id, email, phone, payload_json, updated_at)`
2. `auth_sessions(session_id, user_id, refresh_token_hash, payload_json, updated_at)`
3. `auth_refresh_blacklist(token_hash, expires_at, payload_json)`
4. `auth_failed_login_counters(identifier, payload_json, updated_at)`

## 4. 学习状态域
迁移脚本: `apps/server/scripts/learner-state-db-migrate-postgres.mjs`

### 4.1 表清单
| 表名 | 说明 |
|---|---|
| `learner_goal_profiles` | 目标配置 |
| `learner_assessment_jobs` | 诊断任务 |
| `learner_study_plans` | 学习计划 |
| `learner_user_progress` | 进度快照 |
| `learner_progress_conflicts` | 冲突记录 |

### 4.2 结构摘要
1. `learner_goal_profiles(goal_profile_id, user_id, assessment_id, plan_id, payload_json, updated_at)`
2. `learner_assessment_jobs(assessment_id, user_id, plan_id, status, payload_json, updated_at)`
3. `learner_study_plans(plan_id, user_id, assessment_id, status, payload_json, updated_at)`
4. `learner_user_progress(user_id, payload_json, updated_at)`
5. `learner_progress_conflicts(conflict_id, user_id, created_at, payload_json)`

## 5. 训练状态域
迁移脚本: `apps/server/scripts/practice-state-db-migrate-postgres.mjs`

### 5.1 表清单
| 表名 | 说明 |
|---|---|
| `practice_sessions` | 听力/阅读训练会话 |
| `practice_retry_queue` | 错题重练队列 |
| `practice_skill_proficiency` | 技能熟练度 |

### 5.2 结构摘要
1. `practice_sessions(session_id, user_id, skill, status, payload_json, updated_at)`
2. `practice_retry_queue(queue_item_id, user_id, skill, source_session_id, status, payload_json, updated_at)`
3. `practice_skill_proficiency(proficiency_key, payload_json, updated_at)`

## 6. 口语状态域
迁移脚本: `apps/server/scripts/speaking-state-db-migrate-postgres.mjs`

### 6.1 表清单
| 表名 | 说明 |
|---|---|
| `speaking_sessions` | 实时口语会话 |

### 6.2 结构摘要
1. `speaking_sessions(session_id, user_id, status, task_type, payload_json, updated_at)`

## 7. 写作状态域
迁移脚本: `apps/server/scripts/writing-state-db-migrate-postgres.mjs`

### 7.1 表清单
| 表名 | 说明 |
|---|---|
| `writing_evaluations` | 写作评分结果 |
| `writing_rewrite_archives` | 改写档案 |
| `writing_template_usages` | 模板使用记录 |

### 7.2 结构摘要
1. `writing_evaluations(evaluation_id, user_id, task_type, payload_json, updated_at)`
2. `writing_rewrite_archives(user_id, payload_json, updated_at)`
3. `writing_template_usages(user_id, payload_json, updated_at)`

## 8. 模考状态域
迁移脚本: `apps/server/scripts/mock-state-db-migrate-postgres.mjs`

### 8.1 表清单
| 表名 | 说明 |
|---|---|
| `mock_exams` | 模考实例 |
| `mock_exam_reports` | 模考报告 |

### 8.2 结构摘要
1. `mock_exams(exam_id, user_id, status, payload_json, updated_at)`
2. `mock_exam_reports(report_id, exam_id, user_id, payload_json, updated_at)`

## 9. 分析域
迁移脚本: `apps/server/scripts/analytics-db-migrate-postgres.mjs`

### 9.1 表清单
| 表名 | 说明 |
|---|---|
| `analytics_events` | 学习行为事件 |

### 9.2 结构摘要
1. `analytics_events(event_id, user_id, event_type, created_at, payload_json)`

### 9.3 索引
1. `analytics_events_user_created_idx`
2. `analytics_events_type_created_idx`

## 10. 当前没有的表
以下商业版/运维版表已不在 `self-hosted` 分支维护：

1. 订阅与支付相关表
2. Admin 用户、角色、审核、报表相关表
3. Beta、release、stability、canary 相关表
4. provider health 与运行时配置相关表

## 11. 使用建议
1. 想要最小部署时，全部使用 `memory`
2. 想要持久化时，只为实际需要的业务域启用对应 Postgres 仓储
3. 切换到 Postgres 前，先执行该域对应的迁移脚本
