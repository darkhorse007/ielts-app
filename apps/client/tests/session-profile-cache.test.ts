import { beforeEach, describe, expect, test, vi } from "vitest";
import { clearCachedSessionProfile, loadCachedSessionProfile } from "../src/lib/session-profile-cache";

describe("session profile cache", () => {
  beforeEach(() => {
    clearCachedSessionProfile();
  });

  test("reuses the cached profile for the same access token", async () => {
    const getProfile = vi.fn().mockResolvedValue({
      id: "user-1",
      email: "ops@example.com",
      system_roles: ["learner", "ops"],
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const first = await loadCachedSessionProfile({ getProfile }, "access-token-1");
    const second = await loadCachedSessionProfile({ getProfile }, "access-token-1");

    expect(getProfile).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  test("clears the cached profile for a token when invalidated", async () => {
    const getProfile = vi
      .fn()
      .mockResolvedValueOnce({
        id: "user-1",
        email: "ops@example.com",
        system_roles: ["learner", "ops"],
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .mockResolvedValueOnce({
        id: "user-1",
        email: "ops@example.com",
        system_roles: ["learner", "admin"],
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    await loadCachedSessionProfile({ getProfile }, "access-token-1");
    clearCachedSessionProfile("access-token-1");
    const refreshed = await loadCachedSessionProfile({ getProfile }, "access-token-1");

    expect(getProfile).toHaveBeenCalledTimes(2);
    expect(refreshed.system_roles).toEqual(["learner", "admin"]);
  });
});
