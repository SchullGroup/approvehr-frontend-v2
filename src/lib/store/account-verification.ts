"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { paymentsApi, type ApiAccountVerification } from "@/lib/api/payments";
import { useDebounced } from "@/lib/use-debounced";
import { useSession } from "./session";

/**
 * Confirming whose name is on an account, once a bank and a number are both
 * in — BE-10.
 *
 * ## A name in, never a code
 *
 * Every bank picker in this product already collects a **name** — that is
 * Nigeria's own convention, not a gap this hook fills. `bankName` is sent
 * exactly as picked; resolving it to whatever a provider needs happens on the
 * API (`banks.ts#bankByName`), so this file never needs the backend's own,
 * much shorter, bank list, and no picker anywhere changes because of it.
 *
 * ## Absent with no API, not a spinner that never resolves
 *
 * There is no provider to ask in demo mode, so this returns nothing at all
 * rather than a permanent "Checking…" — the same rule `useAssistantAvailable`
 * follows for the same reason: a control that never answers teaches people
 * the product is broken.
 *
 * ## Staleness
 *
 * Same shape as `usePayslipQuote`: the request is sent for the *debounced*
 * pair and the answer is matched against the *live* one, so a name resolved
 * for a digit that has since been backspaced never sits on screen wearing the
 * current input's label.
 */

export type AccountVerificationState = {
  result: ApiAccountVerification | null;
  loading: boolean;
};

const IDLE: AccountVerificationState = { result: null, loading: false };

/** The same shape `schemas.ts`'s `accountNumber` accepts on the API. */
function isNuban(value: string): boolean {
  return /^\d{10}$/.test(value);
}

/**
 * @param bankName As picked from this product's own bank list. Empty or
 *   `null` means nothing is chosen yet.
 * @param accountNumber Whatever is in the field so far, spaces and hyphens
 *   forgiven — this checks the shape itself, so a caller does not have to
 *   gate on validity twice.
 */
export function useAccountVerification(
  bankName: string | null,
  accountNumber: string | null,
  delay = 600,
): AccountVerificationState {
  const { isConnected, isLoading } = useSession();
  const [result, setResult] = useState<{
    key: string;
    data: ApiAccountVerification | null;
  } | null>(null);

  const name = bankName?.trim() ?? "";
  const digits = (accountNumber ?? "").replace(/[\s-]/g, "");
  const ready = isConnected && !isLoading && name.length >= 2 && isNuban(digits);
  const key = ready
    ? JSON.stringify({ bankName: name, accountNumber: digits })
    : null;
  const settled = useDebounced(key, delay);

  useEffect(() => {
    if (settled === null) return;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const body = JSON.parse(settled) as {
          bankName: string;
          accountNumber: string;
        };
        const data = await paymentsApi.verifyAccount(body, controller.signal);
        if (!cancelled) setResult({ key: settled, data });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        /* A network hiccup here is the same fact as the API's own
           `checked: false` — nothing could be confirmed, and the account is
           still perfectly saveable. */
        if (!cancelled) {
          setResult({
            key: settled,
            data: {
              checked: false,
              verified: false,
              accountName: null,
              reason:
                error instanceof ApiError
                  ? error.message
                  : "Could not check this account right now.",
            },
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      /* A name resolved for an account nobody is looking at any more is
         bandwidth spent confirming a stale question. */
      controller.abort();
    };
  }, [settled]);

  if (!ready) return IDLE;

  /* Matched against the LIVE key, never the debounced one — see the note
     above. */
  const matched = result !== null && result.key === key;
  return {
    result: matched ? result.data : null,
    loading: !matched,
  };
}
