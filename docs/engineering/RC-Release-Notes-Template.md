# RC 候选发布说明模板（Release Notes Template）

## 1. 基本信息
- RC 版本:
- 日期:
- Owner:
- 环境:
- 决策: `Go` / `Go with Known Issues` / `No-Go`

## 2. 发布范围
1. 本次范围:
2. 不在本次范围:
3. 关联 Story / Sprint:

## 3. 关键变更摘要
1. 学员主链路:
2. 内容训练链路:
3. 运维 / 发布能力:
4. tracking / 文档治理:

## 4. 自动化验收结果
| command | result | notes |
|---|---|---|
| `npm run typecheck` |  |  |
| `npm test` |  |  |
| `npm run validate:tracking-governance` |  |  |
| `npm run test:e2e:learner --workspace @ielts/client` |  |  |
| `npm run test:e2e:practice-writing-mock --workspace @ielts/client` |  |  |
| `FRONTEND_FULL_E2E_PARALLEL=true npm run smoke:e2e:frontend-full-local` |  |  |
| `npm run smoke:postgres:e2e-local` |  |  |
| `npm run smoke:content-restart:e2e-local` |  |  |
| `RELEASE_AUTOMATION_RUN_POSTGRES_SMOKE=true RELEASE_AUTOMATION_RUN_FRONTEND_FULL_E2E=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES=TGW001,TGW003 npm run release:checklist` |  |  |

## 5. 已知问题
1. 详见 `docs/engineering/RC-Known-Issues-Template.md`
2. 本次 RC 已接受问题摘要:

## 6. 风险与回滚
1. 主要风险:
2. 观察指标:
3. 回滚条件:
4. 回滚命令 / 路径:

## 7. 演示与验收说明
1. 演示脚本: `docs/engineering/RC-Demo-Script.md`
2. 验收清单: `docs/engineering/RC-Acceptance-Checklist.md`
3. 如需基于门禁 summary 生成候选发布记录，可执行：
```bash
npm run release:record:candidate -- --summary /tmp/release-check-summary.json --scope "RC scope" --rollback "执行发布回滚方案"
```
4. 如需同步生成 RC 交付包目录，可执行：
```bash
npm run rc:package:from-gate -- --scope "RC scope" --rollback "执行发布回滚方案"
```

## 8. 最终发布建议
1. 建议:
2. 需要额外确认的事项:
3. 签署人:
