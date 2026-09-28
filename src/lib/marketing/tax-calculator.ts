/**
 * The public PAYE calculator's client. Same shape as `demo.ts` beside it, for
 * the same reason stated there: the marketing surface is exported as a
 * standalone site, and `scripts/export-marketing.ts` refuses an import from
 * `src/lib/marketing/` into `@/lib/api/` or `@/lib/payroll/` — this file posts
 * directly to `POST /payroll-calculator` instead of going through either.
 *
 * That refusal is also the whole point, not just a build constraint this file
 * works around: `@/lib/payroll/` holds nothing that computes tax any more
 * (see HANDOVER.md, "The frontend engine is gone"), and a calculator that
 * quoted its own arithmetic here would be exactly the mistake that section
 * documents — a second implementation of Nigerian statutory tax, in the one
 * place a stranger judges the product's credibility by. This client calls the
 * real engine over the network and renders only what it returns.
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "") || null;

/** True when there is an API configured to ask. */
export const configured = API_URL !== null;

export type CalculatorInput = {
  grossMonthlyKobo: number;
  annualRentKobo?: number;
  pensionElected: boolean;
  nhfElected: boolean;
};

export type Operated = "DEDUCTED" | "NOT_OPERATED";

/** One slice of the annual PAYE bands actually taxed. Omitted, not listed
 * with a zero, for a band nothing fell into — same rule as everywhere else
 * this engine reports a figure. */
export type PayeBandWorking = {
  widthKobo: number | null;
  rate: number;
  taxedKobo: number;
  taxKobo: number;
};

export type CalculatedPayslip = {
  operates: { paye: Operated; pension: Operated; nhf: Operated };
  grossKobo: number;
  basicKobo: number;
  housingKobo: number;
  transportKobo: number;
  pensionableKobo: number;
  pensionEmployeeKobo: number;
  pensionEmployerKobo: number;
  nhfBaseKobo: number;
  nhfKobo: number;
  payeKobo: number;
  consolidatedReliefMonthlyKobo: number;
  reliefKind: "CONSOLIDATED_RELIEF" | "RENT_RELIEF";
  reliefUnclaimed: boolean;
  netKobo: number;
  workings: { paye: { taxableAnnualKobo: number; bands: PayeBandWorking[] } };
};

export type TaxSchedule = {
  effectiveFrom: string;
  citation: string;
  confirmedThrough: string;
  stale: boolean;
};

export type CalculatorResult = {
  slip: CalculatedPayslip;
  taxSchedule: TaxSchedule;
};

export type CalculateOutcome =
  { ok: true; value: CalculatorResult } | { ok: false; message: string };

/**
 * Ask the real engine what a salary comes to. Returns `CalculateOutcome`
 * rather than throwing, so the page can render an honest, specific reason
 * instead of a caught exception with nothing useful in it.
 */
export async function calculatePaye(
  input: CalculatorInput,
): Promise<CalculateOutcome> {
  if (!API_URL) {
    return {
      ok: false,
      message:
        "This preview build is not connected to ApproveHR's system, so the calculator cannot run here.",
    };
  }

  try {
    const response = await fetch(`${API_URL}/payroll-calculator`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    const payload = (await response.json().catch(() => null)) as {
      data?: CalculatorResult;
      error?: { message?: string };
    } | null;

    if (response.ok && payload?.data) {
      return { ok: true, value: payload.data };
    }

    if (response.status === 429) {
      return {
        ok: false,
        message:
          payload?.error?.message ??
          "Too many calculations from this connection. Wait a while and try again.",
      };
    }

    return {
      ok: false,
      message:
        payload?.error?.message ??
        "That salary could not be calculated. Check the figure and try again.",
    };
  } catch {
    return {
      ok: false,
      message:
        "The calculator is temporarily unavailable. Check your connection and try again.",
    };
  }
}
