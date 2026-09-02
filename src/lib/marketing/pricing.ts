/**
 * Pricing is per employee per month, banded by headcount, quoted in naira.
 *
 * The rates below are set against the Nigerian mid-market rather than
 * converted from a dollar price list: a 50-person Lagos company pays about
 * ₦60,000 a month, which lands under what the same team already spends on the
 * spreadsheets-and-consultant arrangement this replaces. Rate falls as
 * headcount rises because support cost per head falls with it.
 */

export type TierId = "starter" | "growth" | "scale" | "enterprise";

export type Tier = {
  id: TierId;
  name: string;
  /** Inclusive headcount band. `null` max means unbounded. */
  min: number;
  max: number | null;
  /** Naira, per employee, per month, billed monthly. */
  pepm: number | null;
  /** Floor for very small teams, where per-head maths stops covering support. */
  monthlyFloor: number;
  tagline: string;
  includes: string[];
  /** What this tier adds over the one before it. */
  adds: string[];
};

export const TIERS: Tier[] = [
  {
    id: "starter",
    name: "Starter",
    min: 1,
    max: 25,
    pepm: 1500,
    monthlyFloor: 20_000,
    tagline: "For teams putting HR on a system for the first time.",
    includes: [
      "Employee records and documents",
      "Leave and time off",
      "Payslip generation",
      "Employee self-service",
      "Help desk",
    ],
    adds: [],
  },
  {
    id: "growth",
    name: "Growth",
    min: 26,
    max: 100,
    pepm: 1200,
    monthlyFloor: 0,
    tagline: "For companies running payroll and hiring in earnest.",
    includes: [],
    adds: [
      "Full payroll with PAYE, pension and NHF",
      "Statutory filing schedules",
      "Attendance and shifts",
      "Applicant tracking, unlimited roles and candidates",
      "Structured interview scorecards",
      "Approval workflows",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    min: 101,
    max: 500,
    pepm: 950,
    monthlyFloor: 0,
    tagline: "For multi-entity organisations with real governance needs.",
    includes: [],
    adds: [
      "Performance and goals",
      "Multiple entities and locations",
      "Reporting and analytics",
      "Custom roles and permissions",
      "API access",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    min: 501,
    max: null,
    pepm: null,
    monthlyFloor: 0,
    tagline: "For groups, banks and public sector organisations.",
    includes: [],
    adds: [
      "Single sign-on and directory sync",
      "Uptime SLA and priority support",
      "Named customer success manager",
      "Custom integrations and data residency",
      "Security review and DPA",
    ],
  },
];

/** Two months free on annual billing. Quoted as ten months, not a percentage. */
export const ANNUAL_MONTHS_CHARGED = 10;

export function tierFor(headcount: number): Tier {
  return (
    TIERS.find((t) => headcount >= t.min && (t.max === null || headcount <= t.max)) ??
    TIERS[TIERS.length - 1]
  );
}

export type Quote = {
  tier: Tier;
  headcount: number;
  /** null when the tier is quote-only. */
  monthly: number | null;
  annual: number | null;
  /** Effective rate after the floor is applied. */
  effectivePepm: number | null;
  annualSaving: number | null;
  flooredUp: boolean;
};

export function quote(headcount: number): Quote {
  const tier = tierFor(headcount);

  if (tier.pepm === null) {
    return {
      tier,
      headcount,
      monthly: null,
      annual: null,
      effectivePepm: null,
      annualSaving: null,
      flooredUp: false,
    };
  }

  const raw = headcount * tier.pepm;
  const monthly = Math.max(raw, tier.monthlyFloor);
  const annual = monthly * ANNUAL_MONTHS_CHARGED;

  return {
    tier,
    headcount,
    monthly,
    annual,
    effectivePepm: Math.round(monthly / Math.max(headcount, 1)),
    annualSaving: monthly * 12 - annual,
    flooredUp: monthly > raw,
  };
}

/** Everything in a lower tier is carried up, so the page can render honestly. */
export function cumulativeIncludes(tierId: TierId): string[] {
  const index = TIERS.findIndex((t) => t.id === tierId);
  return TIERS.slice(0, index + 1).flatMap((t) => [...t.includes, ...t.adds]);
}

export const ADD_ONS = [
  {
    name: "Earned wage access",
    price: "No platform fee",
    detail:
      "Staff draw part of salary already earned. Priced per transaction, settled against your payroll run.",
  },
  {
    name: "Job board syndication",
    price: "₦45,000 / month",
    detail:
      "Push every open role to Jobberman, LinkedIn and your careers page from one place.",
  },
  {
    name: "Implementation and migration",
    price: "From ₦250,000 once",
    detail:
      "We move your existing employee records, balances and payroll history and reconcile the first run with you.",
  },
];
