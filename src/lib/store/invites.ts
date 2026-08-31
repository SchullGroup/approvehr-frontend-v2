"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  invitesApi,
  type CreateEmployeeForUserBody,
  type LinkedAccount,
  type PendingInvite,
  type SentInvite,
  type UnlinkedUser,
} from "@/lib/api/invites";
import { useSession } from "./session";
import { usePermissions } from "@/lib/permissions";
import { useRevalidation } from "@/lib/revalidate";

/**
 * Who has been invited to sign in, and has not yet accepted.
 *
 * No demo mirror, unlike almost every other store here. An invitation is a
 * real address getting a real, single-use link to a real account — there is
 * nothing honest to simulate in a browser with no mail transport and no
 * second person to accept it. `connected: false` renders as "this needs a
 * live API", the same way `profile-screen.tsx`'s own account-security card
 * already does for changing a password.
 */
export type InvitesState = {
  invites: PendingInvite[];
  loading: boolean;
  error: ApiError | null;
  connected: boolean;
  reload: () => void;
  send: (employeeId: string, roleIds: string[]) => Promise<SentInvite>;
  resend: (userId: string) => Promise<SentInvite>;
  revoke: (userId: string) => Promise<{ userId: string; email: string }>;
};

export function useInvites(): InvitesState {
  const { isConnected } = useSession();
  const { can, loading: permissionsLoading } = usePermissions();
  /*
   * `GET /invites` needs INVITE_STAFF, and only the Administrator holds it. So
   * five of the six seeded roles were firing a request that could only ever
   * come back 403 — and the panel rendered that refusal through `LoadFailure`,
   * which says "Invitations did not load" over the API's raw
   * "You need the following to do that: INVITE_STAFF."
   *
   * Three separate wrongs in one panel: a request nobody could answer, a
   * permission described as a breakage, and an enum name shown to a person.
   * Gating the fetch removes all three at once — with nothing fetched there is
   * no error to mis-render, and the panel falls through to its own empty state.
   *
   * A boolean, never `can` itself, in the dependency array: `can` is rebuilt
   * every render and putting it there is an infinite request loop. Same rule as
   * `store/grades.ts`, which carries the long version of this note.
   */
  const mayRead = can("INVITE_STAFF");
  const [state, setState] = useState<{
    invites: PendingInvite[];
    loading: boolean;
    error: ApiError | null;
  }>({ invites: [], loading: isConnected, error: null });

  const load = useCallback(async () => {
    if (!isConnected || permissionsLoading || !mayRead) {
      setState({ invites: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await invitesApi.list({ pageSize: 100 });
      setState({ invites: result.data, loading: false, error: null });
    } catch (error) {
      setState((s) => ({
        ...s,
        loading: false,
        error: error instanceof ApiError ? error : null,
      }));
    }
  }, [isConnected, permissionsLoading, mayRead]);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    void load();
  }, [load, revalidation]);

  const send = useCallback(
    async (employeeId: string, roleIds: string[]) => {
      const sent = await invitesApi.send(employeeId, roleIds);
      await load();
      return sent;
    },
    [load],
  );

  const resend = useCallback(
    async (userId: string) => {
      const sent = await invitesApi.resend(userId);
      await load();
      return sent;
    },
    [load],
  );

  const revoke = useCallback(
    async (userId: string) => {
      const result = await invitesApi.revoke(userId);
      await load();
      return result;
    },
    [load],
  );

  return {
    invites: state.invites,
    loading: state.loading,
    error: state.error,
    connected: isConnected,
    reload: load,
    send,
    resend,
    revoke,
  };
}

/**
 * Real sign-ins with no personnel record — `invitesApi.unlinked()`.
 *
 * No demo mirror, same reasoning as `useInvites`: these are real accounts
 * that already exist, not something a browser with no server can honestly
 * simulate. `link` and `createEmployee` are the two ways this list shrinks —
 * see `unlinked-accounts.tsx` for where both are offered.
 */
export type UnlinkedAccountsState = {
  accounts: UnlinkedUser[];
  loading: boolean;
  error: ApiError | null;
  connected: boolean;
  reload: () => void;
  link: (userId: string, employeeId: string) => Promise<LinkedAccount>;
  createEmployee: (
    userId: string,
    input: CreateEmployeeForUserBody,
  ) => Promise<LinkedAccount>;
};

/**
 * `enabled` should be the `MANAGE_ROLES` check — the same reasoning as
 * `useRepairs`'s: skip the request rather than collect a predictable 403 from
 * a screen somebody without the permission never should have called.
 */
export function useUnlinkedAccounts(enabled: boolean): UnlinkedAccountsState {
  const { isConnected } = useSession();
  const [state, setState] = useState<{
    accounts: UnlinkedUser[];
    loading: boolean;
    error: ApiError | null;
  }>({ accounts: [], loading: isConnected && enabled, error: null });

  const load = useCallback(async () => {
    if (!isConnected || !enabled) {
      setState({ accounts: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const rows = await invitesApi.unlinked();
      setState({ accounts: rows, loading: false, error: null });
    } catch (error) {
      setState((s) => ({
        ...s,
        loading: false,
        error: error instanceof ApiError ? error : null,
      }));
    }
  }, [isConnected, enabled]);

  const revalidation = useRevalidation();
  useEffect(() => {
    void load();
  }, [load, revalidation]);

  const link = useCallback(
    async (userId: string, employeeId: string) => {
      const linked = await invitesApi.linkEmployee(userId, employeeId);
      await load();
      return linked;
    },
    [load],
  );

  const createEmployee = useCallback(
    async (userId: string, input: CreateEmployeeForUserBody) => {
      const linked = await invitesApi.createEmployee(userId, input);
      await load();
      return linked;
    },
    [load],
  );

  return {
    accounts: state.accounts,
    loading: state.loading,
    error: state.error,
    connected: isConnected,
    reload: load,
    link,
    createEmployee,
  };
}
