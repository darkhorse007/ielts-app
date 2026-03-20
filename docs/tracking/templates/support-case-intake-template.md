# Support Case Intake Template（GA-13）

适用场景：
1. 当前后台能力无法直接闭环的问题。
2. 需要跨 `ops / finance / super_admin / eng / product` 升级处理的问题。
3. 需要为退款、删号异常、beta 外部反馈或内容事故留正式证据的问题。

## 1. 基本信息
| field | value |
|---|---|
| case_id | `SUP-YYYYMMDD-001` |
| created_at | `YYYY-MM-DD HH:mm` |
| owner | `ops / finance / super_admin` |
| severity | `P0 / P1 / P2 / P3` |
| status | `open / in_progress / waiting_external / resolved / closed` |
| issue_type | `login / deletion / billing / entitlement / coupon / beta / content / other` |
| related_release_id |  |
| related_risk_id | `R-009 / R-010 / R-011 / other` |

## 2. 用户与上下文
| field | value |
|---|---|
| user_id |  |
| email |  |
| phone |  |
| app_version |  |
| device |  |
| environment | `local / staging / prod-like / prod` |
| first_reported_at |  |
| reporter | `user / ops / qa / finance / admin` |

## 3. 问题摘要
### 3.1 Summary
- 一句话描述:
- 用户期望:
- 实际结果:

### 3.2 Evidence
- 截图 / 视频:
- 日志 / 请求 ID:
- 相关接口:
- 相关审计事件:

### 3.3 Repro
1. 
2. 
3. 

## 4. 初步分流
在以下分支中至少填写一个。

### 4.1 登录 / 账号
| check | value |
|---|---|
| admin user query result |  |
| user status | `active / frozen / pending_deletion / deleted` |
| frozen_at / unfrozen_at |  |
| can_unfreeze_now | `yes / no` |
| reason_if_blocked |  |

备注：
1. 当前后台没有改密码能力。
2. 当前后台没有恢复已删除账号能力。

### 4.2 删号 / 隐私
| check | value |
|---|---|
| deletion_requested | `yes / no` |
| deletion_requested_at |  |
| deleted | `yes / no` |
| deleted_at |  |
| manual_delete_requested | `yes / no` |
| exception_needed | `yes / no` |

备注：
1. 当前删号走用户自助链路。
2. “人工代删 / 误删恢复 / 定向删部分数据”都属于异常需求。

### 4.3 订单 / 权益 / 退款
| check | value |
|---|---|
| order_id |  |
| provider | `mockpay / stripe / alipay / unknown` |
| order_status | `created / paid / failed / cancelled / refunded` |
| paid_amount_cny |  |
| refunded_amount_cny |  |
| entitlement_adjust_needed | `yes / no` |
| refund_requested | `yes / no` |
| manual_finance_followup | `yes / no` |

备注：
1. 当前后台没有直接退款 API。
2. 退款口径必须以支付事实为准，不能先口头承诺后台即时退款。

### 4.4 Beta
| check | value |
|---|---|
| beta_release_id |  |
| whitelisted | `yes / no` |
| learner_has_beta_manage | `yes / no` |
| feedback_recorded_in_system | `yes / no` |
| external_feedback_link |  |

备注：
1. 当前 learner 默认没有 `beta:manage`。
2. 当前接口不支持 ops 代 learner 以原用户身份录入 feedback。

### 4.5 内容
| check | value |
|---|---|
| item_id |  |
| batch_id |  |
| skill | `listening / speaking / reading / writing` |
| status | `draft / published / unpublished` |
| review_status | `pending / approved / rejected` |
| immediate_action | `review / publish / unpublish / rollback / other` |

备注：
1. 已发布条目不能直接做 import batch rollback。
2. 发布后出问题优先下线，再修正重发。

## 5. 已执行动作
1. 已用后台 / 系统接口:
- 
2. 已查到的审计或报表证据:
- 
3. 已向用户说明的限制:
- 
4. 已采取的临时缓解:
- 

## 6. 升级决策
| question | answer |
|---|---|
| need_dual_review | `yes / no` |
| need_incident_runbook | `yes / no` |
| need_deploy_or_rollback_runbook | `yes / no` |
| need_finance_signoff | `yes / no` |
| need_product_or_legal_signoff | `yes / no` |
| assigned_next_owner |  |

## 7. 结论与收口
### 7.1 Resolution
- 最终处理结果:
- 是否真正闭环:
- 若未闭环，卡点是什么:

### 7.2 Follow-up
1. 需要新增能力:
2. 需要更新文档:
3. 需要补风险台账:
4. 需要纳入 Go / No-Go 决策:

## 8. 关闭前检查
- 是否已经明确告知用户当前真实能力边界
- 是否已经保存证据链接
- 是否已经记录 owner 与下一步
- 是否需要同步 `docs/tracking/risk-register.csv`
- 是否需要同步 `docs/engineering/Support-Content-Ops-SOP.md`
