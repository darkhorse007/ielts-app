# RC 演示脚本（Demo Script）

## 1. 演示目标
1. 在 10~15 分钟内展示当前版本的核心学习闭环与发布就绪度。
2. 先演示学员价值，再演示系统稳定性 / 发布可控性。

## 2. 演示前准备
1. 启动后端：
```bash
npm run start --workspace @ielts/server
```
2. 启动前端：
```bash
npm run dev --workspace @ielts/client
```
3. 如需演示 Postgres 基线：
```bash
npm run smoke:postgres:e2e-local
```
或：
```bash
POSTGRES_CONNECTION_STRING=postgresql://... POSTGRES_SMOKE_START_DOCKER=false npm run smoke:postgres:e2e-local
```
若默认路径提示 `docker CLI is not installed` 或 `docker daemon is not available`，直接切换到第二条命令，不再重复尝试默认本地容器模式。

## 3. 演示顺序
### 3.1 学员主链路（约 4 分钟）
1. 打开 `/login`
2. 使用测试账号登录
3. 进入 `/onboarding`
4. 填写目标分、考试日期、每周学习时长、薄弱项并提交
5. 展示 `assessment_id` / `plan_id` 已生成
6. 进入 `/diagnostic`
7. 加载题目、提交答案、暂停 / 恢复、完成诊断
8. 展示 `skill_bands`
9. 进入 `/plan`
10. 加载 8 周计划并展示 `week_count: 8`

### 3.2 内容训练链路（约 4 分钟）
1. 进入 `/practice/listening`
2. 创建听力训练、填写答案、提交
3. 保存 / 加载播放状态，加入重练队列
4. 进入 `/writing`
5. 加载模板、插入模板、查看模板采纳率
6. 提交写作批改、执行改写复评、加载改写档案
7. 进入 `/mock-exam`
8. 创建模考、保存进度、恢复模考、提交整场模考
9. 加载复盘报告、撤销计划回写、导出报告

### 3.3 质量与发布就绪（约 3~5 分钟）
1. 展示 `docs/engineering/RC-Acceptance-Checklist.md`
2. 展示主链路自动化命令：
```bash
npm run test:e2e:learner --workspace @ielts/client
npm run test:e2e:practice-writing-mock --workspace @ielts/client
FRONTEND_FULL_E2E_PARALLEL=true npm run smoke:e2e:frontend-full-local
```
3. 展示治理与发布门禁命令：
```bash
npm run validate:tracking-governance -- --strict true --strict_warning_codes TGW001,TGW003
RELEASE_AUTOMATION_RUN_POSTGRES_SMOKE=true \
RELEASE_AUTOMATION_RUN_FRONTEND_FULL_E2E=true \
RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true \
RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001,TGW003 \
npm run release:checklist
```
4. 若需要，补充说明已知问题清单位置：
`docs/engineering/RC-Known-Issues-Template.md`

## 4. 讲解重点
1. 当前版本已经具备“学员学习闭环 + 主链路浏览器级回归 + 发布门禁 + tracking 治理”的完整收口条件。
2. 前端主链路自动化已不再只覆盖运维页面，而是覆盖了真实用户路径。
3. Postgres 验证已具备独立入口，可在 RC / nightly 阶段执行。

## 5. 演示失败时的回退话术
1. 若前端页面异常：
- 改为展示对应 Playwright 用例与最近通过结果。
2. 若 Docker / Postgres 环境不可用：
- 说明可使用外部连接串复用现有 Postgres，或展示服务端集成测试入口。
3. 若某条可选链路未准备：
- 明确说明不影响当前 Blocking 验收项，并记录到已知问题清单。
