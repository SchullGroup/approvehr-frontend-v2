import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiUser } from "@/lib/api/endpoints";

/**
 * `refreshSession` polls `/auth/me` every `pollMs` while the Pay screen
 * waits for a transfer to clear (see `pay-screen.tsx`). It used to call
 * `set({ ...cache, user: me })` unconditionally, which builds a brand-new
 * object even when the server answered with exactly the same data — and
 * `useSession()` reads the store through `useSyncExternalStore`, so every
 * consumer (including `AppShell`'s `visibleNav`, which depends on
 * `billing`) re-rendered on every tick regardless of whether anything
 * actually changed.
 *
 * These tests exercise the real store (not a mock of it) so the render
 * count is proof of whether `set()` ran, not an assumption about it.
 */

const me = vi.fn();

vi.mock("@/lib/api/endpoints", () => ({
  auth: { me: (...args: unknown[]) => me(...args) },
}));

/* No real token storage or cross-tab listener is wanted here — only that
   the very first `subscribe()` (inside the first `renderHook` below) settles
   restore() out of "loading" so `markSignedIn` is working from a quiet
   store. `tokens.has()` is false, so restore resolves to signed_out (demo
   mode has no offline key stored in a fresh jsdom), never touching `me`. */
vi.mock("@/lib/api/client", () => ({
  SessionExpiredError: class SessionExpiredError extends Error {},
  onAuthChange: () => () => {},
  tokens: {
    has: () => false,
    access: () => null,
    refresh: () => null,
    set: () => {},
    clear: () => {},
  },
}));

const { markSignedIn, refreshSession, useSession } =
  await import("@/lib/store/session");

const USER: ApiUser = {
  id: "user-1",
  email: "ada@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
  organizationId: "org-1",
  employeeId: "emp-1",
  permissions: ["VIEW_SALARIES"],
  roles: [{ id: "role-1", name: "Owner" }],
  tourDismissedAt: null,
};

/** A content-identical object with no shared references, so an `===` or
 * `Object.is` check could never mask the comparison this fix needs to do
 * structurally. */
function freshCopy(user: ApiUser): ApiUser {
  return JSON.parse(JSON.stringify(user)) as ApiUser;
}

beforeEach(() => {
  me.mockReset();
});

describe("refreshSession", () => {
  it("does not notify store listeners when /auth/me returns identical data", async () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useSession();
    });
    await waitFor(() => expect(result.current.status).not.toBe("loading"));

    act(() => {
      markSignedIn(USER);
    });
    expect(result.current.user).toEqual(USER);

    renders = 0;
    me.mockImplementation(() => Promise.resolve(freshCopy(USER)));

    await act(async () => {
      await refreshSession();
    });
    expect(renders).toBe(0);

    /* A second call, still against the same unchanged data. */
    await act(async () => {
      await refreshSession();
    });
    expect(renders).toBe(0);
  });

  it("notifies store listeners when /auth/me returns changed data", async () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useSession();
    });
    await waitFor(() => expect(result.current.status).not.toBe("loading"));

    act(() => {
      markSignedIn(USER);
    });
    expect(result.current.user).toEqual(USER);

    renders = 0;
    me.mockImplementation(() =>
      Promise.resolve({ ...freshCopy(USER), lastName: "Byron" }),
    );

    await act(async () => {
      await refreshSession();
    });
    expect(renders).toBe(1);
    expect(result.current.user?.lastName).toBe("Byron");
  });
});
