# S3 实施报告（US-3101 / US-3102 / US-3103 / US-5101 / US-5102 / US-4101 + US-3201）

## 1. 交付概览
- 完成状态: Done
- 完成日期: 2026-02-26
- 增量完成: US-3201（2026-02-27，P1 听力听写模式）
- 覆盖 Story: 6/6（S3 基线）+ 1（P1 增量）
- 代码范围:
  - 服务端: `apps/server/`
  - 客户端: `apps/client/`
  - 契约文档: `docs/engineering/openapi/S3-Practice-Realtime.yaml`

## 2. Story 到交付映射

### 2.1 US-3101 听力核心题型训练
- 服务端
  - `apps/server/src/domain/practice-service.ts`（选择/填空/匹配/地图四类题）
  - `apps/server/src/routes/practice.ts`
- 客户端
  - `apps/client/src/pages/ListeningPracticePage.tsx`
  - `apps/client/src/lib/api-client.ts`
- 测试
  - `apps/server/tests/s3-practice.listening-reading.test.ts`
  - `apps/client/tests/s3-practice-speaking-pages.test.tsx`

### 2.2 US-3102 听力回放与精听
- 服务端
  - `apps/server/src/domain/practice-service.ts`（倍速/句段/位置状态持久化与异常恢复）
  - `apps/server/src/routes/practice.ts`
- 客户端
  - `apps/client/src/pages/ListeningPracticePage.tsx`
- 测试
  - `apps/server/tests/s3-practice.listening-reading.test.ts`
  - `apps/client/tests/s3-practice-speaking-pages.test.tsx`

### 2.3 US-3103 听力错因与重练
- 服务端
  - `apps/server/src/domain/practice-service.ts`（错因标签、改进动作、重练队列、熟练度更新）
  - `apps/server/src/routes/practice.ts`
- 客户端
  - `apps/client/src/pages/ListeningPracticePage.tsx`
- 测试
  - `apps/server/tests/s3-practice.listening-reading.test.ts`

### 2.4 US-5101 阅读核心题型训练
- 服务端
  - `apps/server/src/domain/practice-service.ts`（T/F/NG、段落匹配、标题匹配、摘要填空）
  - `apps/server/src/routes/practice.ts`
- 客户端
  - `apps/client/src/pages/ReadingPracticePage.tsx`
- 测试
  - `apps/server/tests/s3-practice.listening-reading.test.ts`
  - `apps/client/tests/s3-practice-speaking-pages.test.tsx`

### 2.5 US-5102 阅读错题定位证据
- 服务端
  - `apps/server/src/domain/practice-service.ts`（证据句/段落/位置返回）
  - `apps/server/src/routes/practice.ts`
- 客户端
  - `apps/client/src/pages/ReadingPracticePage.tsx`
- 测试
  - `apps/server/tests/s3-practice.listening-reading.test.ts`

### 2.6 US-4101 口语实时会话基础
- 服务端
  - `apps/server/src/domain/speaking-realtime-service.ts`
  - `apps/server/src/routes/realtime-speaking.ts`
  - `apps/server/src/app.ts`（注册 WS 路由与服务）
- 客户端
  - `apps/client/src/pages/SpeakingRealtimePage.tsx`
  - `apps/client/src/lib/api-client.ts`
  - `apps/client/src/App.tsx`（新增 `/speaking-live` 路由）
- 测试
  - `apps/server/tests/s3-speaking-realtime.test.ts`
  - `apps/client/tests/s3-practice-speaking-pages.test.tsx`

### 2.7 US-3201 听力听写模式训练（P1 增量）
- 服务端
  - `apps/server/src/domain/practice-service.ts`（`task_type=dictation`、句级听写题集、拼写/词块比对、高频错误统计）
  - `apps/server/src/routes/practice.ts`（提交结果新增 `dictation_summary` 与 `dictation_feedback`）
- 客户端
  - `apps/client/src/pages/ListeningPracticePage.tsx`（听写模式创建入口与反馈展示）
  - `apps/client/src/lib/api-types.ts`（听写反馈响应类型）
- 契约
  - `docs/engineering/openapi/S3-Practice-Realtime.yaml`（`task_type` 扩展与听写响应说明）
- 测试
  - `apps/server/tests/s7-listening-dictation.test.ts`
  - `apps/client/tests/s3-practice-speaking-pages.test.tsx`

## 3. 验收要点结果
1. 听力训练: 已覆盖选择/填空/匹配/地图，提交后返回对错、正确答案、错因标签与改进动作。
2. 听力精听: 已支持倍速、句段索引、播放位置持久化，并在异常倍速输入时自动恢复默认值。
3. 错因重练: 已支持错题加入重练队列、一键开启重练、重练后更新熟练度。
4. 阅读训练: 已覆盖 T/F/NG、段落匹配、标题匹配、摘要填空并返回结构化评分。
5. 阅读证据: 错题反馈中包含定位句、段落号与字符范围，可用于跳转原文。
6. 口语实时会话: 已提供 `WS /v1/realtime/speaking`、会话事件日志、断线后 5 分钟内恢复能力。
7. 听力听写模式: 已支持句级听写、拼写差异识别、词块缺失/冗余对比与高频错误统计。

## 4. 测试结果
执行命令:
```bash
npm test
```
结果（2026-02-27 增量回归）:
1. Server: 29/29 通过。
2. Client: 21/21 通过。
3. 总计: 50/50 通过。

## 5. 约束与后续
1. 当前口语实时链路使用文本转写输入模拟，S4 需要接入真实 ASR/TTS 与更强评分模型。
2. 当前训练题库为内置样例集，S4/S5 需要接入可运营的内容管理与版本发布能力。
