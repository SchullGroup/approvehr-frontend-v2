import { describe, expect, it } from "vitest";
import { NIGERIAN_BANKS, bankCodeFor } from "@/lib/reference/banks";

/**
 * Every bank this app offers must reach the API with a usable code.
 *
 * ## Why this file exists
 *
 * The picker offered 254 banks and the API resolved names against a directory
 * of 55, ported from the previous backend. Only 37 names crossed the gap, so
 * choosing an ordinary bank — "Kuda Bank", "9jaPay Microfinance Bank" —
 * answered *"could not be matched to a bank we know"*.
 *
 * Worse, five resolved to a **different** code than the one sitting beside the
 * name in this very list. That failure is silent, and `payments/file.ts` in the
 * API is blunt about what it costs: a wrong bank code routes money to the wrong
 * institution.
 *
 * The fix was to stop asking the API to guess. This app has the right code — it
 * came from Paystack with the name — so it sends it. These cases hold that
 * true for every row, not just the ones somebody happened to try.
 */

describe("every bank in the picker", () => {
  it("has a code to send", () => {
    /* If this fails, some row reaches the API as a bare name and lands back on
       the matching this change exists to stop relying on. */
    const without = NIGERIAN_BANKS.filter((bank) => !bankCodeFor(bank.label));
    expect(without.map((b) => b.label)).toEqual([]);
  });

  it("resolves to the code printed beside it, not another bank's", () => {
    const wrong = NIGERIAN_BANKS.filter(
      (bank) => bankCodeFor(bank.label) !== bank.code,
    );
    expect(
      wrong.map((b) => `${b.label}: ${b.code} -> ${bankCodeFor(b.label)}`),
    ).toEqual([]);
  });

  it("covers the banks that were reported broken", () => {
    /* Each of these answered "could not be matched" from a real screen. */
    for (const name of [
      "Kuda Bank",
      "9jaPay Microfinance Bank",
      "Moniepoint MFB",
      "PalmPay",
      "Carbon",
    ]) {
      expect(bankCodeFor(name), name).not.toBeNull();
    }
  });

  it("is a list worth trusting: no duplicate labels", () => {
    /* Two rows with one label make `bankCodeFor` answer with whichever came
       first, which is how a name silently resolves to the wrong institution. */
    const seen = new Map<string, number>();
    for (const bank of NIGERIAN_BANKS) {
      seen.set(bank.label, (seen.get(bank.label) ?? 0) + 1);
    }
    expect([...seen].filter(([, n]) => n > 1).map(([label]) => label)).toEqual(
      [],
    );
  });
});
