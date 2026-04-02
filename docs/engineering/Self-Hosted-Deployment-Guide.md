# Self-Hosted Deployment Guide

## 1. 目标
这份指南用于把当前 `self-hosted` 分支部署成一套可运行的 IELTS Web 应用。

## 2. 前置条件
1. Node.js 20+
2. npm 10+
3. 可选: PostgreSQL 15+

## 3. 安装依赖
```bash
npm install
```

## 4. 最小启动方式
最小模式下，所有业务域都使用内存仓储，只需要提供认证密钥。

### 4.1 启动服务端
```bash
AUTH_SECRET=replace-with-a-32-char-or-longer-secret \
BROWSER_ALLOWED_ORIGINS=http://127.0.0.1:5173 \
npm run start --workspace @ielts/server
```

默认监听:

1. `http://127.0.0.1:8787`
2. 健康检查: `http://127.0.0.1:8787/health`

### 4.2 启动前端
```bash
VITE_API_BASE_URL=http://127.0.0.1:8787 \
VITE_WS_BASE_URL=ws://127.0.0.1:8787 \
npm run dev --workspace @ielts/client
```

默认前端地址:

1. `http://127.0.0.1:5173`

说明:

1. 如果前端和 API/WS 不是同一浏览器 origin，需要在服务端配置 `BROWSER_ALLOWED_ORIGINS`
2. `BROWSER_ALLOWED_ORIGINS` 支持逗号分隔多个 `http(s)://host[:port]`
3. `/internal/*` 调试接口默认关闭；只应在本地或受控环境下显式配置 `INTERNAL_DEBUG_ROUTES_ENABLED=true`

## 5. Postgres 持久化方式
### 5.1 可独立切换到 Postgres 的业务域
1. `AUTH_ACCOUNT`
2. `LEARNER_STATE`
3. `PRACTICE_STATE`
4. `SPEAKING_STATE`
5. `WRITING_STATE`
6. `MOCK_STATE`
7. `ANALYTICS`

### 5.2 环境变量模式
每个域都遵循同样的命名：

1. `*_STORAGE_BACKEND=postgres`
2. `*_STORAGE_CONNECTION_STRING=postgresql://...`
3. `*_STORAGE_SCHEMA=public`

示例:
```bash
AUTH_ACCOUNT_STORAGE_BACKEND=postgres
AUTH_ACCOUNT_STORAGE_CONNECTION_STRING=postgresql://postgres:postgres@127.0.0.1:5432/ielts_app
AUTH_ACCOUNT_STORAGE_SCHEMA=public
```

## 6. Postgres 迁移命令
根据你实际启用的业务域执行对应迁移即可。

### 6.1 认证与账户
```bash
npm run db:migrate:auth-account:postgres -- --connection_string=postgresql://... --schema=public
```

### 6.2 学习状态
```bash
npm run db:migrate:learner-state:postgres -- --connection_string=postgresql://... --schema=public
```

### 6.3 训练状态
```bash
npm run db:migrate:practice-state:postgres -- --connection_string=postgresql://... --schema=public
```

### 6.4 口语状态
```bash
npm run db:migrate:speaking-state:postgres -- --connection_string=postgresql://... --schema=public
```

### 6.5 写作状态
```bash
npm run db:migrate:writing-state:postgres -- --connection_string=postgresql://... --schema=public
```

### 6.6 模考状态
```bash
npm run db:migrate:mock-state:postgres -- --connection_string=postgresql://... --schema=public
```

### 6.7 分析事件
```bash
npm run db:migrate:analytics:postgres -- --connection_string=postgresql://... --schema=public
```

## 7. Postgres 模式启动示例
```bash
AUTH_SECRET=replace-with-a-32-char-or-longer-secret \
BROWSER_ALLOWED_ORIGINS=https://app.example.com \
AUTH_ACCOUNT_STORAGE_BACKEND=postgres \
AUTH_ACCOUNT_STORAGE_CONNECTION_STRING=postgresql://postgres:postgres@127.0.0.1:5432/ielts_app \
AUTH_ACCOUNT_STORAGE_SCHEMA=public \
LEARNER_STATE_STORAGE_BACKEND=postgres \
LEARNER_STATE_STORAGE_CONNECTION_STRING=postgresql://postgres:postgres@127.0.0.1:5432/ielts_app \
LEARNER_STATE_STORAGE_SCHEMA=public \
PRACTICE_STATE_STORAGE_BACKEND=postgres \
PRACTICE_STATE_STORAGE_CONNECTION_STRING=postgresql://postgres:postgres@127.0.0.1:5432/ielts_app \
PRACTICE_STATE_STORAGE_SCHEMA=public \
SPEAKING_STATE_STORAGE_BACKEND=postgres \
SPEAKING_STATE_STORAGE_CONNECTION_STRING=postgresql://postgres:postgres@127.0.0.1:5432/ielts_app \
SPEAKING_STATE_STORAGE_SCHEMA=public \
WRITING_STATE_STORAGE_BACKEND=postgres \
WRITING_STATE_STORAGE_CONNECTION_STRING=postgresql://postgres:postgres@127.0.0.1:5432/ielts_app \
WRITING_STATE_STORAGE_SCHEMA=public \
MOCK_STATE_STORAGE_BACKEND=postgres \
MOCK_STATE_STORAGE_CONNECTION_STRING=postgresql://postgres:postgres@127.0.0.1:5432/ielts_app \
MOCK_STATE_STORAGE_SCHEMA=public \
npm run start --workspace @ielts/server
```

说明:

1. `ANALYTICS_STORAGE_BACKEND` 不配置时会继续使用内存
2. 如需持久化分析事件，需额外配置 `ANALYTICS_*`
3. 如前端由独立域名、反向代理或 CDN 暴露，需同步配置 `BROWSER_ALLOWED_ORIGINS`

## 8. 验证命令
### 8.1 代码校验
```bash
npm run typecheck
npm test
npm run release:checklist
```

### 8.2 本地 API 冒烟
```bash
npm run smoke:e2e:api-local
```

### 8.3 本地 Postgres 冒烟
```bash
npm run smoke:postgres:e2e-local
```

## 9. 部署后检查项
1. `/health` 至少返回 `status: "ok"`，并可附带 `reminder_dispatch_scheduler`
2. 可以完成注册和登录
3. 可以完成一次 onboarding 和诊断
4. 可以创建一次训练会话和一次模考
5. 可以进入 `/account` 导出个人数据
6. 口语实时会话可以在浏览器端成功建立 WebSocket
7. 如已启用移动提醒推送，可通过 `POST /internal/reminders/dispatch-due` 或等待 scheduler 周期触发，验证 due reminder 能产生 dispatch attempt
8. 如已启用 reminder scheduler，可通过 `/health` 查看 `reminder_dispatch_scheduler` 摘要；如同时开启 `INTERNAL_DEBUG_ROUTES_ENABLED=true`，还可访问 `GET /internal/reminders/scheduler-status`

## 10. 当前不需要配置的能力
以下环境变量和系统能力已经不属于 `self-hosted` 分支，不需要再配置：

1. 支付、订阅、会员相关变量
2. provider health 与 AI runtime 冻结变量
3. release storage、system RBAC、beta、stability、chaos drill 相关变量

## 11. 可选提醒调度配置
仅当你希望 server 自动执行到期学习提醒时，再配置以下变量：

1. `REMINDER_DISPATCH_SCHEDULER_ENABLED=true`
2. `REMINDER_DISPATCH_SCHEDULER_INTERVAL_SECONDS=60`
3. `REMINDER_DISPATCH_SCHEDULER_BATCH_SIZE=20`

启用后可结合以下接口确认运行状态：

1. `GET /health`
2. `GET /internal/reminders/scheduler-status`，仅当 `INTERNAL_DEBUG_ROUTES_ENABLED=true` 时开放
