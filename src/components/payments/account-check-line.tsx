"use client";

import { AlertTriangle, Check, Info, Loader2 } from "lucide-react";
import type { AccountCheck } from "@/lib/store/account-check";

/**
 * One line under an account-number field, saying what the bank said.
 *
 * ## It never blocks a save
 *
 * Every caller keeps its own validation exactly as it was. The API's own words
 * are "It can still be saved", and that is not a caveat — a company with no
 * payment provider connected, which is most of them today, would otherwise be
 * unable to record anybody's bank details at all.
 *
 * ## "Could not check" is not a warning
 *
 * The state that is easy to get wrong is `unavailable`. Nobody was asked; the
 * account is not suspect. Rendering it in amber would put a mark against every
 * account on every company without a provider, which teaches people to ignore
 * the line — and then the one that says *wrong* gets ignored too.
 *
 * ## The comparison is the point
 *
 * A confirmed check returns the name the bank holds. Showing it is useful; but
 * the useful half is whether it matches what somebody typed, because that is
 * the mismatch that means the number belongs to a real account owned by
 * somebody else. Compared loosely — case, spacing and ordering differ between
 * banks for the same person — so this asks somebody to look rather than
 * asserting a mismatch it cannot be certain of.
 */
export function AccountCheckLine({
  check,
  typedName,
}: {
  check: AccountCheck;
  /** What was typed into "name on the account", if the caller has one. */
  typedName?: string;
}) {
  if (check.kind === "idle") return null;

  if (check.kind === "checking") {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-meta text-muted">
        <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
        Checking this account with the bank…
      </p>
    );
  }

  if (check.kind === "confirmed") {
    const looksDifferent =
      typedName !== undefined &&
      typedName.trim().length > 0 &&
      !sameName(typedName, check.accountName);
    return (
      <div className="mt-1.5 flex flex-col gap-1">
        <p className="flex items-center gap-1.5 text-meta text-success-text">
          <Check aria-hidden="true" className="size-3.5" />
          <span>
            The bank holds this account as{" "}
            <strong className="font-semibold">{check.accountName}</strong>
          </span>
        </p>
        {looksDifferent && (
          <p className="flex items-start gap-1.5 text-meta text-warning-text">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            <span>
              That is not the name typed above. Worth checking the number before
              saving — an account number that belongs to somebody else is still a
              real account.
            </span>
          </p>
        )}
      </div>
    );
  }

  if (check.kind === "wrong") {
    return (
      <p className="mt-1.5 flex items-start gap-1.5 text-meta text-danger-text">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <span>{check.reason}</span>
      </p>
    );
  }

  if (check.kind === "bank-unknown") {
    return (
      <p className="mt-1.5 flex items-start gap-1.5 text-meta text-muted">
        <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Accounts at {check.bankName} cannot be confirmed here yet, so this one
          has not been checked. It saves normally.
        </span>
      </p>
    );
  }

  /* `unavailable`. Muted, deliberately — see the header. */
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-meta text-muted">
      <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>{check.reason}</span>
    </p>
  );
}

/**
 * Whether two renderings of a name are plausibly the same person.
 *
 * Banks return "OKONKWO ADAEZE", a form might hold "Adaeze Okonkwo", and one of
 * them may carry a middle name the other does not. Comparing the sorted word
 * set catches the ordering and the case; requiring only that every word of the
 * shorter appears in the longer covers the middle name. Anything looser would
 * stop flagging real mismatches, which is the only thing this is for.
 */
function sameName(a: string, b: string): boolean {
  const words = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
  const one = words(a);
  const two = words(b);
  if (one.length === 0 || two.length === 0) return true;
  const [shorter, longer] = one.length <= two.length ? [one, two] : [two, one];
  return shorter.every((word) => longer.includes(word));
}
