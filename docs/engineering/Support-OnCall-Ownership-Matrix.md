# Support On-Call Ownership Matrix（GA-13）

## 1. 目的
1. 冻结 `GA-13` 当前客服与运营支持的首响、升级和决策责任链。
2. 在当前仓库尚无独立 `support` 角色的前提下，把 `ops / finance / super_admin` 的值班分工固定下来。
3. 为 `Support-Content-Ops-SOP`、incident runbook、退款 FAQ 与 beta 运营提供统一 owner 基线。

## 2. 当前前提（截至 2026-03-13）
1. 当前后台角色与权限事实：
- `ops`: `orders:read`、`users:manage`、`content:publish`、`audit:read`、`release:manage`
- `finance`: `orders:read`、`entitlement:adjust`、`entitlement:rollback`、`coupon:manage`、`audit:read`
- `super_admin`: 全量后台权限
2. 当前系统角色事实：
- `ops` / `admin` 具备 `beta:read`、`beta:manage`
- 仅 `admin` 具备 `release:manage`
3. 当前仓库没有：
- 独立 support 角色
- 后台退款 API
- 后台删号 API
- learner 自助 beta 反馈权限

结论：
1. 一线支持默认由 `ops` 承担。
2. `finance` 只对订单、优惠券、权益和退款口径负责，不承担通用首响。
3. `super_admin` 是高风险动作、发布事故和跨域争议的最终升级人。

## 3. 值班槽位定义
| slot | default role | responsibility | must be online when |
|---|---|---|---|
| `L1-OPS` | `ops` | 一线首响、信息收集、用户沟通、账号状态核查、内容问题初判 | 全部支持窗口 |
| `L2-FINANCE` | `finance` | 订单核账、权益调整、优惠券修正、退款口径确认 | 涉及支付、订单、补偿时 |
| `L3-SUPERADMIN` | `super_admin` | 高风险审批、发布级事故升级、最终例外决策 | P0 / P1 与高风险人工动作 |
| `IC-ADMIN` | system `admin` 持有人 | incident commander、回滚决策与 release / canary 操作 | 发布窗口、beta 窗口、P0 事故 |

说明：
1. `L3-SUPERADMIN` 与 `IC-ADMIN` 可以是同一人，但职责不同。
2. 仓库内先冻结“角色槽位”，实际人名、手机号、IM 群由发布日历或值班表在仓库外维护。

## 4. 首响与升级矩阵
| issue type | first response | second line | final escalation | target first response | notes |
|---|---|---|---|---|---|
| 登录失败 / 账号异常 | `L1-OPS` | `L3-SUPERADMIN` | `IC-ADMIN`（若为系统性故障） | `30m` | 当前仅可查状态、冻结/解冻，不能改密码 |
| 删除请求 / 隐私异常 | `L1-OPS` | `L3-SUPERADMIN` | product/legal | `4h` | 当前仅有用户自助删号链路 |
| 已支付未到账 / 权益错配 | `L1-OPS` | `L2-FINANCE` | `L3-SUPERADMIN` | `30m` | finance 负责 entitlement adjust / rollback |
| 优惠券配置错误 | `L1-OPS` | `L2-FINANCE` | `L3-SUPERADMIN` | `4h` | finance 负责 coupon 修正 |
| 退款诉求 | `L1-OPS` | `L2-FINANCE` | `L3-SUPERADMIN` | `30m` | 当前只能确认受理与核账，不能承诺后台即时退款 |
| 内容导入 / 审核 / 发布异常 | `L1-OPS` | `L3-SUPERADMIN` | `IC-ADMIN`（若影响发布） | `30m` | ops 具备 content 管理权限 |
| beta 外部反馈 | `L1-OPS` | `L3-SUPERADMIN` | `IC-ADMIN`（若变成事故） | `4h` | 外部 beta 先走外部表单与内部台账 |
| beta 内部反馈 / whitelist / escalation | `L1-OPS` | `IC-ADMIN` | `L3-SUPERADMIN` | `30m` | 仅 internal / operated beta 走 in-app beta API |
| 发布事故 / 持续 red 告警 | `L1-OPS` | `IC-ADMIN` | `L3-SUPERADMIN` | `10m` | 直接切 incident runbook |

## 5. 严重级别与处置链
| severity | owner chain | required action |
|---|---|---|
| `P0` | `L1-OPS -> IC-ADMIN -> L3-SUPERADMIN` | 立即接管、判断是否回滚、同步 incident note |
| `P1` | `L1-OPS -> L2-FINANCE/L3-SUPERADMIN -> IC-ADMIN` | `2h` 内定责并给出缓解或升级 |
| `P2` | `L1-OPS -> L2-FINANCE or L3-SUPERADMIN` | 当日处理并保留审计或台账 |
| `P3` | `L1-OPS` | 汇总到产品 / beta 池，不中断运行窗口 |

## 6. 交接规则
1. `L1-OPS` 必须负责把 case 录入 `docs/tracking/templates/support-case-intake-template.md` 或等效外部工单。
2. `L1-OPS` 升级给 `L2-FINANCE` 时，必须补齐：
- `order_id`
- `provider`
- `order_status`
- `paid_amount_cny`
- `refunded_amount_cny`
- 是否已需要 `entitlement_adjust`
3. `L1-OPS` 升级给 `L3-SUPERADMIN` 时，必须补齐：
- 用户影响面
- 是否需要冻结账号 / 内容下线 / 发布回滚
- 已查审计记录与报表证据
4. 一旦进入 incident 流程，不再用客服话术替代技术处置。

## 7. 不同问题的可执行动作边界
| action | L1-OPS | L2-FINANCE | L3-SUPERADMIN / IC-ADMIN |
|---|---|---|---|
| 查询用户状态 | Yes | Optional | Yes |
| 冻结 / 解冻用户 | Yes | No | Yes |
| 查询订单 | Yes | Yes | Yes |
| 调整权益 | No | Yes | Yes |
| 回滚权益调整 | No | Yes | Yes |
| 修改优惠券 | No | Yes | Yes |
| 发布 / 下线内容 | Yes | No | Yes |
| 批量导入 / 回滚内容 | Yes | No | Yes |
| 执行 release rollback | No | No | Yes |
| 直接发起退款 | No | No | No |
| 代用户删号 | No | No | No |
| 代 learner 提交 in-app beta feedback | No | No | No |

## 8. 班次最小要求
1. 任何 beta 窗口或发布窗口都必须至少同时有：
- `L1-OPS`
- `IC-ADMIN`
2. 涉及支付活动、优惠券活动或人工补偿窗口时，必须补上：
- `L2-FINANCE`
3. `L3-SUPERADMIN` 在 GA 前必须保持“可在 30 分钟内接入”的升级承诺。

## 9. 与现有文档关系
1. 账号、订单、beta、内容的标准支持流程基线：`docs/engineering/Support-Content-Ops-SOP.md`
2. 发布级事故与回滚基线：`docs/engineering/Production-Incident-Runbook.md`
3. 部署与回滚动作基线：`docs/engineering/Production-Deploy-Rollback-Runbook.md`
4. 外部受理模板：`docs/tracking/templates/support-case-intake-template.md`

## 10. 当前结论
1. 第 1 个最先动作已经冻结为角色级值班分工。
2. 在没有独立 support 角色前，`ops` 就是一线支持 owner。
3. 所有支付、退款和权益争议必须经过 `finance` 或 `super_admin`，不能由一线支持单人承诺。
