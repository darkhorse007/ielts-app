# Beta Feedback Channel Decision（GA-11 / GA-13）

## 1. 决策结论
截至 `2026-03-13`，外部 beta 的正式反馈路径冻结为：
1. `internal / operated beta`:
- 继续使用仓库现有 `PUT /v1/system/beta/whitelist/{user_id}`
- `GET /v1/system/beta/feedback`
- `POST /v1/system/beta/feedback/{feedback_id}/escalate`
2. `external closed beta`:
- 不开放 learner 直接使用当前 in-app beta feedback API
- 统一走外部表单或外部收集入口
- 由 `L1-OPS` 使用 `docs/tracking/templates/support-case-intake-template.md` 落内部台账

## 2. 为什么现在必须这样定
1. 当前 `POST /v1/system/beta/feedback` 需要 `beta:manage`。
2. 当前默认 learner 不具备 `beta:manage`。
3. 当前仓库没有“ops 代 learner 提交 beta feedback”的 relay / impersonation API。
4. 当前若让 ops 用自己账号提交，会把 feedback 绑定到 ops 自己的 `user_id` 与 whitelist 关系，不能忠实表示真实 learner 反馈。

结论：
1. 方案 A “直接放开 whitelisted learner 的反馈权限” 需要改代码、改 RBAC、补测试，不适合作为当前文档收口动作。
2. 方案 B “外部表单 + 内部分诊” 能立即执行，且不制造伪证据。

## 3. 当前路径定义
### 3.1 Internal / Operated Beta
适用对象：
1. `qa`
2. `ops`
3. `admin`
4. 通过系统角色管理显式授予 beta 权限的受控测试账号

执行方式：
1. 用 whitelist API 管理 cohort。
2. 直接使用 in-app beta feedback API 提报。
3. 用 query / escalate API 做 triage 与升级。

### 3.2 External Closed Beta
适用对象：
1. 普通 learner
2. 邀请制真实用户
3. 不具备 `beta:manage` 的外部体验者

执行方式：
1. 使用仓库外的表单或收集入口接收反馈。
2. `L1-OPS` 把反馈落入 `support-case-intake-template` 或等效工单。
3. 高优问题按 `Support-Content-Ops-SOP` 分诊。
4. 若反馈演化为稳定性或发布问题，直接切到 incident / rollback runbook。

## 4. 外部 beta 的标准处理流
1. 外部用户提交表单。
2. `L1-OPS` 建立 `SUP-*` case。
3. 在 case 中补齐：
- `user_id`（若已知）
- `related_release_id`
- `beta_release_id`
- 版本、设备、重现步骤
- 截图、录屏、日志或请求 ID
4. 如问题为：
- `P3 / P2`: 留在 beta 池与产品池
- `P1`: 当日升级给 `L3-SUPERADMIN`
- `P0`: 直接切 incident 流程
5. 外部 beta 的 case 是当前 authoritative source；在没有 relay API 前，不强行写入 `/v1/system/beta/feedback`。

## 5. 禁止事项
1. 不得在外部 beta 中宣称“所有用户都可在 app 内直接提交 beta 反馈”。
2. 不得让 ops 用自己的账号代 learner 伪造 in-app 反馈记录。
3. 不得把外部表单反馈和 internal API 反馈混成同一份“无来源区分”的证据集。

## 6. 重新打开该决策的条件
只有满足以下任一条件，才重新评估是否放开 learner in-app feedback：
1. 新增 whitelisted learner 可安全提交 beta feedback 的权限模型，并补测试。
2. 新增“ops 代 learner 录入且保留原用户标识”的 relay API，并补审计。
3. client build / publish 路径冻结，准备进入更真实的外部 beta。

## 7. 对现有 GA 文档的影响
1. `Beta-Plan.md` 中“外部 beta 反馈路径”不再保留 A/B 摇摆，先冻结为外部表单 + 内部分诊。
2. `Support-Content-Ops-SOP.md` 中 beta 支持流程以外部表单为准。
3. `risk-register.csv` 的 `R-010` 从“待决定路径”改为“路径已冻结，但 in-app learner feedback 仍缺能力”。

## 8. 当前结论
1. 第 2 个最先动作已经执行完成。
2. 现在不是“还没决定”，而是已经明确决定：外部 beta 暂不走 learner in-app feedback。
3. 下一次真正重开这个决定，必须以代码能力变更为前提，而不是再写一轮讨论文档。
