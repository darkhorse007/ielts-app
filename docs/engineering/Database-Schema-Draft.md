# Database Schema Draft（PostgreSQL）

## 1. 目标与范围
本草案定义首发版（P0）后端数据层结构，用于支撑账号、学习闭环、模考、订阅、AI 路由和可观测性。

## 2. 技术基线
1. 数据库: PostgreSQL 15+。
2. 主键: `uuid`（建议 UUIDv7 生成策略）。
3. 时间字段: `timestamptz`，统一 UTC。
4. 结构化扩展字段: `jsonb`。
5. 软删除: 默认 `deleted_at`，高敏表按需物理删除。

## 3. 命名与约束规范
1. 表名使用复数下划线，如 `practice_sessions`。
2. 外键命名格式: `fk_<child>__<parent>`。
3. 索引命名格式: `idx_<table>__<columns>`。
4. 唯一索引命名格式: `uk_<table>__<columns>`。
5. 所有业务表默认字段:
- `id uuid primary key`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

## 4. 逻辑分域
1. 账号域: `users`, `user_auth_identities`, `user_sessions`, `user_devices`。
2. 学习域: `user_goal_profiles`, `skill_assessments`, `study_plans`, `study_plan_weeks`, `study_tasks`。
3. 训练域: `practice_sessions`, `practice_feedback_items`, `practice_retries`, `media_assets`。
4. 模考域: `mock_exams`, `mock_exam_sections`, `mock_exam_reports`。
5. 商业化域: `subscription_entitlements`, `subscription_orders`, `subscription_events`。
6. AI 域: `agent_runs`, `llm_provider_calls`, `provider_health_snapshots`。
7. 后台域: `admin_users`, `admin_roles`, `admin_user_roles`, `admin_action_logs`。
8. 可观测域: `analytics_events`, `audit_logs`。

## 5. 核心表结构（P0 必需）
### 5.1 账号域
```sql
create table users (
  id uuid primary key,
  email text,
  phone text,
  display_name text,
  locale text not null default 'zh-CN',
  status text not null default 'active', -- active/suspended/deleted
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uk_users__email on users (email) where email is not null;
create unique index uk_users__phone on users (phone) where phone is not null;

create table user_auth_identities (
  id uuid primary key,
  user_id uuid not null references users(id),
  provider text not null, -- password/sms/apple/google/wechat
  provider_user_id text not null,
  credential_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uk_user_auth_identities__provider_user
  on user_auth_identities (provider, provider_user_id);

create table user_sessions (
  id uuid primary key,
  user_id uuid not null references users(id),
  refresh_token_hash text not null,
  device_id uuid,
  ip_address inet,
  user_agent text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_user_sessions__user_expires on user_sessions (user_id, expires_at desc);
```

### 5.2 学习域
```sql
create table user_goal_profiles (
  id uuid primary key,
  user_id uuid not null references users(id),
  target_overall_band numeric(2,1) not null check (target_overall_band between 0 and 9),
  target_exam_date date not null,
  weekly_study_hours int not null check (weekly_study_hours between 1 and 80),
  weak_skills text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_user_goal_profiles__user_active on user_goal_profiles (user_id, is_active);

create table skill_assessments (
  id uuid primary key,
  user_id uuid not null references users(id),
  source text not null, -- onboarding/weekly/mock_exam
  listening_band_est numeric(2,1) not null,
  speaking_band_est numeric(2,1) not null,
  reading_band_est numeric(2,1) not null,
  writing_band_est numeric(2,1) not null,
  confidence numeric(3,2) not null check (confidence between 0 and 1),
  weak_points jsonb not null default '[]',
  plan_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_skill_assessments__user_created on skill_assessments (user_id, created_at desc);

create table study_plans (
  id uuid primary key,
  user_id uuid not null references users(id),
  horizon_weeks int not null default 8,
  status text not null default 'active', -- active/paused/completed
  version int not null default 1,
  updated_by text not null default 'system', -- system/agent/user
  last_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_study_plans__user_status on study_plans (user_id, status);

create table study_plan_weeks (
  id uuid primary key,
  plan_id uuid not null references study_plans(id),
  week_no int not null check (week_no between 1 and 26),
  goals jsonb not null,
  status text not null default 'pending', -- pending/in_progress/done
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uk_study_plan_weeks__plan_week on study_plan_weeks (plan_id, week_no);

create table study_tasks (
  id uuid primary key,
  user_id uuid not null references users(id),
  plan_week_id uuid not null references study_plan_weeks(id),
  skill text not null, -- listening/speaking/reading/writing
  task_type text not null,
  target_minutes int not null check (target_minutes between 1 and 240),
  due_date date,
  status text not null default 'todo', -- todo/doing/done/skipped
  completion_payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_study_tasks__user_due on study_tasks (user_id, due_date);
```

### 5.3 训练与反馈域
```sql
create table media_assets (
  id uuid primary key,
  user_id uuid not null references users(id),
  asset_type text not null, -- audio/text/image
  object_key text not null,
  mime_type text,
  duration_ms int,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uk_media_assets__object_key on media_assets (object_key);

create table practice_sessions (
  id uuid primary key,
  user_id uuid not null references users(id),
  skill text not null,
  task_type text not null,
  source text not null default 'practice', -- practice/mock_exam/retry
  raw_input jsonb not null,
  score_breakdown jsonb not null default '{}',
  next_actions jsonb not null default '[]',
  latency_ms int,
  provider_name text,
  fallback_triggered boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_practice_sessions__user_skill_created
  on practice_sessions (user_id, skill, created_at desc);

create table practice_feedback_items (
  id uuid primary key,
  session_id uuid not null references practice_sessions(id),
  feedback_type text not null, -- grammar/logic/pronunciation/...
  severity text not null default 'medium', -- low/medium/high
  evidence text,
  suggestion text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_practice_feedback_items__session on practice_feedback_items (session_id);

create table practice_retries (
  id uuid primary key,
  original_session_id uuid not null references practice_sessions(id),
  retry_session_id uuid not null references practice_sessions(id),
  diff_summary jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uk_practice_retries__retry_session on practice_retries (retry_session_id);
```

### 5.4 模考域
```sql
create table mock_exams (
  id uuid primary key,
  user_id uuid not null references users(id),
  template_version text not null,
  status text not null default 'created', -- created/in_progress/submitted/processing/done
  started_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_mock_exams__user_created on mock_exams (user_id, created_at desc);

create table mock_exam_sections (
  id uuid primary key,
  exam_id uuid not null references mock_exams(id),
  skill text not null,
  timer_seconds int not null check (timer_seconds > 0),
  answers jsonb not null default '{}',
  status text not null default 'pending', -- pending/in_progress/submitted
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uk_mock_exam_sections__exam_skill on mock_exam_sections (exam_id, skill);

create table mock_exam_reports (
  id uuid primary key,
  exam_id uuid not null references mock_exams(id),
  user_id uuid not null references users(id),
  overall_band_est numeric(2,1) not null,
  skill_bands jsonb not null,
  error_distribution jsonb not null,
  action_plan jsonb not null,
  generated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uk_mock_exam_reports__exam on mock_exam_reports (exam_id);
create index idx_mock_exam_reports__user_generated on mock_exam_reports (user_id, generated_at desc);
```

### 5.5 订阅与权益域
```sql
create table subscription_entitlements (
  id uuid primary key,
  user_id uuid not null references users(id),
  tier text not null, -- free/trial/pro
  trial_expire_at timestamptz,
  pro_expire_at timestamptz,
  ai_quota_daily int not null default 10,
  mock_exam_quota_monthly int not null default 1,
  auto_renew boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uk_subscription_entitlements__user on subscription_entitlements (user_id);

create table subscription_orders (
  id uuid primary key,
  user_id uuid not null references users(id),
  provider text not null, -- appstore/googlepay/stripe/...
  provider_order_id text,
  product_code text not null,
  amount_cents int not null,
  currency text not null default 'CNY',
  status text not null default 'created', -- created/paid/failed/refunded/cancelled
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_subscription_orders__user_created on subscription_orders (user_id, created_at desc);
create unique index uk_subscription_orders__provider_order on subscription_orders (provider, provider_order_id)
  where provider_order_id is not null;

create table subscription_events (
  id uuid primary key,
  order_id uuid references subscription_orders(id),
  user_id uuid not null references users(id),
  event_type text not null, -- trial_started/upgraded/cancelled/expired/renewed
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_subscription_events__user_created on subscription_events (user_id, created_at desc);
```

### 5.6 AI 与可观测域
```sql
create table agent_runs (
  id uuid primary key,
  user_id uuid references users(id),
  task_type text not null, -- speaking_coach/writing_score/plan_update/...
  input_ref text,
  output_ref text,
  status text not null, -- success/failed/fallback
  fallback_triggered boolean not null default false,
  latency_ms int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_agent_runs__task_created on agent_runs (task_type, created_at desc);

create table llm_provider_calls (
  id uuid primary key,
  agent_run_id uuid references agent_runs(id),
  provider_name text not null,
  model_name text not null,
  route_priority int not null,
  status text not null, -- success/timeout/error
  request_tokens int,
  response_tokens int,
  latency_ms int,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_llm_provider_calls__provider_created
  on llm_provider_calls (provider_name, created_at desc);

create table provider_health_snapshots (
  id uuid primary key,
  provider_name text not null,
  availability numeric(4,3) not null,
  p95_latency_ms int not null,
  error_rate numeric(4,3) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_provider_health_snapshots__provider_created
  on provider_health_snapshots (provider_name, created_at desc);

create table analytics_events (
  id uuid primary key,
  user_id uuid references users(id),
  event_name text not null,
  platform text not null,
  event_time timestamptz not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_analytics_events__event_time on analytics_events (event_time desc);
create index idx_analytics_events__name_time on analytics_events (event_name, event_time desc);

create table audit_logs (
  id uuid primary key,
  actor_user_id uuid references users(id),
  action text not null,
  resource_type text not null,
  resource_id text,
  result text not null, -- success/failed/denied
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_audit_logs__actor_created on audit_logs (actor_user_id, created_at desc);
create index idx_audit_logs__action_created on audit_logs (action, created_at desc);
```

### 5.7 后台管理域
```sql
create table admin_users (
  id uuid primary key,
  email text not null,
  password_hash text not null,
  status text not null default 'active', -- active/disabled
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uk_admin_users__email on admin_users (email);

create table admin_roles (
  id uuid primary key,
  role_code text not null, -- ops/content/support/finance_ro
  role_name text not null,
  permissions jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uk_admin_roles__role_code on admin_roles (role_code);

create table admin_user_roles (
  id uuid primary key,
  admin_user_id uuid not null references admin_users(id),
  admin_role_id uuid not null references admin_roles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uk_admin_user_roles__user_role on admin_user_roles (admin_user_id, admin_role_id);

create table admin_action_logs (
  id uuid primary key,
  admin_user_id uuid not null references admin_users(id),
  action text not null, -- freeze/unfreeze/entitlement_adjust/content_publish/...
  resource_type text not null,
  resource_id text,
  result text not null, -- success/failed/denied
  request_id text,
  ip_address inet,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_admin_action_logs__admin_created on admin_action_logs (admin_user_id, created_at desc);
create index idx_admin_action_logs__action_created on admin_action_logs (action, created_at desc);
```

## 6. 关键关系（ER 摘要）
1. `users 1-n user_sessions`。
2. `users 1-n user_goal_profiles`（同一时刻仅 1 个 `is_active = true`）。
3. `users 1-n practice_sessions`，`practice_sessions 1-n practice_feedback_items`。
4. `mock_exams 1-4 mock_exam_sections`，`mock_exams 1-1 mock_exam_reports`。
5. `users 1-1 subscription_entitlements`，`users 1-n subscription_orders`。
6. `agent_runs 1-n llm_provider_calls`。
7. `admin_users n-n admin_roles`（通过 `admin_user_roles`）。

## 7. 索引与性能策略
1. 高频查询按 `(user_id, created_at desc)` 建复合索引。
2. 大体量日志表 `analytics_events` 建议按月分区。
3. `llm_provider_calls` 建议按周或月分区，便于成本统计。
4. `jsonb` 字段只对需要过滤的键建立 GIN 索引，避免过度索引。

## 8. 数据生命周期策略
1. 会话与反馈:
- 热数据 180 天在线；
- 历史数据归档到低频存储。
2. 分析事件:
- 明细保留 12 个月；
- 聚合结果长期保留。
3. 支付与审计:
- 按合规要求长期保留，不可篡改。

## 9. 迁移计划（建议）
1. `V1`（S1-S2）:
- `users`, `user_auth_identities`, `user_sessions`, `user_goal_profiles`, `skill_assessments`, `study_plans`, `study_plan_weeks`, `study_tasks`。
2. `V2`（S3-S4）:
- `media_assets`, `practice_sessions`, `practice_feedback_items`, `practice_retries`, `agent_runs`, `llm_provider_calls`。
3. `V3`（S5）:
- `mock_exams`, `mock_exam_sections`, `mock_exam_reports`, `subscription_entitlements`, `subscription_orders`, `subscription_events`, `admin_users`, `admin_roles`, `admin_user_roles`。
4. `V4`（S6）:
- `provider_health_snapshots`, `analytics_events`, `audit_logs`, `admin_action_logs`。

## 10. 待确认项（进入开发前锁定）
1. 多租户需求是否存在（当前按单租户设计）。
2. 是否需要区域化数据存储（当前未分区到地域）。
3. 支付 Provider 的最终集合（影响订单字段扩展）。
4. 数据删除合规 SLA（当前仅定义机制，未写具体小时数）。
