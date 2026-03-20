import { useState } from "react";
import type { ApiClient } from "../lib/api-client";
import { TokenStorage } from "../lib/token-storage";

type SubscriptionPageProps = {
  apiClient: Pick<
    ApiClient,
    | "getEntitlement"
    | "upgradeSubscription"
    | "cancelSubscription"
    | "resumeSubscription"
    | "sendPaymentWebhook"
    | "createFamilyInvitation"
    | "acceptFamilyInvitation"
    | "getFamilyMembers"
    | "removeFamilyMember"
  >;
  tokenStorage: TokenStorage;
};

export const SubscriptionPage = ({ apiClient, tokenStorage }: SubscriptionPageProps) => {
  const [status, setStatus] = useState("未开始");
  const [entitlementText, setEntitlementText] = useState("-");
  const [orderFinanceText, setOrderFinanceText] = useState("-");
  const [orderId, setOrderId] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [inviteeUserId, setInviteeUserId] = useState("");
  const [familyInvitationId, setFamilyInvitationId] = useState("");
  const [removeMemberUserId, setRemoveMemberUserId] = useState("");
  const [familyText, setFamilyText] = useState("-");
  const [error, setError] = useState<string | null>(null);

  const withToken = (): string => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      throw new Error("会话已失效，请重新登录");
    }
    return accessToken;
  };

  const formatOrderFinance = (order: {
    list_price_cny: number;
    discount_cny: number;
    payable_amount_cny: number;
    paid_amount_cny: number;
    refunded_amount_cny: number;
    coupon_code?: string;
  }): string =>
    [
      `list=${order.list_price_cny}`,
      `discount=${order.discount_cny}`,
      `payable=${order.payable_amount_cny}`,
      `paid=${order.paid_amount_cny}`,
      `refunded=${order.refunded_amount_cny}`,
      `coupon=${order.coupon_code ?? "-"}`
    ].join("; ");

  const loadEntitlement = async (): Promise<void> => {
    try {
      const entitlement = await apiClient.getEntitlement(withToken(), "ios");
      setEntitlementText(
        `tier=${entitlement.tier}; status=${entitlement.status}; remaining=${entitlement.remaining_today}; version=${entitlement.version}`
      );
      setStatus("已加载权益");
      setError(null);
    } catch (entitlementError) {
      setError(entitlementError instanceof Error ? entitlementError.message : "加载权益失败");
    }
  };

  const upgrade = async (): Promise<void> => {
    try {
      const order = await apiClient.upgradeSubscription(withToken(), {
        plan_code: "pro_monthly",
        provider: "mockpay",
        coupon_code: couponCode.trim() ? couponCode.trim() : undefined
      });
      setOrderId(order.order_id);
      setOrderFinanceText(formatOrderFinance(order));
      setStatus("已创建升级订单，待支付回调");
      setError(null);
    } catch (upgradeError) {
      setError(upgradeError instanceof Error ? upgradeError.message : "升级失败");
    }
  };

  const upgradeFamily = async (): Promise<void> => {
    try {
      const order = await apiClient.upgradeSubscription(withToken(), {
        plan_code: "family_duo_monthly",
        provider: "mockpay",
        coupon_code: couponCode.trim() ? couponCode.trim() : undefined
      });
      setOrderId(order.order_id);
      setOrderFinanceText(formatOrderFinance(order));
      setStatus("已创建家庭双人计划订单，待支付回调");
      setError(null);
    } catch (upgradeError) {
      setError(upgradeError instanceof Error ? upgradeError.message : "家庭升级失败");
    }
  };

  const webhookPaid = async (): Promise<void> => {
    if (!orderId) {
      setError("请先创建升级订单");
      return;
    }
    try {
      const result = await apiClient.sendPaymentWebhook({
        event_id: `evt-${Date.now()}`,
        order_id: orderId,
        status: "paid",
        provider_order_id: "provider-001"
      });
      setEntitlementText(`tier=${result.entitlement.tier}; status=${result.entitlement.status}`);
      setOrderFinanceText(formatOrderFinance(result.order));
      setStatus("支付成功回调已处理");
      setError(null);
    } catch (webhookError) {
      setError(webhookError instanceof Error ? webhookError.message : "支付回调失败");
    }
  };

  const webhookRefund = async (): Promise<void> => {
    if (!orderId) {
      setError("请先创建升级订单");
      return;
    }
    try {
      const result = await apiClient.sendPaymentWebhook({
        event_id: `evt-refund-${Date.now()}`,
        order_id: orderId,
        status: "refunded",
        provider_order_id: "provider-001"
      });
      setEntitlementText(`tier=${result.entitlement.tier}; status=${result.entitlement.status}`);
      setOrderFinanceText(formatOrderFinance(result.order));
      setStatus("退款回调已处理");
      setError(null);
    } catch (webhookError) {
      setError(webhookError instanceof Error ? webhookError.message : "退款回调失败");
    }
  };

  const createFamilyInvitation = async (): Promise<void> => {
    if (!inviteeUserId.trim()) {
      setError("请填写被邀请用户ID");
      return;
    }
    try {
      const result = await apiClient.createFamilyInvitation(withToken(), {
        invitee_user_id: inviteeUserId.trim()
      });
      setFamilyInvitationId(result.invitation_id);
      setFamilyText(
        `group=${result.group.group_id}; seats=${result.group.used_seats}/${result.group.seat_limit}; members=${result.group.member_user_ids.length}`
      );
      setStatus("已创建家庭邀请");
      setError(null);
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "创建家庭邀请失败");
    }
  };

  const acceptFamilyInvitation = async (): Promise<void> => {
    if (!familyInvitationId.trim()) {
      setError("请填写 invitation_id");
      return;
    }
    try {
      const result = await apiClient.acceptFamilyInvitation(withToken(), familyInvitationId.trim());
      setFamilyText(
        `group=${result.group.group_id}; seats=${result.group.used_seats}/${result.group.seat_limit}; members=${result.group.member_user_ids.length}`
      );
      setEntitlementText(
        result.entitlement
          ? `tier=${result.entitlement.tier}; status=${result.entitlement.status}; remaining=${result.entitlement.remaining_today}; version=${result.entitlement.version}`
          : entitlementText
      );
      setStatus("已接受家庭邀请");
      setError(null);
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "接受邀请失败");
    }
  };

  const loadFamilyMembers = async (): Promise<void> => {
    try {
      const result = await apiClient.getFamilyMembers(withToken());
      setFamilyText(
        `group=${result.group.group_id}; seats=${result.group.used_seats}/${result.group.seat_limit}; members=${result.group.member_user_ids.length}`
      );
      setStatus(`已加载家庭成员 ${result.members.length} 人`);
      setError(null);
    } catch (membersError) {
      setError(membersError instanceof Error ? membersError.message : "加载家庭成员失败");
    }
  };

  const removeFamilyMember = async (): Promise<void> => {
    if (!removeMemberUserId.trim()) {
      setError("请填写移除成员用户ID");
      return;
    }
    try {
      const result = await apiClient.removeFamilyMember(withToken(), removeMemberUserId.trim());
      setFamilyText(
        `group=${result.group.group_id}; seats=${result.group.used_seats}/${result.group.seat_limit}; members=${result.group.member_user_ids.length}`
      );
      setStatus(`已移除成员 ${result.removed_user_id}`);
      setError(null);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "移除家庭成员失败");
    }
  };

  const cancel = async (): Promise<void> => {
    try {
      const entitlement = await apiClient.cancelSubscription(withToken());
      setEntitlementText(`tier=${entitlement.tier}; status=${entitlement.status}`);
      setStatus("已取消续费");
      setError(null);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "取消续费失败");
    }
  };

  const resume = async (): Promise<void> => {
    try {
      const entitlement = await apiClient.resumeSubscription(withToken());
      setEntitlementText(`tier=${entitlement.tier}; status=${entitlement.status}`);
      setStatus("已恢复续费");
      setError(null);
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : "恢复续费失败");
    }
  };

  return (
    <section>
      <h1>订阅与权益</h1>
      {error ? <p role="alert">{error}</p> : null}

      <button type="button" onClick={() => void loadEntitlement()}>
        加载权益
      </button>
      <label htmlFor="coupon-code">优惠券码</label>
      <input
        id="coupon-code"
        value={couponCode}
        onChange={(event) => setCouponCode(event.target.value)}
        placeholder="例如 IELTS20"
      />
      <button type="button" onClick={() => void upgrade()}>
        创建升级订单
      </button>
      <button type="button" onClick={() => void upgradeFamily()}>
        创建家庭双人计划订单
      </button>
      <button type="button" onClick={() => void webhookPaid()}>
        模拟支付成功回调
      </button>
      <button type="button" onClick={() => void webhookRefund()}>
        模拟退款回调
      </button>
      <button type="button" onClick={() => void cancel()}>
        取消续费
      </button>
      <button type="button" onClick={() => void resume()}>
        恢复续费
      </button>

      <h2>家庭双人计划</h2>
      <label htmlFor="invitee-user-id">被邀请用户ID</label>
      <input
        id="invitee-user-id"
        value={inviteeUserId}
        onChange={(event) => setInviteeUserId(event.target.value)}
        placeholder="invitee user_id"
      />
      <button type="button" onClick={() => void createFamilyInvitation()}>
        创建家庭邀请
      </button>

      <label htmlFor="family-invitation-id">邀请ID</label>
      <input
        id="family-invitation-id"
        value={familyInvitationId}
        onChange={(event) => setFamilyInvitationId(event.target.value)}
        placeholder="invitation_id"
      />
      <button type="button" onClick={() => void acceptFamilyInvitation()}>
        接受家庭邀请
      </button>
      <button type="button" onClick={() => void loadFamilyMembers()}>
        加载家庭成员
      </button>

      <label htmlFor="remove-member-user-id">移除成员用户ID</label>
      <input
        id="remove-member-user-id"
        value={removeMemberUserId}
        onChange={(event) => setRemoveMemberUserId(event.target.value)}
        placeholder="member user_id"
      />
      <button type="button" onClick={() => void removeFamilyMember()}>
        移除家庭成员
      </button>

      <p>order_id: {orderId || "-"}</p>
      <p>order_finance: {orderFinanceText}</p>
      <p>family: {familyText}</p>
      <p>entitlement: {entitlementText}</p>
      <p>status: {status}</p>
    </section>
  );
};
