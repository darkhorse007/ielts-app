import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { buildServer } from "../src/app.js";

describe("S7 family duo subscription flow", () => {
  const nextEmail = () => `candidate-${crypto.randomUUID()}@example.com`;

  const build = async () => {
    const server = buildServer();
    await server.app.ready();
    return server;
  };

  let context: Awaited<ReturnType<typeof build>>;

  beforeEach(async () => {
    context = await build();
  });

  afterEach(async () => {
    await context.app.close();
  });

  const registerAndLogin = async () => {
    const email = nextEmail();
    const register = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "StrongPass123"
      }
    });
    expect(register.statusCode).toBe(201);

    const login = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: email,
        password: "StrongPass123",
        device_id: "ios"
      }
    });
    expect(login.statusCode).toBe(200);
    return login.json() as {
      user_id: string;
      access_token: string;
    };
  };

  test("supports family invitation management with seat isolation and over-capacity strategy", async () => {
    const owner = await registerAndLogin();
    const member = await registerAndLogin();
    const backup = await registerAndLogin();

    const upgrade = await context.app.inject({
      method: "POST",
      url: "/v1/subscription/upgrade",
      headers: {
        authorization: `Bearer ${owner.access_token}`
      },
      payload: {
        plan_code: "family_duo_monthly",
        provider: "mockpay"
      }
    });
    expect(upgrade.statusCode).toBe(201);
    expect(upgrade.json().plan_code).toBe("family_duo_monthly");

    const paid = await context.app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/provider",
      payload: {
        event_id: `evt-${randomUUID()}`,
        order_id: upgrade.json().order_id,
        status: "paid"
      }
    });
    expect(paid.statusCode).toBe(200);
    expect(paid.json().entitlement.tier).toBe("family_owner");

    const createInvitation = await context.app.inject({
      method: "POST",
      url: "/v1/subscription/family/invitations",
      headers: {
        authorization: `Bearer ${owner.access_token}`
      },
      payload: {
        invitee_user_id: member.user_id
      }
    });
    expect(createInvitation.statusCode).toBe(201);
    const invitationId = createInvitation.json().invitation_id as string;

    const acceptInvitation = await context.app.inject({
      method: "POST",
      url: `/v1/subscription/family/invitations/${invitationId}/accept`,
      headers: {
        authorization: `Bearer ${member.access_token}`
      }
    });
    expect(acceptInvitation.statusCode).toBe(200);
    expect(acceptInvitation.json().entitlement.tier).toBe("family_member");

    const memberEntitlement = await context.app.inject({
      method: "GET",
      url: "/v1/subscription/entitlement",
      headers: {
        authorization: `Bearer ${member.access_token}`
      }
    });
    expect(memberEntitlement.statusCode).toBe(200);
    expect(memberEntitlement.json().tier).toBe("family_member");

    const members = await context.app.inject({
      method: "GET",
      url: "/v1/subscription/family/members",
      headers: {
        authorization: `Bearer ${owner.access_token}`
      }
    });
    expect(members.statusCode).toBe(200);
    expect(members.json().group.used_seats).toBe(2);
    expect(members.json().members.length).toBe(2);

    const overCapacityInvitation = await context.app.inject({
      method: "POST",
      url: "/v1/subscription/family/invitations",
      headers: {
        authorization: `Bearer ${owner.access_token}`
      },
      payload: {
        invitee_user_id: backup.user_id
      }
    });
    expect(overCapacityInvitation.statusCode).toBe(409);
    expect(overCapacityInvitation.json().code).toBe("FAMILY_CAPACITY_EXCEEDED");

    const removeMember = await context.app.inject({
      method: "DELETE",
      url: `/v1/subscription/family/members/${member.user_id}`,
      headers: {
        authorization: `Bearer ${owner.access_token}`
      }
    });
    expect(removeMember.statusCode).toBe(200);
    expect(removeMember.json().group.used_seats).toBe(1);

    const afterRemovalEntitlement = await context.app.inject({
      method: "GET",
      url: "/v1/subscription/entitlement",
      headers: {
        authorization: `Bearer ${member.access_token}`
      }
    });
    expect(afterRemovalEntitlement.statusCode).toBe(200);
    expect(afterRemovalEntitlement.json().tier).toBe("free");
  });

  test("family member cannot directly cancel or resume owner subscription", async () => {
    const owner = await registerAndLogin();
    const member = await registerAndLogin();

    const upgrade = await context.app.inject({
      method: "POST",
      url: "/v1/subscription/upgrade",
      headers: {
        authorization: `Bearer ${owner.access_token}`
      },
      payload: {
        plan_code: "family_duo_monthly",
        provider: "mockpay"
      }
    });
    expect(upgrade.statusCode).toBe(201);

    await context.app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/provider",
      payload: {
        event_id: `evt-${randomUUID()}`,
        order_id: upgrade.json().order_id,
        status: "paid"
      }
    });

    const invitation = await context.app.inject({
      method: "POST",
      url: "/v1/subscription/family/invitations",
      headers: {
        authorization: `Bearer ${owner.access_token}`
      },
      payload: {
        invitee_user_id: member.user_id
      }
    });
    expect(invitation.statusCode).toBe(201);

    await context.app.inject({
      method: "POST",
      url: `/v1/subscription/family/invitations/${invitation.json().invitation_id}/accept`,
      headers: {
        authorization: `Bearer ${member.access_token}`
      }
    });

    const cancel = await context.app.inject({
      method: "POST",
      url: "/v1/subscription/cancel",
      headers: {
        authorization: `Bearer ${member.access_token}`
      }
    });
    expect(cancel.statusCode).toBe(409);
    expect(cancel.json().code).toBe("SUBSCRIPTION_MANAGED_BY_OWNER");

    const resume = await context.app.inject({
      method: "POST",
      url: "/v1/subscription/resume",
      headers: {
        authorization: `Bearer ${member.access_token}`
      }
    });
    expect(resume.statusCode).toBe(409);
    expect(resume.json().code).toBe("SUBSCRIPTION_MANAGED_BY_OWNER");
  });
});
