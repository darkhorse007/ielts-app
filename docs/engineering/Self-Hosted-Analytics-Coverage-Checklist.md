# Self-Hosted Analytics Coverage Checklist

- 日期: 2026-04-11
- 范围: `US-11306`
- 目标: 快速确认 self-hosted learner 当前 5 类关键行为 analytics 没有漏埋、平台字段正确、summary 可见

## 1. 关键事件清单

| 事件 | 平台要求 | 当前入口 |
|---|---|---|
| `onboarding_submitted` | `web` + `ios/android` | Web onboarding、Mobile onboarding |
| `practice_submitted` | `web` + `ios/android` | Web listening/reading、Mobile listening/reading |
| `writing_evaluated` | `web` + `ios/android` | Web writing、Mobile writing |
| `mock_exam_submitted` | `web` + `ios/android` | Web mock exam、Mobile mock exam |
| `reminder_clicked` | `web` + `ios/android` | Web account reminder click、Mobile notification bridge |

## 2. 自动化验证入口

服务端 summary smoke:
1. [s36-analytics-coverage-smoke.test.ts](/Users/darkhorse/Workspace/practices/ielts-app/apps/server/tests/s36-analytics-coverage-smoke.test.ts)
2. 命令: `npm run test --workspace @ielts/server -- tests/s36-analytics-coverage-smoke.test.ts`
3. 验证点:
   - 5 类关键事件都能在 `/v1/analytics/summary` 的 `recent_events` 中看到
   - `by_platform` 至少覆盖 `web`、`ios`、`android`
   - `field_completeness_percent = 100`
   - `platform` / `skill` 过滤查询仍返回正确结果

Web 页面埋点断言:
1. [onboarding-page.test.tsx](/Users/darkhorse/Workspace/practices/ielts-app/apps/client/tests/onboarding-page.test.tsx)
2. [s3-practice-speaking-pages.test.tsx](/Users/darkhorse/Workspace/practices/ielts-app/apps/client/tests/s3-practice-speaking-pages.test.tsx)
3. [s4-reading-speaking-writing-pages.test.tsx](/Users/darkhorse/Workspace/practices/ielts-app/apps/client/tests/s4-reading-speaking-writing-pages.test.tsx)
4. [s5-mock-exam-page.test.tsx](/Users/darkhorse/Workspace/practices/ielts-app/apps/client/tests/s5-mock-exam-page.test.tsx)
5. [s2-progress-account-pages.test.tsx](/Users/darkhorse/Workspace/practices/ielts-app/apps/client/tests/s2-progress-account-pages.test.tsx)

Mobile 页面埋点断言:
1. [routes.smoke.test.tsx](/Users/darkhorse/Workspace/practices/ielts-app/apps/mobile/tests/routes.smoke.test.tsx)
2. [reminder-notification-bridge.test.tsx](/Users/darkhorse/Workspace/practices/ielts-app/apps/mobile/tests/reminder-notification-bridge.test.tsx)

## 3. 最小执行命令

1. `npm run test --workspace @ielts/server -- tests/s36-analytics-coverage-smoke.test.ts`
2. `npm run test --workspace @ielts/client`
3. `npm run test --workspace @ielts/mobile`

## 4. 人工 spot-check

当需要在本地实例上人工确认时，至少核对以下点:
1. 完成一次 onboarding 后，summary 中存在 `onboarding_submitted`
2. 完成一次 listening 或 reading 提交后，summary 中存在 `practice_submitted`
3. 完成一次 writing evaluate 后，summary 中存在 `writing_evaluated`
4. 完成一次 mock exam submit 后，summary 中存在 `mock_exam_submitted`
5. 触发一次 reminder click 后，summary 中存在 `reminder_clicked`
6. `recent_events` 中每条事件都带 `trace_id` 与 `created_at`
7. `field_completeness_percent` 不应低于 `100`

## 5. 当前结论

截至 2026-04-11，analytics 覆盖核对基线由两部分组成:
1. 前端页面级测试负责确认关键业务动作确实调用 `analyticsBatch`
2. 服务端 summary smoke 负责确认 5 类关键事件在 analytics summary 中可见且字段完整
