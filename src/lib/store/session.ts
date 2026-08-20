"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { CURRENT_USER, EMPLOYEES, employeeById } from "@/lib/mock/people";
import type { Employee } from "@/lib/types";
import { SessionExpiredError, onAuthChange, tokens } from "@/lib/api/client";
import { auth, type ApiUser } from "@/lib/api/endpoints";

/**
 * Who is signed in.
 *
 * ## Two modes, on purpose
 *
 * **Connected** — the API is reachable and the user signed in with a password.
 * `signIn` calls `/auth/sign-in`, tokens are stored by the client, and
 * permissions come from the server.
 *
 * **Offline demo** — the API is not running. The store falls back to picking a
 * seeded employee with no password, exactly as it did before the backend
 * existed. That is not laziness: this prototype is demonstrated on laptops and
 * in meeting rooms without a database, and a product that cannot be shown
 * without infrastructure will not get shown.
 *
 * The mode is *detected*, never guessed, and the UI says which one it is. A demo
 * silently pretending to be connected would be the worst of both.
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

  set({ status: "signed_out", mode: "api", user: null, employeeId: null });
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

/** Accounts offered on the offline sign-in screen, the seed user first. */
export function signInOptions(): Employee[] {
  return [...EMPLOYEES].sort((a, b) => {
    if (a.id === CURRENT_USER.id) return -1;
    if (b.id === CURRENT_USER.id) return 1;
    return a.firstName.localeCompare(b.firstName);
  });
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

  /** The offline path. No password, and the UI says so. */
  const signInOffline = useCallback((employeeId: string): void => {
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
    employee,
    displayName,
    employeeId: state.employeeId,
    /** Who to attribute an action to. Falls back to the seed user. */
    actingId: state.employeeId ?? CURRENT_USER.id,
    permissions: state.user?.permissions ?? [],
    can: (permission: string) =>
      state.mode === "offline" || (state.user?.permissions ?? []).includes(permission),
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
