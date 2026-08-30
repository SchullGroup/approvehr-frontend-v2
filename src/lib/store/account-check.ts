"use client";

import { useEffect, useMemo, useState } from "react";
import { paymentsApi, type ApiDirectoryBank } from "@/lib/api/payments";
import { NIGERIAN_BANKS } from "@/lib/reference/banks";
import { useRevalidation } from "@/lib/revalidate";
import { useDebounced } from "@/lib/use-debounced";
import { useSession } from "./session";

/**
 * Confirming an account number belongs to the name somebody typed.
 *
 * ## Why the picker is not this list
 *
 * There are two bank lists and they are not interchangeable.
 * `lib/reference/banks.ts` holds **255** banks from Paystack's public register
 * and is what somebody chooses from. `GET /payments/banks` holds **48**, and is
 * the only set the account check will accept a code for.
 *
 * Swapping the picker to the API's list would drop Moniepoint, PalmPay, ALAT by
 * WEMA, Carbon and FairMoney — where a large share of Nigerian SME staff hold
 * the account their salary goes to. Somebody whose bank is missing from a
 * picker cannot be paid at all, which is a far worse failure than an account
 * nobody could confirm.
 *
 * So the picker keeps its 255, and the directory answers one narrower question:
 * *can this bank's account be confirmed?* Where it cannot, the screen says which
 * bank and why, rather than implying the check is broken.
 *
 * ## Matched by code, never by name
 *
 * `NIGERIAN_BANKS[].code` is the **CBN** code — `Guaranty Trust Bank` is `058`
 * in both lists — so the two are joined on the identifier rather than on a
 * string somebody spelled. That matters more than tidiness here: the API's own
 * refusal warns that the NIBSS code and the CBN code look alike and that sending
 * the wrong one returns a confirmation *for an account at a different bank*.
 * Name matching would have the same shape of failure with none of the warning.
 */

/** The banks whose accounts this API will confirm, by CBN code. */
export function useVerifiableBanks(): {
  codes: ReadonlySet<string>;
  loading: boolean;
  /** The directory itself could not be read. Different from an empty one. */
  unavailable: boolean;
} {
  const { isConnected } = useSession();
  /* One line, and it earns itself: the list changes a handful of times a year,
     so a tab left open through a backend fix picks up a bank that was missing
     when it was opened. */
  const revalidation = useRevalidation();
  const [rows, setRows] = useState<ApiDirectoryBank[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isConnected) return;
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      try {
        const data = await paymentsApi.banks(controller.signal);
        if (!cancelled) {
          setRows(data);
          setFailed(false);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, revalidation]);

  const codes = useMemo(
    () => new Set((rows ?? []).map((bank) => bank.cbnCode)),
    [rows],
  );

  return {
    codes,
    loading: isConnected && rows === null && !failed,
    unavailable: failed || !isConnected,
  };
}

/** The CBN code for a bank the picker offers, or null if it offers no such name. */
export function codeForBankName(name: string): string | null {
  const wanted = name.trim().toLowerCase();
  return (
    NIGERIAN_BANKS.find((bank) => bank.label.toLowerCase() === wanted)?.code ??
    null
  );
}

/**
 * What a check came back as.
 *
 * **Five states, and four of them are not "wrong".** The one that matters is
 * `unavailable`: the API answers 200 with `checked: false` when no payment
 * provider is connected — which is the state this product ships in — and adds
 * "It can still be saved". Rendering that as a failure would put a red mark
 * against an account that is perfectly fine, on every company that has not
 * credentialed a provider. That is most of them.
 */
export type AccountCheck =
  /** Nothing to check yet: no bank chosen, or fewer than ten digits. */
  | { kind: "idle" }
  | { kind: "checking" }
  /** The bank confirmed a name. It may still not be the name that was typed. */
  | { kind: "confirmed"; accountName: string }
  /** The bank was asked and said no such account. */
  | { kind: "wrong"; reason: string }
  /** Nobody was asked. Not a fault, and not a reason to stop. */
  | { kind: "unavailable"; reason: string }
  /** This API holds no code for that bank, so it cannot ask. See BE-9. */
  | { kind: "bank-unknown"; bankName: string };

const IDLE: AccountCheck = { kind: "idle" };

/**
 * Check an account as it is typed.
 *
 * Debounced, and the answer is matched against the **live** key rather than the
 * debounced one — the trap `use-debounced.ts` describes in its own header. Here
 * it would be worse than a stale figure: last account number's name, sitting
 * under this account number, reads as a confirmation of the wrong account.
 */
export function useAccountCheck(
  bankName: string,
  accountNumber: string,
  delay = 500,
): AccountCheck {
  const { isConnected } = useSession();
  const directory = useVerifiableBanks();

  const digits = accountNumber.replace(/\D/g, "");
  const code = bankName.trim() ? codeForBankName(bankName) : null;
  const ready = isConnected && code !== null && digits.length === 10;

  /* Whether this bank can be asked about at all. Null while the directory is
     still arriving — "we hold no code for that bank" must not be the answer for
     every bank for the first half second. */
  const askable =
    code === null || directory.loading
      ? null
      : directory.unavailable || directory.codes.has(code);

  /* One string, so a change to either half is one dependency. */
  const key = ready ? `${code ?? ""}:${digits}` : null;
  const settled = useDebounced(key, delay);
  /* Not merely hidden behind a render-time branch — NOT SENT.
     The first version guarded only the returned state, so a bank the directory
     does not hold still fired the request, collected a 422 and rendered the
     right sentence over the top of it. A screen that has already decided what
     to show must not ask the question anyway; that is the defect this codebase
     keeps finding, and it does not stop being one because the answer happens
     to be discarded. */
  const wanted = askable === true ? settled : null;

  const [result, setResult] = useState<{
    key: string;
    check: AccountCheck;
  } | null>(null);

  useEffect(() => {
    if (wanted === null) return;
    const [wantedCode = "", wantedNumber = ""] = wanted.split(":");
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      const settle = (check: AccountCheck) => {
        if (!cancelled) setResult({ key: wanted, check });
      };
      try {
        const data = await paymentsApi.verifyAccount(
          { bankCode: wantedCode, accountNumber: wantedNumber },
          controller.signal,
        );
        if (!data.checked) {
          settle({
            kind: "unavailable",
            reason:
              data.reason ??
              "Nobody could be asked to confirm this account. It can still be saved.",
          });
          return;
        }
        settle(
          data.verified && data.accountName
            ? { kind: "confirmed", accountName: data.accountName }
            : {
                kind: "wrong",
                reason:
                  data.reason ??
                  "The bank does not hold an account with that number.",
              },
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        /* Any refusal is "could not check", never "wrong". A 422 here is the
           API telling us about our own request — the code was one it does not
           hold — and saying "that account number is wrong" on the strength of
           it would accuse somebody of a typo they did not make. */
        settle({
          kind: "unavailable",
          reason:
            "The account could not be checked just now. It can still be saved.",
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [wanted]);

  if (!isConnected) return IDLE;
  /* A bank this API holds no code for can never be checked, so there is nothing
     to wait for — and, per `wanted` above, nothing was sent. */
  if (askable === false) return { kind: "bank-unknown", bankName };
  if (key === null) return IDLE;

  /* The LIVE key. See the header. */
  return result !== null && result.key === key
    ? result.check
    : { kind: "checking" };
}
