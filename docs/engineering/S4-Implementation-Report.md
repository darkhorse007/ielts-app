# S4 实施报告（US-4102 / US-4103 / US-4104 / US-5103 / US-6101 / US-6102 + US-4201 + US-4202 + US-6201）

## 1. 交付概览
- 完成状态: Done
- 完成日期: 2026-02-26
- 增量完成: US-4201（2026-02-27，P1 发音热力图反馈）
- 增量完成: US-4202（2026-02-27，P1 场景化角色扮演口语训练）
- 增量完成: US-6201（2026-02-27，P1 高分写作模板与论证框架）
- 覆盖 Story: 6/6（S4 基线）+ 3（P1 增量）
- 代码范围:
  - 服务端: `apps/server/`
  - 客户端: `apps/client/`
  - 契约文档: `docs/engineering/openapi/S4-Advanced-Practice-Writing.yaml`

## 2. Story 到交付映射

### 2.1 US-4102 口语 Part1/2/3 与追问
- 服务端
  - `apps/server/src/domain/speaking-realtime-service.ts`（Part 状态机与追问生成）
  - `apps/server/src/routes/realtime-speaking.ts`
- 客户端
  - `apps/client/src/pages/SpeakingRealtimePage.tsx`
- 测试
  - `apps/server/tests/s4-speaking-advanced.test.ts`
  - `apps/client/tests/s4-reading-speaking-writing-pages.test.tsx`

### 2.2 US-4103 口语四维评分反馈
- 服务端
  - `apps/server/src/domain/speaking-realtime-service.ts`（fluency/lexical/grammar/pronunciation）
  - `apps/server/src/routes/realtime-speaking.ts`（`score_update` 输出 `suggestions/latency_ms/fallback_triggered`）
- 客户端
  - `apps/client/src/pages/SpeakingRealtimePage.tsx`（实时评分卡与建议展示）
- 测试
  - `apps/server/tests/s4-speaking-advanced.test.ts`
  - `apps/client/tests/s4-reading-speaking-writing-pages.test.tsx`

### 2.3 US-4104 口语同题再答对比
- 服务端
  - `apps/server/src/domain/speaking-realtime-service.ts`（retry 会话创建与前后分差计算）
  - `apps/server/src/routes/realtime-speaking.ts`（`/retry` 与 `/comparison`）
- 客户端
  - `apps/client/src/pages/SpeakingRealtimePage.tsx`（同题再答与对比拉取）
- 测试
  - `apps/server/tests/s4-speaking-advanced.test.ts`
  - `apps/client/tests/s4-reading-speaking-writing-pages.test.tsx`

### 2.4 US-5103 阅读训练/考试模式切换
- 服务端
  - `apps/server/src/domain/practice-service.ts`（training/exam 模式切换、计时状态、暂停/恢复/恢复异常）
  - `apps/server/src/routes/practice.ts`
- 客户端
  - `apps/client/src/pages/ReadingPracticePage.tsx`
- 测试
  - `apps/server/tests/s4-reading-writing.test.ts`
  - `apps/client/tests/s4-reading-speaking-writing-pages.test.tsx`

### 2.5 US-6101 写作四维评分
- 服务端
  - `apps/server/src/domain/writing-service.ts`
  - `apps/server/src/routes/writing.ts`
  - `apps/server/src/app.ts`（注册 writing 路由）
- 客户端
  - `apps/client/src/pages/WritingEvaluationPage.tsx`
  - `apps/client/src/lib/api-client.ts`
- 测试
  - `apps/server/tests/s4-reading-writing.test.ts`
  - `apps/client/tests/s4-reading-speaking-writing-pages.test.tsx`

### 2.6 US-6102 写作证据化建议
- 服务端
  - `apps/server/src/domain/writing-service.ts`（最少 3 条建议，包含证据句与改写示例）
  - `apps/server/src/routes/writing.ts`
- 客户端
  - `apps/client/src/pages/WritingEvaluationPage.tsx`（建议条目与 evidence 展示）
- 测试
  - `apps/server/tests/s4-reading-writing.test.ts`
  - `apps/client/tests/s4-reading-speaking-writing-pages.test.tsx`

### 2.7 US-4201 发音热力图反馈（P1 增量）
- 服务端
  - `apps/server/src/domain/speaking-realtime-service.ts`（单词/音素问题标注、回放片段、纠音任务追踪）
  - `apps/server/src/routes/realtime-speaking.ts`（新增发音反馈查询与任务追踪接口，`score_update` 扩展发音反馈）
- 客户端
  - `apps/client/src/pages/SpeakingRealtimePage.tsx`（热力图加载、回放片段计数、纠音任务追踪状态）
  - `apps/client/src/lib/api-client.ts`
  - `apps/client/src/lib/api-types.ts`
- 契约
  - `docs/engineering/openapi/S4-Advanced-Practice-Writing.yaml`
- 测试
  - `apps/server/tests/s4-speaking-advanced.test.ts`
  - `apps/client/tests/s4-reading-speaking-writing-pages.test.tsx`

### 2.8 US-4202 场景化角色扮演口语训练（P1 增量）
- 服务端
  - `apps/server/src/domain/speaking-realtime-service.ts`（5 类角色场景目录、role-play 会话建模、场景化动态追问）
  - `apps/server/src/routes/realtime-speaking.ts`（`GET /v1/realtime/speaking/scenarios`、会话创建支持 `task_type/scenario_type`）
- 客户端
  - `apps/client/src/pages/SpeakingRealtimePage.tsx`（角色扮演模式与场景选择、场景目录拉取）
  - `apps/client/src/lib/api-client.ts`
  - `apps/client/src/lib/api-types.ts`
- 契约
  - `docs/engineering/openapi/S4-Advanced-Practice-Writing.yaml`
- 测试
  - `apps/server/tests/s4-speaking-advanced.test.ts`
  - `apps/client/tests/s4-reading-speaking-writing-pages.test.tsx`

### 2.9 US-6201 高分写作模板与论证框架（P1 增量）
- 服务端
  - `apps/server/src/domain/writing-service.ts`（模板库、模板插入合并、采纳率统计）
  - `apps/server/src/routes/writing.ts`（模板列表、模板插入、采纳率接口）
- 客户端
  - `apps/client/src/pages/WritingEvaluationPage.tsx`（模板加载、插入、采纳率展示）
  - `apps/client/src/lib/api-client.ts`
  - `apps/client/src/lib/api-types.ts`
- 契约
  - `docs/engineering/openapi/S4-Advanced-Practice-Writing.yaml`
- 测试
  - `apps/server/tests/s7-writing-templates.test.ts`
  - `apps/client/tests/s4-reading-speaking-writing-pages.test.tsx`

## 3. 验收要点结果
1. 口语 Part 流程: 支持 Part1/2/3 切换，回合内产生追问消息。
2. 口语实时反馈: 每轮返回四维分、建议、延迟和回退标识。
3. 同题再答: 支持从已结束会话创建 retry，并返回前后分差与下一步动作。
4. 阅读模式: 支持 training/exam 切换，计时器可查询、暂停、恢复、异常恢复，提交时记录 elapsed。
5. 写作评分: 支持 Task1/Task2，返回 TR/CC/LR/GRA/overall，服务端耗时字段可追踪。
6. 写作建议: 返回证据化建议（issue/evidence_sentence/recommendation/revised_sample），数量不少于 3。
7. 发音热力图: 已输出单词/音素级问题标注，提供回放对比片段，并支持将纠音建议追踪到练习任务状态。
8. 角色扮演口语: 已提供 5 类场景，支持基于轮次与回答内容的动态追问，评分结构保持四维一致。
9. 写作模板框架: 已提供模板库与使用建议，插入时保留原文不覆盖，并支持按模板查看采纳率。

## 4. 测试结果
执行命令:
```bash
npm test
```
结果（2026-02-27 增量回归）:
1. Server: 32/32 通过。
2. Client: 21/21 通过。
3. 总计: 53/53 通过。

## 5. 约束与后续
1. 当前口语与写作评分为规则+回退模拟链路，S5/S6 需接入生产级 ASR/TTS 与商业 LLM 路由。
2. 当前数据层为内存实现，后续需迁移到持久化存储并补齐迁移脚本与压测基线。
