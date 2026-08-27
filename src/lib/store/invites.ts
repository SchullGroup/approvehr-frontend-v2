"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  invitesApi,
  type ApiPendingInvite,
  type ApiSentInvite,
} from "@/lib/api/invites";
import { useSession } from "./session";

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
  invites: ApiPendingInvite[];
  loading: boolean;
  error: ApiError | null;
  connected: boolean;
  reload: () => void;
  send: (employeeId: string, roleIds: string[]) => Promise<ApiSentInvite>;
  resend: (userId: string) => Promise<ApiSentInvite>;
  revoke: (userId: string) => Promise<{ userId: string; email: string }>;
};

export function useInvites(): InvitesState {
  const { isConnected } = useSession();
  const [state, setState] = useState<{
    invites: ApiPendingInvite[];
    loading: boolean;
    error: ApiError | null;
  }>({ invites: [], loading: isConnected, error: null });

  const load = useCallback(async () => {
    if (!isConnected) {
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
  }, [isConnected]);

  useEffect(() => {
    void load();
  }, [load]);

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
