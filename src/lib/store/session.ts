"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { CURRENT_USER, EMPLOYEES, employeeById } from "@/lib/mock/people";
import { seedRolesFor } from "@/lib/mock/roles";
import type { Employee } from "@/lib/types";
import { SessionExpiredError, onAuthChange, tokens } from "@/lib/api/client";
import { auth, type ApiUser } from "@/lib/api/endpoints";

/**
 * Who is signed in.
 *
 * ## Two modes in a development build. One in production.
 *
 * **Connected** — the API is reachable and the user signed in with a password.
 * `signIn` calls `/auth/sign-in`, tokens are stored by the client, and
 * permissions come from the server. **This is the only mode a production build
 * has.**
 *
 * **Offline demo** — the API is not running. The store falls back to picking a
 * seeded employee with no password, exactly as it did before the backend
 * existed. That is not laziness: this product is demonstrated on laptops and
 * in meeting rooms without a database, and a product that cannot be shown
 * without infrastructure will not get shown.
 *
 * The mode is *detected*, never guessed, and the UI says which one it is. A demo
 * silently pretending to be connected would be the worst of both.
 *
 * ## This file is the root of the gate
 *
 * Every store in `lib/store/` decides what to serve from `isConnected`, so this
 * is the one place the demo can be switched off for everything at once. Behind
 * `DEMO_ENABLED` — a build-time constant, see `lib/demo.ts` — there is no
 * offline restore, no persona list and no `signInOffline` in a production build,
 * so `mode` can only ever be `"api"` and no store's demo branch is reachable.
 * The badges those branches used to need are gone with them.
 *
 * ## The hydration rule still applies
 *
 * `getSnapshot` returns `loading` until the client has read storage, because the
 * server has no localStorage and rendering "signed out" on the server then
 * "signed in" on the client is a hydration mismatch. See `lib/store/persisted.ts`
 * for the general form.
 */

export type SessionStatus = "loading" | "signed_in" | "signed_out";
export type SessionMode = "api" | "offline";

type State = {
  status: SessionStatus;
  mode: SessionMode;
  /** From the API when connected; derived from the seed when offline. */
  user: ApiUser | null;
  employeeId: string | null;
};

const LOADING: State = {
  status: "loading",
  mode: "api",
  user: null,
  employeeId: null,
};

const OFFLINE_KEY = "approvehr.session.offline";

let cache: State = LOADING;
let hydrated = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function set(next: State) {
  cache = next;
  notify();
}

/**
 * Restores a session on first subscribe.
 *
 * Order matters: a stored API token is tried first, because a real session
 * outranks a demo one. `/auth/me` is what proves the token is still good —
 * trusting its presence would leave a signed-out user looking signed in until
 * their first request failed.
 */
async function restore() {
  if (tokens.has()) {
    try {
      const me = await auth.me();
      set({
        status: "signed_in",
        mode: "api",
        user: me,
        employeeId: me.employeeId,
      });
      return;
    } catch (error) {
      if (!(error instanceof SessionExpiredError)) {
        /* Network failure rather than a bad token: the API is down but the
           token may be fine. Keep it and fall through to offline mode. */
      }
      tokens.clear();
    }
  }

  /* A demo session is only restorable in a build that has a demo. In production
     the whole block folds away, so a stored key from a development build on the
     same origin cannot resurrect one. */
  if (DEMO_ENABLED) {
    const offline = safeGet(OFFLINE_KEY);
    if (offline && employeeById(offline)) {
      set({
        status: "signed_in",
        mode: "offline",
        user: null,
        employeeId: offline,
      });
      return;
    }
  }

  set({ status: "signed_out", mode: "api", user: null, employeeId: null });
}

/**
 * Marks the session signed-in from a result the caller already has, without
 * going through `signIn` or waiting on `subscribe`'s restore-on-first-mount.
 *
 * For the one caller today outside `useSession()` that writes tokens itself:
 * `register-screen.tsx`. `tokens.set()` notifies `onAuthChange`, but that
 * listener (below) only reacts to tokens *disappearing* — and `hydrated` only
 * restores from storage the first time anything subscribes in this tab, which
 * has usually already happened by the time somebody reaches `/register`: the
 * sign-in gate they came from is itself `AuthGate`'s first subscribe. Without
 * this, `router.replace("/dashboard")` remounts `AuthGate` against a `cache`
 * still latched to that earlier `signed_out`, and a person who just created an
 * account is shown the sign-in screen again despite holding valid tokens.
 */
export function markSignedIn(user: ApiUser): void {
  safeRemove(OFFLINE_KEY);
  set({
    status: "signed_in",
    mode: "api",
    user,
    employeeId: user.employeeId,
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!hydrated) {
    hydrated = true;
    queueMicrotask(() => void restore());
  }
  /* Tokens can change from another tab, or from the client clearing them after a
     failed refresh. Either must re-render the gate. */
  const off = onAuthChange(() => {
    if (!tokens.has() && cache.mode === "api" && cache.status === "signed_in") {
      set({ status: "signed_out", mode: "api", user: null, employeeId: null });
    }
  });
  return () => {
    listeners.delete(listener);
    off();
  };
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* Private browsing. */
  }
}
function safeRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* Private browsing. */
  }
}

/**
 * One account on the offline sign-in screen.
 *
 * The role travels with the person because the picker is the one moment where
 * choosing an account *is* choosing a role: every screen afterwards behaves as
 * that person. It used to guess — anybody in the People department was labelled
 * "Full access", which was true of nobody in particular and wrong for the
 * Payroll officer, who holds a genuinely narrower set.
 */
export type SignInOption = {
  employee: Employee;
  /** From the demo seed. Empty for a persona in no role, which is not an error. */
  roles: { id: string; name: string }[];
};

/**
 * Accounts offered on the offline sign-in screen, the seed user first.
 *
 * Empty in a production build, where `EMPLOYEES` is empty and nothing calls
 * this: the sign-in screen's demo branch does not exist there.
 */
export function signInOptions(): SignInOption[] {
  if (!DEMO_ENABLED) return [];
  return [...EMPLOYEES]
    .sort((a, b) => {
      if (a.id === CURRENT_USER?.id) return -1;
      if (b.id === CURRENT_USER?.id) return 1;
      return a.firstName.localeCompare(b.firstName);
    })
    .map((employee) => ({ employee, roles: seedRolesFor(employee.id) }));
}

export function useSession() {
  const state = useSyncExternalStore(subscribe, () => cache, () => LOADING);

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      const user = await auth.signIn(email, password);
      set({
        status: "signed_in",
        mode: "api",
        user,
        employeeId: user.employeeId,
      });
      /* An API sign-in supersedes any demo session, so it does not linger. */
      safeRemove(OFFLINE_KEY);
    },
    [],
  );

  /**
   * The offline path. No password, and the UI says so.
   *
   * A no-op in a production build. Not merely unused — unreachable: the branch
   * folds away, so nothing that gets shipped can open a session with no
   * authentication behind it, whatever calls this.
   */
  const signInOffline = useCallback((employeeId: string): void => {
    if (!DEMO_ENABLED) return;
    safeSet(OFFLINE_KEY, employeeId);
    set({
      status: "signed_in",
      mode: "offline",
      user: null,
      employeeId,
    });
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    safeRemove(OFFLINE_KEY);
    if (cache.mode === "api") await auth.signOut();
    else tokens.clear();
    set({ status: "signed_out", mode: "api", user: null, employeeId: null });
  }, []);

  /* The employee record behind the session, for a name and a job title. When
     connected this is the seed record matching the id, which is correct because
     the seed mirrors the API's own fixture; a live directory lookup would be a
     request on every render. */
  const employee = state.employeeId
    ? employeeById(state.employeeId)
    : undefined;

  const displayName = state.user
    ? `${state.user.firstName} ${state.user.lastName}`
    : employee
      ? `${employee.firstName} ${employee.lastName}`
      : null;

  return {
    status: state.status,
    mode: state.mode,
    /**
     * ## `user` is an account. `employee` is a person on the payroll.
     *
     * They are different records with different ids, and both have `id`,
     * `firstName` and `lastName` — so TypeScript cannot tell you when you have
     * reached for the wrong one. It has already gone wrong once: four screens
     * wrote `user ?? CURRENT_USER` and used `.id` as an employee id, which is a
     * `User` id in connected mode and the seed default in demo mode.
     *
     * Rules:
     *   - Attributing an action to a person → `employeeId`
     *   - Showing a name → `displayName`
     *   - Anything about the account (email, permissions) → `user`
     */
    isLoading: state.status === "loading",
    isSignedIn: state.status === "signed_in",
    /** True when talking to the API rather than the seed data. */
    isConnected: state.mode === "api" && state.status === "signed_in",
    user: state.user,
    /**
     * The roles on the *account*, named. Empty in demo mode, where there is no
     * account — `useSessionRoles()` in `lib/roles.ts` is the hook that answers
     * for both modes and the one screens should use.
     *
     * Defaulted rather than read straight off `user`: the field is new, and an
     * API one deploy behind sends a user object without it. An undefined array
     * reaching `.map` is a blank screen; an empty one is a missing badge.
     */
    roles: state.user?.roles ?? [],
    employee,
    displayName,
    employeeId: state.employeeId,
    /**
     * Who to attribute an action to.
     *
     * Falls back to the seed persona in a demo build. In production there is no
     * seed, and the fallback is the empty string — which matches nobody, so a
     * "mine" filter returns nothing rather than somebody else's rows. That is
     * the honest answer: `employeeId` is only null for an account with no staff
     * record behind it, and such an account genuinely owns nothing.
     */
    actingId: state.employeeId ?? (DEMO_ENABLED ? (CURRENT_USER?.id ?? "") : ""),
    permissions: state.user?.permissions ?? [],
    /**
     * A demo session holds everything, because there is no account behind it to
     * hold a narrower set. In production the first clause folds to `false` and
     * the answer is the server's permission list and nothing else.
     */
    can: (permission: string) =>
      (DEMO_ENABLED && state.mode === "offline") ||
      (state.user?.permissions ?? []).includes(permission),
    signIn,
    signInOffline,
    signOut,
  };
}

/**
 * Whether the API answers, checked once per mount.
 *
 * Used by the sign-in screen to decide which path to offer, and by the shell to
 * show which mode you are in. Deliberately a hook with its own state rather than
 * part of the session store: it is a property of the environment, not of the
 * user, and it can change while the app is open.
 */
export function useApiReachable(): boolean | null {
  const [reachable, setReachable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { ping } = await import("@/lib/api/client");
      const ok = await ping();
      if (!cancelled) setReachable(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return reachable;
}
