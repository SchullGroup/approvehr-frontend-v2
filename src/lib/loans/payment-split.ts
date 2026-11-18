/**
 * Where a payment recorded outside payroll goes. A port of `allocatePayment` in
 * `approvehr-api/src/modules/loans/allocation.ts`, and it must stay a port.
 *
 * ## Why this exists on the frontend at all
 *
 * The "Record a payment" dialog says where the money will go while somebody is
 * typing ("₦16,666.66 clears instalment 1, ₦3,333.34 goes to instalment 2") and
 * refuses an amount the loan cannot take before anything is sent. The server
 * decides, and this is only the screen telling the truth about what the server
 * will do. It is also what the demo book runs, so a laptop with no database
 * splits a payment the way the API would.
 *
 * ## The rules, which are the API's rules
 *
 * A payment of X recorded against instalment N:
 *
 * 1. Fills N up to what is left on it.
 * 2. What is over goes to N+1, N+2 and so on in sequence order, each filled up
 *    to what is left on it, until the money is used up.
 * 3. PAID and WAIVED instalments are skipped, and so is any with nothing left.
 * 4. An instalment that takes money and still has some left is PARTIAL; one that
 *    is cleared is PAID.
 * 5. Instalments before N are never touched.
 * 6. More than everything still owing from N onwards is refused, naming the most
 *    that can be recorded.
 *
 * Whole kobo throughout. Nothing divides, so nothing rounds.
 *
 * If any of that changes on the server, change it here in the same commit and
 * put the new case in both test files (`tests/loan-payment-split.test.ts` here,
 * `tests/loan-payment-allocation.test.ts` there). Two copies of money arithmetic
 * drift unless something holds them together.
 */

import type { LoanRepaymentStatus } from "@/lib/api/loans";

/** One instalment, as kobo, as the split needs to see it. */
export type PayableInstalment = {
  sequence: number;
  dueKobo: number;
  paidKobo: number;
  status: LoanRepaymentStatus;
};

/** What one instalment takes from the payment, and what it holds afterwards. */
export type PaymentShare = {
  sequence: number;
  /** Kobo this payment puts on the instalment. Always more than nothing. */
  amountKobo: number;
  /** Kobo the instalment holds once this is recorded. */
  paidKobo: number;
  status: "PAID" | "PARTIAL";
};

export type PaymentRefusalKind =
  /** Not a whole, positive number of kobo. */
  | "AMOUNT"
  /** The loan has no such instalment. */
  | "NO_INSTALMENT"
  /** The chosen instalment was written off. */
  | "WRITTEN_OFF"
  /** The chosen instalment is already paid in full. */
  | "ALREADY_PAID"
  /** More than is owing from the chosen instalment onwards. */
  | "TOO_MUCH";

export type PaymentSplit =
  | {
      ok: true;
      /** Instalments that take money, in sequence order. */
      shares: readonly PaymentShare[];
      /** The most that could have been recorded. */
      maxKobo: number;
    }
  | {
      ok: false;
      refusal: { kind: PaymentRefusalKind; message: string };
      /** The most that can be recorded; the figure the refusal names. */
      maxKobo: number;
    };

/** `₦1,234.50`. The same figure the API's `formatNaira` prints. */
const nairaText = (amountKobo: number): string =>
  `₦${(Math.round(amountKobo) / 100).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const owingOn = (row: PayableInstalment): number =>
  Math.max(0, row.dueKobo - row.paidKobo);

/** Only these can still take money; PAID and WAIVED cannot. */
const canTakeMoney = (row: PayableInstalment): boolean =>
  row.status === "SCHEDULED" || row.status === "PARTIAL";

/**
 * Split `amountKobo`, recorded against instalment `fromSequence`, across the
 * schedule. `rows` is the whole schedule in any order.
 */
export function allocatePayment(
  rows: readonly PayableInstalment[],
  fromSequence: number,
  amountKobo: number,
): PaymentSplit {
  const ordered = [...rows].sort((a, b) => a.sequence - b.sequence);
  const chosen = ordered.find((row) => row.sequence === fromSequence);

  /* Everything from the chosen instalment on that can still take money. */
  const reachable = ordered.filter(
    (row) => row.sequence >= fromSequence && canTakeMoney(row),
  );
  const maxKobo = reachable.reduce((total, row) => total + owingOn(row), 0);

  const refuse = (kind: PaymentRefusalKind, message: string): PaymentSplit => ({
    ok: false,
    refusal: { kind, message },
    maxKobo,
  });

  if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
    return refuse(
      "AMOUNT",
      "A payment is a whole number of kobo, more than nothing.",
    );
  }
  if (!chosen) {
    return refuse(
      "NO_INSTALMENT",
      `Instalment ${fromSequence} on that loan was not found.`,
    );
  }
  if (chosen.status === "WAIVED") {
    return refuse(
      "WRITTEN_OFF",
      "That instalment was written off. Nothing is owed on it.",
    );
  }
  if (chosen.status === "PAID") {
    return refuse("ALREADY_PAID", "That instalment is already paid in full.");
  }

  if (amountKobo > maxKobo) {
    /* When nothing after the chosen instalment can take money, say it the way a
       single instalment always has. */
    const owing = reachable.filter((row) => owingOn(row) > 0).length;
    return refuse(
      "TOO_MUCH",
      owing > 1
        ? `Only ${nairaText(maxKobo)} is left to pay from instalment ${fromSequence} onwards. Record ${nairaText(maxKobo)} or less.`
        : `Only ${nairaText(maxKobo)} is left on instalment ${fromSequence}. Record ${nairaText(maxKobo)} or less.`,
    );
  }

  const shares: PaymentShare[] = [];
  let left = amountKobo;
  for (const row of reachable) {
    if (left === 0) break;
    const take = Math.min(left, owingOn(row));
    if (take === 0) continue;
    left -= take;
    const paidKobo = row.paidKobo + take;
    shares.push({
      sequence: row.sequence,
      amountKobo: take,
      paidKobo,
      status: paidKobo >= row.dueKobo ? "PAID" : "PARTIAL",
    });
  }

  return { ok: true, shares, maxKobo };
}

/** `1`, `1 and 2`, `1, 2 and 4`, or `1 to 4` for a run of four or more in a row. */
function sequenceList(sequences: readonly number[]): string {
  const parts: string[] = [];
  let index = 0;
  while (index < sequences.length) {
    let end = index;
    while (
      end + 1 < sequences.length &&
      sequences[end + 1] === (sequences[end] ?? 0) + 1
    ) {
      end += 1;
    }
    const first = sequences[index] ?? 0;
    const last = sequences[end] ?? 0;
    if (end - index >= 3) parts.push(`${first} to ${last}`);
    else for (let i = index; i <= end; i += 1) parts.push(String(sequences[i]));
    index = end + 1;
  }
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * One short line saying where a payment goes, or null when it all lands on the
 * instalment chosen (there is nothing to explain then).
 *
 * "₦16,666.66 clears instalment 1, ₦3,333.34 goes to instalment 2". An
 * instalment the payment clears says "clears"; one it only part fills says "goes
 * to". Past three instalments it folds the cleared ones together so the line
 * stays a line.
 *
 * `format` turns kobo into text, so this file stays free of the UI's money
 * component.
 */
export function describeSplit(
  shares: readonly PaymentShare[],
  format: (amountKobo: number) => string = nairaText,
): string | null {
  if (shares.length < 2) return null;

  const verb = (share: PaymentShare) =>
    share.status === "PAID" ? "clears" : "goes to";

  if (shares.length <= 3) {
    return shares
      .map(
        (share) =>
          `${format(share.amountKobo)} ${verb(share)} instalment ${share.sequence}`,
      )
      .join(", ");
  }

  const cleared = shares.filter((share) => share.status === "PAID");
  const part = shares.find((share) => share.status === "PARTIAL");
  const clearedText =
    cleared.length === 0
      ? null
      : `${format(cleared.reduce((total, share) => total + share.amountKobo, 0))} clears instalment${cleared.length === 1 ? "" : "s"} ${sequenceList(cleared.map((share) => share.sequence))}`;
  const partText = part
    ? `${format(part.amountKobo)} goes to instalment ${part.sequence}`
    : null;
  return [clearedText, partText].filter(Boolean).join(", ");
}

/** The instalments a payment lands on, for a toast: `1 and 2`, `1 to 5`. */
export function sharesList(shares: readonly PaymentShare[]): string {
  return sequenceList(shares.map((share) => share.sequence));
}
