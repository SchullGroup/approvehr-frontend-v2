"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { Spinner } from "@/components/ui";
import { useAccountVerification } from "@/lib/store/account-verification";

/**
 * The one place BE-10's confirmation renders — four screens each already
 * collect a bank name and an account number, and this is what sits under
 * both once they are filled in.
 *
 * Nothing here changes how a bank is *picked*. It only reads the two fields a
 * caller already has and shows what came back.
 *
 * Three outcomes, one deliberately quiet:
 *
 * - **Verified** — the bank's own name for the account, in the same tone a
 *   confirmed fact gets elsewhere in this product.
 * - **Checked, not verified** — a real bank looked and found nobody. Worth a
 *   second look at the number, so this is a warning, but it is not blocking:
 *   the field beside it still saves.
 * - **Could not check at all** — an unrecognised bank name, no provider
 *   connected, or a network hiccup. This is the ordinary case for a small
 *   company on no provider yet, so it renders as quietly as a caption, in the
 *   API's own words, never as a warning.
 *
 * Renders nothing while the fields are incomplete, and nothing at all with no
 * API — there is nobody to ask, and a permanent spinner would teach people
 * the product is broken.
 */
export function AccountVerificationHint({
  bankName,
  accountNumber,
}: {
  bankName: string;
  accountNumber: string;
}) {
  const { result, loading } = useAccountVerification(bankName, accountNumber);

  if (loading) {
    return (
      <p className="flex items-center gap-1.5 text-meta text-muted">
        <Spinner size="sm" label="Checking the account" />
        Checking the name on this account
      </p>
    );
  }

  if (!result) return null;

  if (result.verified) {
    return (
      <p className="flex items-center gap-1.5 text-meta text-success-text">
        <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0" />
        {result.accountName}
      </p>
    );
  }

  if (result.checked) {
    return (
      <p className="flex items-center gap-1.5 text-meta text-warning-text">
        <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
        {result.reason}
      </p>
    );
  }

  return <p className="text-meta text-muted">{result.reason}</p>;
}
