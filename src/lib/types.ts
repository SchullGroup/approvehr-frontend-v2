/* Domain types. These mirror what the Node API will return, so swapping the
   mock layer for fetch calls is a change of source, not of shape. */

export type Uuid = string;

/* ---------------------------------------------------------------- People -- */

export type EmploymentStatus =
  | "active"
  | "onboarding"
  | "probation"
  | "on_leave"
  | "offboarding"
  | "inactive";

export type EmploymentType = "full_time" | "contract" | "internship";

/**
 * The single employee record. Payroll, hiring and the directory all read this
 * one shape — an earlier split between a "directory employee" and a "payroll
 * employee" meant the two could disagree about who works here, which is
 * exactly the class of bug this product exists to remove.
 *
 * Nullable fields are the ones a record can genuinely be missing on day one.
 * They are what the payroll run checks for, and what the record page nags to
 * complete.
 */
export type Employee = {
  id: Uuid;
  employeeNo: string;
  firstName: string;
  lastName: string;
  /**
   * Optional and nullable, the same shape as `annualRentKobo` below: `null` is
   * "asked, and there isn't one", `undefined` is a source that does not carry
   * the field at all (the demo seed, which predates it). Both render the same
   * way — nothing to show — so nothing on screen needs to tell them apart.
   */
  middleName?: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender?: "female" | "male" | "other";

  jobTitle: string;
  department: string;
  managerId: Uuid | null;
  location: string;
  employmentType: EmploymentType;
  startDate: string;
  endDate?: string | null;
  status: EmploymentStatus;
  /**
   * The pay band this role sits in — a reference range, not a figure.
   * `null` on nobody yet; `undefined` on a source that predates the field
   * (the demo seed, which derives a grade instead — see `lib/store/grades.ts`).
   * Never used to set `grossMonthly`: the two are independent, so two people
   * on the same grade can be paid differently.
   */
  salaryGradeId?: Uuid | null;

  /**
   * Whether a payroll run should open this person's PAYE editable by default,
   * rather than a reviewer switching it to manual entry every period.
   *
   * A standing preference, never the tax figure itself — that lives on the
   * run being reviewed (`RunTaxOverride` in `lib/api/payroll.ts`), because
   * what somebody owes genuinely differs period to period even for somebody
   * a company always enters by hand. `undefined` on a source that predates
   * the field.
   */
  payeManualOverride?: boolean;

  /**
   * Contractual monthly gross in naira, or **null** where nobody has set one.
   *
   * Nullable because the API's column is: somebody can be on the staff list
   * before their pay is agreed, which is the ordinary state of a new hire.
   *
   * Nothing may render this as ₦0.00. "We pay them nothing" and "nobody has
   * said yet" are different facts, and a payroll run raises a `missing_pay`
   * BLOCKER naming anybody in the second state rather than paying them a zero.
   * Screens say "Not set yet"; totals leave them out and say how many.
   */
  grossMonthly: number | null;
  /**
   * Set only on a directory row from the API, where `bankAccount` /
   * `pensionPin` / `tin` below are redacted to `null` regardless of whether
   * they are actually on file — see `serializeDirectory` in the API. Reading
   * one of those three fields to ask "is this missing" on a directory row
   * is therefore wrong; `payrollGapsForDirectoryRow` in this file is the
   * presence-aware version to use there instead.
   */
  hasBankAccount?: boolean;
  hasPensionPin?: boolean;
  hasTin?: boolean;
  /** Nullable: payroll blocks on these, so their absence is meaningful. */
  bankName: string | null;
  bankAccount: string | null;
  pensionPin: string | null;
  pensionProvider: string | null;
  taxState: string;
  tin: string | null;
  nhfNumber: string | null;
  /**
   * Where they live, on one line, and their NIN.
   *
   * `addressLine` is not `location` (the office they clock in at) and not
   * `taxState` (which revenue service their PAYE goes to). `nin` is eleven
   * digits and is an identifier, so it stays a string — a leading zero matters.
   */
  addressLine: string | null;
  nin: string | null;
  /**
   * State of origin and the LGA inside it. **Not** the tax state: origin is
   * where somebody is from, tax state is where their PAYE is filed, and reading
   * either as the other files a Lagos employee's tax in Imo.
   */
  stateOfOrigin: string | null;
  lgaOfOrigin: string | null;
  /** Free text. Recorded because holidays and dietary needs depend on it. */
  religion: string | null;

  /**
   * Declared annual rent, in **integer kobo**, and when it was declared.
   *
   * Kobo rather than naira, unlike `grossMonthly` above, because this field is
   * new and the naira boundary is a legacy the rest of this type is waiting to
   * shed — see `toEmployee` in `lib/api/endpoints.ts`. Do not add a second
   * naira money field here.
   *
   * Optional *and* nullable, and the two mean nearly the same thing on purpose:
   * `null` is "asked and undeclared", `undefined` is a source that does not
   * carry the field at all (the demo seed). Both render as undeclared, because
   * under the Nigeria Tax Act 2025 undeclared earns no personal relief and there
   * is nothing softer to say about either. **Zero is different from both** — it
   * is a declaration that happens to earn nothing, and `rentDeclaredAt` is what
   * distinguishes it.
   */
  annualRentKobo?: number | null;
  rentDeclaredAt?: string | null;

  nextOfKin?: { name: string; relationship: string; phone: string } | null;
  avatarUrl?: string;
};

/** Fields payroll cannot run without. Used by the record completeness meter. */
export const REQUIRED_FOR_PAYROLL = [
  "bankAccount",
  "pensionPin",
  "tin",
] as const satisfies readonly (keyof Employee)[];

export function missingForPayroll(e: Employee): string[] {
  const labels: Record<string, string> = {
    bankAccount: "Bank account",
    pensionPin: "Pension PIN",
    tin: "Tax identification number",
  };
  return REQUIRED_FOR_PAYROLL.filter((k) => !e[k]).map((k) => labels[k]);
}

/**
 * What the payroll ENGINE actually does about one of the three fields above
 * being absent — which is not the same thing for all three, even though
 * `missingForPayroll` treats them as one list for the completeness meter
 * above. That list answers "is this record complete"; this one answers "what
 * happens to this month's payroll if it stays this way", and a screen making
 * the second claim should read it from here rather than from the length of
 * the first list.
 *
 * Ground truth is `approvehr-api/src/modules/payroll/service.ts`'s `prepare`:
 *
 * - a missing bank account is a **BLOCKER** — the run refuses to approve
 *   until it is added or the person is excluded from the period;
 * - a missing pension PIN is a **WARNING**, and the engine raises it at all
 *   only when the company both operates a pension and requires the PIN — it
 *   means the remittance schedule will be incomplete, never that the payslip
 *   is withheld;
 * - a missing TIN raises **nothing** on the run. It is recommended for filing
 *   and does not affect this month's pay.
 *
 * `pensionOperated` defaults to `true` because that is also
 * `PayrollSettings`'s own default (`pensionEnabled` and `requirePensionPin`
 * both default `true`), so a screen with no settings loaded yet shows the
 * common case rather than silently under-claiming. A caller that has the
 * company's real settings should pass the real answer instead of leaving the
 * default to speak for it.
 */
export type PayrollGap = {
  field: "bankAccount" | "pensionPin" | "tin";
  label: string;
  /** True for the one field the engine actually refuses to pay somebody without. */
  blocking: boolean;
  /** What actually happens, worded the way the engine's own exception is. */
  consequence: string;
};

export function payrollGapsFor(
  e: {
    bankAccount: string | null;
    pensionPin: string | null;
    tin: string | null;
  },
  pensionOperated = true,
): PayrollGap[] {
  const gaps: PayrollGap[] = [];
  if (!e.bankAccount) {
    gaps.push({
      field: "bankAccount",
      label: "Bank account",
      blocking: true,
      consequence:
        "They cannot be paid until this is added, or they are excluded from the run.",
    });
  }
  if (!e.pensionPin && pensionOperated) {
    gaps.push({
      field: "pensionPin",
      label: "Pension PIN",
      blocking: false,
      consequence:
        "Their pension remittance schedule will be incomplete. It does not hold back their pay.",
    });
  }
  if (!e.tin) {
    gaps.push({
      field: "tin",
      label: "Tax identification number",
      blocking: false,
      consequence:
        "Recommended for filing their tax return. It does not affect this month's pay.",
    });
  }
  return gaps;
}

/**
 * The same three fields `payrollGapsFor` and `missingForPayroll` check,
 * answered correctly for a directory row.
 *
 * A directory row from the API has `bankAccount` / `pensionPin` / `tin`
 * redacted to `null` regardless of whether they are on file (see
 * `serializeDirectory` in the API) — only `hasBankAccount` etc. say the
 * truth there. A demo-mode or single-record-read employee has no `has*`
 * fields at all and its raw fields are the real, ungutted values. Falling
 * back to the raw field's own truthiness when `has*` is absent is what
 * makes this one function correct for both.
 *
 * The `"•"` is never rendered — `payrollGapsFor` and `missingForPayroll`
 * only ever test these three fields for truthiness, so any non-empty
 * string stands in for "on file" without claiming to be a real value.
 */
export function payrollFieldsForDisplay(
  e: Pick<
    Employee,
    | "bankAccount"
    | "pensionPin"
    | "tin"
    | "hasBankAccount"
    | "hasPensionPin"
    | "hasTin"
  >,
): {
  bankAccount: string | null;
  pensionPin: string | null;
  tin: string | null;
} {
  const has = (flag: boolean | undefined, real: string | null) =>
    (flag ?? real !== null) ? "•" : null;
  return {
    bankAccount: has(e.hasBankAccount, e.bankAccount),
    pensionPin: has(e.hasPensionPin, e.pensionPin),
    tin: has(e.hasTin, e.tin),
  };
}

export const fullName = (p: { firstName: string; lastName: string }) =>
  `${p.firstName} ${p.lastName}`;

/* ---------------------------------------------------------------- Hiring -- */

/**
 * The five pipeline stages, in order. Stage order is data, not presentation:
 * the board, the funnel and the "advance" action all read from this array so
 * they can never disagree about what comes next.
 */
export const STAGES = [
  {
    id: "sourced",
    label: "Sourced",
    blurb: "Applied or was added by a sourcer. Not yet reviewed.",
    /** What has to be true to leave this stage. */
    exitCriteria: "A recruiter has reviewed the CV.",
  },
  {
    id: "shortlisted",
    label: "Shortlisted",
    blurb: "Meets the must-haves on paper.",
    exitCriteria: "Screening questions sent and returned.",
  },
  {
    id: "prescreen",
    label: "Pre-screening",
    blurb: "Answering knockout questions and a recruiter call.",
    exitCriteria: "Passed the knockout questions and salary fit.",
  },
  {
    id: "interview",
    label: "Interview",
    blurb: "Meeting the hiring team against a scorecard.",
    exitCriteria: "Every scheduled interview has a submitted scorecard.",
  },
  {
    id: "selection",
    label: "Selection",
    blurb: "Debrief, offer approval, and offer out.",
    exitCriteria: "Offer accepted and signed.",
  },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export const STAGE_IDS = STAGES.map((s) => s.id) as StageId[];

export const stageIndex = (id: StageId) => STAGE_IDS.indexOf(id);

export const nextStage = (id: StageId): StageId | null =>
  STAGE_IDS[stageIndex(id) + 1] ?? null;

/** Terminal outcomes sit outside the pipeline rather than as a sixth stage. */
export type Outcome = "in_progress" | "hired" | "rejected" | "withdrawn";

export type RequisitionStatus =
  "draft" | "pending_approval" | "open" | "on_hold" | "closed";

export type Requisition = {
  id: Uuid;
  reference: string;
  title: string;
  department: string;
  location: string;
  employmentType: "full_time" | "contract" | "internship";
  workMode: "onsite" | "hybrid" | "remote";
  openings: number;
  status: RequisitionStatus;
  hiringManagerId: Uuid;
  recruiterId: Uuid;
  salaryMin: number;
  salaryMax: number;
  openedAt: string;
  targetStartDate: string;
  /** Free-text, rendered as a list in the UI. */
  mustHaves: string[];
  niceToHaves: string[];
  /** Knockout questions asked at pre-screening. */
  screeningQuestions: { id: string; question: string; knockout: boolean }[];
  /** Which of the five stages this role actually uses. Sourcing and selection
      are mandatory; the middle three can be skipped for junior roles. */
  activeStages: StageId[];
};

export type Candidate = {
  id: Uuid;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  currentTitle: string;
  currentCompany: string;
  yearsExperience: number;
  source: "careers_page" | "referral" | "linkedin" | "agency" | "sourced";
  referredBy?: string;
  expectedSalary?: number;
  noticePeriodWeeks?: number;
  cvFileName: string;
  linkedinUrl?: string;
};

export type Scorecard = {
  id: Uuid;
  applicationId: Uuid;
  interviewerId: Uuid;
  submittedAt: string | null;
  /** 1–5 per competency. */
  ratings: { competency: string; score: number }[];
  recommendation: "strong_yes" | "yes" | "no" | "strong_no" | null;
  notes: string;
};

export type Interview = {
  id: Uuid;
  applicationId: Uuid;
  kind: "recruiter_screen" | "technical" | "panel" | "final";
  scheduledFor: string;
  durationMins: number;
  interviewerIds: Uuid[];
  status: "scheduled" | "completed" | "cancelled" | "no_show";
};

export type Application = {
  id: Uuid;
  requisitionId: Uuid;
  candidateId: Uuid;
  stage: StageId;
  outcome: Outcome;
  appliedAt: string;
  /** ISO date the application entered its current stage — drives ageing. */
  stageEnteredAt: string;
  rating: number | null;
  rejectionReason?: string;
  /** Answers to the requisition's screening questions, keyed by question id. */
  screeningAnswers?: Record<string, string>;
  offer?: {
    grossMonthly: number;
    startDate: string;
    status: "draft" | "pending_approval" | "sent" | "accepted" | "declined";
    approvedBy?: Uuid;
  };
};

/* Joined shape the pipeline views actually render. */
export type PipelineCard = Application & {
  candidate: Candidate;
  requisition: Requisition;
  interviews: Interview[];
  scorecards: Scorecard[];
};
