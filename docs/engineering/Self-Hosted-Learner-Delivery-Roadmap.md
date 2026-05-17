# Self-Hosted Learner Delivery Roadmap

## 1. 当前基线
`self-hosted` 分支当前已经具备：
1. Web learner 主链路可运行。
2. Mobile learner 主链路已覆盖首页、入门目标、诊断、计划、进度、听力、阅读、口语、写作、模考、账户。
3. iOS / Android 已具备 route smoke、Maestro 设备级 smoke、EAS build baseline。
4. 当前产品范围只保留 learner 核心能力，不再包含支付、订阅、Admin、发布治理历史项。
5. 按 2026-04-10 审计口径，learner 主链路完成度约 `90%-92%`；若将原生音频深度、analytics 前端消费、shared-client 收敛与交付验证留痕纳入，整体约 `83%-86%`。

## 2. 仓库内收口 PR 路径
### PR1 Web 学习主线收口
1. 首页、诊断、计划、进度页统一“下一步动作”。
2. 训练完成后的 follow-up 来源显式落盘。
3. Web 回归测试补齐。

### PR2 Mobile 学习闭环硬化
1. 首页“今日行动列表”与恢复队列。
2. 各训练页服务端同步状态、重试入口与主线下一步卡片。
3. 进度冲突摘要、字段级建议与回流跳转。
4. route smoke 扩展到关键失败重试场景。

### PR3 文档与交付收口
1. QA / 验收文档改成 `self-hosted` learner-only 版本。
2. 新增 mobile delivery runbook。
3. 新增当前 self-hosted learner 落地路线图。

## 3. 仓库外落地路径
以下步骤不再拆成 repo PR，但仍是最终交付必须完成的落地动作。

### 阶段 A: 目标环境准备
1. 确认 self-hosted server 的 API / WS 外网或受控内网地址。
2. 配置 `AUTH_SECRET`，按需启用 Postgres 与迁移。
3. 若需要 reminder push，准备 APNs / FCM 凭据。

### 阶段 B: Mobile Preview Readiness
1. 在 `apps/mobile` 绑定 Expo / EAS 项目。
2. 准备 `apps/mobile/.env.local` 或 CI secrets，注入目标实例地址。
3. 跑通 `npm run smoke:quality-gate:mobile-local`。
4. 产出 iOS / Android preview build。

### 阶段 C: 设备验收
1. iOS 真机完成首日流程与训练主链路。
2. Android 真机完成首日流程与训练主链路。
3. 同账号完成 Web <-> Mobile 的计划、进度、模考一致性核验。
4. 验证中断恢复、重试、冲突引导与导出/删除结果反馈。

### 阶段 D: 控制式内测 / 分发
1. 将 preview build 发给 QA 或受控内测人群。
2. 收敛真实设备兼容性、网络环境与实例接入问题。
3. 固化目标环境的默认实例配置、签名与构建参数。

### 阶段 E: Production Readiness
1. 改用 production build profile 出包。
2. 确认 HTTPS / WSS、证书、域名与安装包元数据已冻结。
3. 若需要提醒推送，补完真 token smoke 与通知点击恢复验收。
4. 完成部署方、研发、QA 三方签署。

## 4. 完成定义
当以下条件全部满足时，可认为当前 self-hosted learner 产品达到可交付状态：
1. Web 与 Mobile 的自动化门禁全部通过。
2. iOS 与 Android preview / production build 均可成功生成。
3. 真机完成 learner 主链路验收。
4. Web / Mobile 跨端同步、恢复、导出、删除全部通过。
5. Mobile speaking / listening 已形成真实原生音频闭环，而不再只是状态语义闭环。
6. 关键 learner analytics 事件已被 Web / Mobile 真实上报并可在 summary 中验证。
7. 当前文档、实际代码和交付步骤保持一致。

## 5. 2026-04-10 审计补充
基于 `docs/engineering/Codebase-Completion-Audit-2026-04-10.md`，当前 self-hosted learner 的剩余缺口不再是“页面有没有”，而是“闭环深度是否足够交付”。

建议按以下顺序收口：
1. `US-11301` Mobile speaking 原生音频输入闭环
2. `US-11302` Mobile listening 真实播放器闭环
3. `US-11303` Web / Mobile 关键行为 analytics 接入
4. `US-11306` analytics 覆盖核对 smoke
5. `US-11308` / `US-11309` shared-client 独立收敛与契约测试
6. `US-11310` ~ `US-11312` Postgres / 设备 / 高风险账户动作验证留痕

对应文档入口：
1. 审计报告: `docs/engineering/Codebase-Completion-Audit-2026-04-10.md`
2. 补洞 backlog: `docs/backlog/Self-Hosted-Completion-Followups-2026-04-10.md`
3. 执行计划: `docs/engineering/Self-Hosted-Gap-Closure-Execution-Plan-2026-04-10.md`

### 2026-04-10 当日进展
1. `US-11301` 已完成，Mobile speaking 已从“文本驱动 transcript”升级到“原生语音输入 -> 现有 realtime speaking 协议”。
2. `US-11302` 已完成，Mobile listening 已从“播放状态表单化验证”升级到“真实播放器 + 本地音频段 + 播放状态回写”。
3. `US-11303` 已完成，Web / Mobile onboarding、practice submit、writing evaluate、mock submit、reminder click 已真实上报 analytics。
4. 最新自动化验证已通过:
   - `npm run typecheck --workspace @ielts/client`
   - `npm run typecheck --workspace @ielts/mobile`
   - `npm run test --workspace @ielts/client`
   - `npm run test --workspace @ielts/mobile`

### 2026-04-11 当日进展
1. `US-11306` 已完成，已新增服务端 summary smoke [s36-analytics-coverage-smoke.test.ts](/Users/darkhorse/Workspace/practices/ielts-app/apps/server/tests/s36-analytics-coverage-smoke.test.ts)。
2. 已新增核对清单 [Self-Hosted-Analytics-Coverage-Checklist.md](/Users/darkhorse/Workspace/practices/ielts-app/docs/engineering/Self-Hosted-Analytics-Coverage-Checklist.md)，把 5 类关键事件映射到 Web / Mobile 对应测试入口。
3. 最新新增验证已通过:
   - `npm run typecheck --workspace @ielts/server`
   - `npm run test --workspace @ielts/server -- tests/s36-analytics-coverage-smoke.test.ts`
4. `US-11308` / `US-11309` 已完成，`packages/shared-client` 已不再依赖 Web 源码 re-export，且具备独立 `typecheck` / `vitest` 契约测试。
5. 本次 shared-client 相关验证已通过:
   - `npm run typecheck --workspace @ielts/shared-client`
   - `npm run test --workspace @ielts/shared-client`
   - `npm run typecheck --workspace @ielts/client`
   - `npm run typecheck --workspace @ielts/mobile`
   - `npm run test --workspace @ielts/client`
   - `npm run test --workspace @ielts/mobile`
6. `US-11310` 已完成，`npm run smoke:postgres:e2e-local` 本机通过，server postgres integration `24/24`，client Playwright API smoke `1/1`。
7. `US-11312` 已完成，导出、删除、提醒、实例切换 4 类高风险账户动作已补 2026-04-11 专项回归证据。
8. `US-11311` 已形成最新执行留痕，但尚未通过:
   - iOS simulator smoke 卡在 bundle / driver ready
   - Android emulator smoke 明确报错 `Cannot find native module 'ExpoSpeechRecognition'`
9. 当前剩余交付阻断已收敛到:
   - mobile device smoke 执行路径
   - `US-11307` progress / plan 冲突修复建议增强
10. 最新证据文档:
   - `docs/engineering/Self-Hosted-Delivery-Evidence-2026-04-11.md`
