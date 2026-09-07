"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  signaturesApi,
  type ApiSignature,
  type ApiSignatureStatus,
} from "@/lib/api/signatures";
import { useRevalidation } from "@/lib/revalidate";
import { useSession } from "./session";

/**
 * Signatures, connected only.
 *
 * ## No demo mode, and this is the clearest case in the product
 *
 * A demo signature would be a record saying a named person adopted a document,
 * with a hash and a timestamp on it, produced by nobody. That is a **forged
 * legal record** in appearance if not in intent, and it is the one artefact in
 * this codebase where a fabricated example could be mistaken for evidence.
 * `scripts/verify-demo.ts` exists to keep fabricated records out of a build;
 * this is that rule at its sharpest.
 */

const OFFLINE =
  "Signatures need the API. There is no demo version, deliberately: a " +
  "signature record says a named person adopted a particular document at a " +
  "particular moment, and a made-up one looks exactly like evidence.";

export type Read<T> = {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  available: boolean;
  refusal: string;
  reload: () => void;
};

function useRead<T>(
  key: string,
  active: boolean,
  load: (signal: AbortSignal) => Promise<T>,
): Read<T> {
  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    data: T | null;
    error: ApiError | null;
  } | null>(null);
  const full = `${key}|${String(tick)}`;

  const revalidation = useRevalidation();
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const data = await load(controller.signal);
        if (!cancelled) setFetched({ key: full, data, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            key: full,
            data: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [active, full, load, revalidation]);

  const fresh = fetched?.key === full;
  return {
    data: fresh ? fetched.data : null,
    loading: active && !fresh,
    error: fresh ? fetched.error : null,
    available: active,
    refusal: OFFLINE,
    reload: useCallback(() => {
      setTick((value) => value + 1);
    }, []),
  };
}

/** Waiting on the caller to sign. Their own queue; no permission decides it. */
export function useMySignatures(): Read<ApiSignature[]> {
  const { isConnected } = useSession();
  const load = useCallback((signal: AbortSignal) => signaturesApi.mine(signal), []);
  return useRead("mine", isConnected, load);
}

/** Everything the caller may see: theirs, ones they sent, or all with EDIT_RECORDS. */
export function useSignatures(status?: ApiSignatureStatus): Read<ApiSignature[]> {
  const { isConnected } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => signaturesApi.list(status, signal),
    [status],
  );
  return useRead(`list|${status ?? "all"}`, isConnected, load);
}

export function useSignatureMutations() {
  const { isConnected } = useSession();
  const guard = useCallback(() => {
    if (!isConnected) throw new ApiError(0, "offline", OFFLINE);
  }, [isConnected]);

  return {
    available: isConnected,
    refusal: OFFLINE,

    send: useCallback(
      async (body: Parameters<typeof signaturesApi.send>[0]) => {
        guard();
        return signaturesApi.send(body);
      },
      [guard],
    ),

    /**
     * Sign it.
     *
     * The refusals this can throw are the feature: not yours to sign, that is
     * not your name, or the document has changed. Every one is worth rendering
     * verbatim — especially the third, which is the only thing that tells
     * somebody the document they are looking at is not the one they were sent.
     */
    sign: useCallback(
      async (id: string, typedName: string) => {
        guard();
        return signaturesApi.sign(id, typedName);
      },
      [guard],
    ),

    decline: useCallback(
      async (id: string, reason: string) => {
        guard();
        return signaturesApi.decline(id, reason);
      },
      [guard],
    ),

    cancel: useCallback(
      async (id: string) => {
        guard();
        return signaturesApi.cancel(id);
      },
      [guard],
    ),
  };
}
