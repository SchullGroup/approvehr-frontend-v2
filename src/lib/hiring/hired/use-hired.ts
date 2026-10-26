"use client";

import { useCallback, useMemo } from "react";
import { ApiError } from "@/lib/api/client";
import { useSession } from "@/lib/store/session";
import { useLoaded } from "@/lib/use-loaded";
import { apiHiredGateway } from "./api-gateway";
import { settingsOf } from "./demo-ops";
import { demoHiredGateway } from "./demo-gateway";
import { useDemoHired } from "./demo-store";
import type { HiredGateway } from "./gateway";
import type { HiredSettings, OnOfferAccepted } from "./model";

/**
 * Which side the Hired list is talking to, and the company's own setting.
 *
 * `useHiredGateway` is the one place a screen learns whether it is connected.
 * Everything else takes the gateway and never asks, and a test replaces this module
 * to hand in a fake.
 */
export function useHiredGateway(): HiredGateway {
  const { isConnected } = useSession();
  return isConnected ? apiHiredGateway : demoHiredGateway;
}

export type HiredSettingsState = {
  settings: HiredSettings | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
  /** Throws the API's own sentence when it is refused. */
  save: (value: OnOfferAccepted) => Promise<HiredSettings>;
};

/**
 * What accepting an offer does here, and whether the company has Core HR.
 *
 * `enabled: false` asks nothing: a screen that only needs it in one state of its page
 * (the offer card, once an offer has been sent) does not ask on every visit.
 */
export function useHiredSettings(enabled = true): HiredSettingsState {
  const { isConnected } = useSession();
  const book = useDemoHired();
  const loaded = useLoaded<HiredSettings>(
    "hired-settings",
    isConnected && enabled,
    (signal) => apiHiredGateway.settings.get(signal),
  );

  const demo = useMemo<HiredSettings>(() => settingsOf(book), [book]);

  const save = useCallback(
    async (value: OnOfferAccepted) => {
      const gateway = isConnected ? apiHiredGateway : demoHiredGateway;
      const saved = await gateway.settings.set(value);
      if (isConnected) loaded.reload();
      return saved;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isConnected, loaded.reload],
  );

  if (!isConnected) {
    return {
      settings: demo,
      loading: false,
      error: null,
      reload: () => undefined,
      save,
    };
  }
  return {
    settings: loaded.data,
    loading: loaded.loading,
    error: loaded.error,
    reload: loaded.reload,
    save,
  };
}
