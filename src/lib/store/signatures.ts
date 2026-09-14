"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  signaturesApi,
  type ApiSignature,
  type ApiSignatureStatus,
} from "@/lib/api/signatures";
import { useRevalidation } from "@/lib/revalidate";
import { createSharedResource } from "@/lib/shared-resource";
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
        if (error instanceof DOMException && error.name === "AbortError")
          return;
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
  const load = useCallback(
    (signal: AbortSignal) => signaturesApi.mine(signal),
    [],
  );
  return useRead("mine", isConnected, load);
}

/** Everything the caller may see: theirs, ones they sent, or all with EDIT_RECORDS. */
export function useSignatures(
  status?: ApiSignatureStatus,
): Read<ApiSignature[]> {
  const { isConnected } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => signaturesApi.list(status, signal),
    [status],
  );
  const sessionKey = useSignatureCacheKey();
  const read = useRead(`list|${status ?? "all"}`, isConnected, load);

  /* Tell the sidebar what this already knows.
     ------------------------------------------------------------------
     `anySignature` does not revalidate on focus — see
     `lib/shared-resource.ts`, which argues that for facts changing when an
     administrator edits a role. This one changes when a colleague presses
     Send, so a person following a notification link could stand on this
     screen reading their contract while the nav had no row for it. The
     screen is not blocked by that and it looks like a bug.
     
     No extra request: this **is** the same endpoint's answer, which is the
     one thing `set` is for. Unfiltered only — a `status` narrows the rows,
     and publishing "you have none" off a filtered read would be a guess. */
  const filtered = status !== undefined;
  useEffect(() => {
    if (filtered || read.data === null) return;
    anySignature.set(sessionKey, read.data.length);
  }, [filtered, read.data, sessionKey]);

  return read;
}

/**
 * Whether this person has any signature at all — one fact about them, cached
 * for the session.
 *
 * ## Why the sidebar needs it
 *
 * The nav entry was `always: true`, with a reason that was sound as far as it
 * went: whether somebody has a document to sign is a property of the rows, and
 * no `useCan` can answer it. The conclusion drawn was to show the row to
 * everybody — so an employee with nothing to sign, and no permission to send,
 * carried a permanent door to an empty screen. That was half of *"it is just
 * showing at the side bar for both HR and Employee"*.
 *
 * Row-level is not unanswerable. Ask the rows.
 *
 * ## What counts, and why not just the pending queue
 *
 * `GET /signatures` rather than `/signatures/mine`: for somebody without
 * `EDIT_RECORDS` the API narrows it to rows where they are the signer or the
 * requester, in any state. So a person who signed their contract in March
 * keeps the row in September — they need to reach the document and its
 * certificate, which is exactly when somebody looks for it. `/mine` is only
 * the pending queue and would take the row away the moment they signed.
 *
 * ## Shared, and skipped for anybody who can send
 *
 * `createSharedResource` for the reason `directReports` uses it: the sidebar,
 * the mobile sheet and the command palette all ask, and it is one fact however
 * many of them do. The shell passes a `null` key when the reader holds
 * `EDIT_RECORDS` — they get the row on that ground alone, because they can
 * send, so the request is not worth making.
 *
 * `null` reads as *no*: an item that appears a moment late beats one that
 * appears and is taken away under somebody's pointer.
 *
 * ## What the number is, exactly
 *
 * **Rows `/signatures` returns to this session** — not "rows about me". The
 * two differ for somebody holding `EDIT_RECORDS`, for whom the endpoint
 * returns the whole company. That is not a defect and it is not read: the
 * shell answers the nav from the permission for those people and passes a
 * `null` key here. And were it read, `> 0` would still be the right answer to
 * the question being asked — is there anything in this module for you.
 *
 * The distinction matters for the write in `useSignatures`, which is why the
 * name of the resource is deliberately about signatures rather than about
 * "mine".
 */
const anySignature = createSharedResource<number>((_employeeId, signal) =>
  /* No id parameter — the endpoint scopes itself to the token's own claims.
     The key exists so signing in as somebody else does not inherit the last
     person's answer. */
  signaturesApi.list(undefined, signal).then((rows) => rows.length),
);

/**
 * The cache key for `anySignature`.
 *
 * The account id as well as the employee id, because the API counts rows this
 * person *sent* too — and an account with no staff record can have sent one.
 * Keyed on the employee alone, every such account would share one entry and
 * read each other's answer.
 */
function useSignatureCacheKey(): string {
  const { employeeId, user } = useSession();
  return `${user?.id ?? "none"}|${employeeId ?? "none"}`;
}

/** True when this person has at least one. See `anySignature`. */
export function useHaveIAnySignatures(enabled: boolean): boolean {
  const { isConnected } = useSession();
  const key = useSignatureCacheKey();
  const count = anySignature.use(isConnected && enabled ? key : null);
  return count !== null && count > 0;
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
