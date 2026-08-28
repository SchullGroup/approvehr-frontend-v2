"use client";

import { request } from "@/lib/api/client";

/**
 * Setup and feature flags — `/api/v1/setup`.
 *
 * Typed wrappers only, in the same hand-written style as `endpoints.ts`. Nothing
 * here converts money, because nothing here carries any.
 *
 * ## The questions are not in this file
 *
 * `GET /setup/wizard` returns the wizard: the questions, their help text, their
 * options, and **the exact flags each option writes** (`sets`). That is
 * deliberate on the API's side and it has to be respected here — wording, order
 * and the mapping from answer to capability can then change without shipping a
 * frontend. So there is no question list in this file and no copy of the rules.
 * A screen renders what it is served.
 *
 * The one place a question set exists on this side is the demo fallback in
 * `lib/store/features.ts`, which only runs when there is no API to ask.
 */

/* ------------------------------------------------------------------- shapes */

export type HeadcountBand =
  | "UNDER_10"
  | "FROM_10_TO_50"
  | "FROM_50_TO_250"
  | "OVER_250";

/**
 * The capabilities that decide which **screens** exist. Set by the wizard.
 *
 * `headcountBand` is an answer, not a switch, so it is not in here.
 */
export const MODULE_FEATURE_KEYS = [
  "departments",
  "grades",
  "shifts",
  "loans",
  "expenses",
  "appraisals",
  "hiring",
  "attendance",
] as const;

/**
 * The three statutory field groups on an employee record.
 *
 * These hide **fields on a form**, not screens, which is why they are a separate
 * list rather than seven items that happen to include three of a different kind.
 * The setup wizard's summary shows modules and would be worse for listing
 * "Bank account" beside "Hiring"; the Settings page shows both, in two groups.
 *
 * There is no wizard question for them either, on purpose: asking a shop owner
 * about RSA PINs before they have added anybody is the opposite of what those
 * five questions are for. The groups are collapsed and opt-in on the form
 * already, and these flags are for the company that never wants to see them.
 */
export const RECORD_FIELD_KEYS = ["taxSetup", "pensionSetup", "bankDetails"] as const;

/**
 * Depth inside a module that is already on. A third kind of switch.
 *
 * `multiAppraiser` does not add a screen and does not hide a field — it changes
 * how much of an existing module a company is asked to think about. Off, a
 * person has one manager who appraises them and the word "matrix" appears
 * nowhere in the product. On, appraisals grow a mapping surface with roles and
 * weights.
 *
 * It is deliberately **not** a wizard question. The wizard's five questions are
 * the argument for this product against an incumbent that shows a five-person
 * business a hundred and twenty routes; asking that business about matrix
 * management during sign-up would be losing the argument on the second screen.
 * A company reaches this on the Settings page, once it has a reason to.
 *
 * The API refuses turning it on while `appraisals` is off, and turns it off with
 * appraisals. Nothing is deleted either way.
 */
export const ADVANCED_FEATURE_KEYS = ["multiAppraiser", "twoFactor"] as const;

/** The acts a company can put a code in front of. Mirrors `StepUpAction`. */
export const STEP_UP_ACTIONS = [
  "PAYROLL_APPROVE",
  "PAYMENT_SUBMIT",
  "ROLE_CHANGE",
  "BANK_DETAILS",
] as const;

export type StepUpAction = (typeof STEP_UP_ACTIONS)[number];

/** Everything switchable, in the order the Settings page shows it. */
export const FEATURE_KEYS = [
  ...MODULE_FEATURE_KEYS,
  ...RECORD_FIELD_KEYS,
  ...ADVANCED_FEATURE_KEYS,
] as const;

export type ModuleFeatureKey = (typeof MODULE_FEATURE_KEYS)[number];
export type RecordFieldKey = (typeof RECORD_FIELD_KEYS)[number];
export type AdvancedFeatureKey = (typeof ADVANCED_FEATURE_KEYS)[number];
export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** What a PATCH sends, and what a wizard option's `sets` looks like. */
export type FeaturePatch = {
  /**
   * `stepUpActions` is the one member that is not a boolean.
   *
   * Declared explicitly rather than widening the mapped type, so every other
   * key keeps its `boolean` and a caller cannot pass an array where a flag
   * belongs. It is sent as the **whole set** — "these and only these" — because
   * a removal cannot be expressed as a partial list.
   */
  stepUpActions?: StepUpAction[];
} & {
  [K in FeatureKey]?: boolean;
} & { headcountBand?: HeadcountBand };

export type ApiFeatures = {
  headcountBand: HeadcountBand;
  shifts: boolean;
  loans: boolean;
  expenses: boolean;
  appraisals: boolean;
  departments: boolean;
  hiring: boolean;
  grades: boolean;
  /** A clock-in button, today's roster, and a calendar of who came in. */
  attendance: boolean;
  /** PAYE state, TIN and the annual rent declaration. */
  taxSetup: boolean;
  /** RSA PIN, pension fund administrator, NHF number. */
  pensionSetup: boolean;
  /** Bank name and NUBAN. */
  bankDetails: boolean;
  /** Several appraisers per person, with roles and weights. Needs `appraisals`. */
  multiAppraiser: boolean;
  /** Whether a second factor is asked for at all. Off by default. */
  twoFactor: boolean;
  /** Which acts need a code, when `twoFactor` is on. Empty means sign-in only. */
  stepUpActions: StepUpAction[];
  setupStep: number;
  totalSteps: number;
  setupCompletedAt: string | null;
  /** Computed by the API so nothing on this side re-derives it. */
  setupRequired: boolean;
};

/**
 * The three statutory deductions a company can switch off.
 *
 * A different table from `FeaturePatch` and a different question. `taxSetup` and
 * `pensionSetup` above decide whether the employee form **asks for** a TIN or an
 * RSA PIN; these decide whether the payroll engine **computes** the deduction.
 * A company whose staff file their own returns still has staff with TINs, so the
 * two are never one answer.
 */
export const PAYROLL_DEDUCTION_KEYS = [
  "payeEnabled",
  "pensionEnabled",
  "nhfEnabled",
] as const;

export type PayrollDeductions = Record<
  (typeof PAYROLL_DEDUCTION_KEYS)[number],
  boolean
>;

export type ApiWizardOption = {
  value: string;
  label: string;
  /** Exactly what choosing this writes. Rendered, never recomputed. */
  sets: FeaturePatch;
  /** Payroll deduction switches this answer writes. See `PayrollDeductions`. */
  payroll?: Partial<PayrollDeductions>;
  /**
   * What choosing this actually means, in plain words, from the API.
   *
   * Present only on answers that switch a statutory deduction off. Rendered
   * verbatim and never paraphrased: it names the Act, and a locally reworded
   * version of a legal consequence is how the two stop agreeing.
   */
  consequence?: string;
};

export type ApiWizardQuestion = {
  id: string;
  /** 1-based. `step` reaching this number means this question is answered. */
  step: number;
  question: string;
  help: string;
  options: ApiWizardOption[];
};

export type ApiWizard = {
  totalSteps: number;
  /** Answered up to here, so a half-finished wizard resumes. */
  step: number;
  setupCompletedAt: string | null;
  questions: ApiWizardQuestion[];
  /**
   * What this company deducts today, so an option can be marked "Now".
   *
   * **Null means it has no payroll settings row yet** — it has not finished
   * setup, so it has not chosen. Absent is not "everything on": marking "Yes"
   * from a default would tell somebody they had answered a question nobody
   * asked them.
   */
  payroll: PayrollDeductions | null;
};

export type ApiSetupStatus = {
  setupRequired: boolean;
  step: number;
  totalSteps: number;
};

export type ApiAnswerResult = ApiFeatures & {
  nextQuestionId: string | null;
  /** What the company deducts after this answer. Null before the row exists. */
  payroll: PayrollDeductions | null;
};

/** What finishing seeded. Both counts are "created just now", so both can be 0. */
export type ApiSeeded = { leaveTypes: number; payrollSettings: boolean };

export type ApiCompleteResult = ApiFeatures & { seeded: ApiSeeded };

/**
 * What is still not set up, as facts.
 *
 * One request rather than nine hooks, and **facts rather than prose** — the
 * opposite choice from `GET /setup/wizard`, which sends its own wording. The
 * reasoning is in the header of `approvehr-api/src/modules/setup/checklist.ts`
 * and is worth knowing before adding a field: the API decides what is *true*
 * about a company, and the Settings hub decides what is worth nagging somebody
 * about. Copy lives beside the link it sits next to.
 *
 * Nothing here is a figure about a person. The closest is a headcount.
 */
export type ApiSetupChecklist = {
  /** Null until the five setup questions have been finished. */
  setupCompletedAt: string | null;
  company: {
    /** Whether a logo has been uploaded. See the note on the API's own copy. */
    logo: boolean;
    rcNumber: boolean;
    tin: boolean;
    addressLine: boolean;
    /** The PAYE state an employee record inherits when it does not say. */
    taxState: boolean;
    entities: number;
  };
  locations: {
    total: number;
    withGeofence: number;
    /** Fenced **and** not open to clocking in from anywhere. */
    enforcing: number;
  };
  recordFields: { taxSetup: boolean; pensionSetup: boolean; bankDetails: boolean };
  leave: {
    types: number;
    year: number;
    holidays: number;
    awaitingProclamation: number;
  };
  pay: {
    settings: boolean;
    components: number;
    grades: number;
    bankAccounts: number;
    /** A payment batch cannot be built without one. */
    hasPrimaryBankAccount: boolean;
  };
  access: {
    roles: number;
    users: number;
    /** Accounts that can sign in and would see nothing. */
    usersWithoutRole: number;
    /** One is a single point of failure, which is why it is a number. */
    canApprovePayroll: number;
  };
  /**
   * What would stop a payroll today — the same two conditions the run raises as
   * a BLOCKER and a WARNING, read against the same settings switches.
   */
  payrollChecks: {
    employees: number;
    requireBankAccount: boolean;
    requirePensionPin: boolean;
    missingBankAccount: number;
    missingPensionPin: number;
  };
};

/* ----------------------------------------------------------------- requests */

export const setup = {
  /**
   * Two columns, no write. Built for a layout that calls it on every page load.
   *
   * The app does not currently use it: the sidebar reads `useFeatures()` on
   * every page anyway, so the full features row is already in memory and a
   * second request for a subset of it would be waste. Kept because the moment
   * something needs "is setup required" *without* needing the flags, this is
   * the cheap way to ask.
   */
  status: (signal?: AbortSignal) =>
    request<ApiSetupStatus>("/setup/status", {
      ...(signal ? { signal } : {}),
    }),

  /**
   * The setup checklist. Any authenticated user may read it.
   *
   * `year` is what the holiday counts cover; the API defaults it to its own
   * clock rather than trusting a browser's, so omit it unless a screen has a
   * year control.
   */
  checklist: (year?: number, signal?: AbortSignal) =>
    request<ApiSetupChecklist>("/setup/checklist", {
      query: year === undefined ? {} : { year },
      ...(signal ? { signal } : {}),
    }),

  /** Never 404s: a company that exists has features. */
  features: (signal?: AbortSignal) =>
    request<ApiFeatures>("/setup/features", {
      ...(signal ? { signal } : {}),
    }),

  /**
   * Turn capabilities on and off. Needs `MANAGE_SETTINGS`.
   *
   * Partial body. Absent means "leave it alone", which is not the same as
   * `false`. Naming `headcountBand: UNDER_10` switches departments and grades
   * off unless the same request names them explicitly — so a caller that means
   * to keep them sends them.
   */
  updateFeatures: (body: FeaturePatch) =>
    request<ApiFeatures>("/setup/features", { method: "PATCH", body }),

  wizard: (signal?: AbortSignal) =>
    request<ApiWizard>("/setup/wizard", {
      ...(signal ? { signal } : {}),
    }),

  answer: (questionId: string, value: string) =>
    request<ApiAnswerResult>("/setup/wizard/answer", {
      method: "POST",
      body: { questionId, value },
    }),

  /** Sets the go-live date once, then seeds the Nigerian SME defaults. */
  complete: () =>
    request<ApiCompleteResult>("/setup/wizard/complete", { method: "POST" }),
};
