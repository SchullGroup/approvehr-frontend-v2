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

  grossMonthly: number;
  /** Nullable: payroll blocks on these, so their absence is meaningful. */
  bankName: string | null;
  bankAccount: string | null;
  pensionPin: string | null;
  pensionProvider: string | null;
  taxState: string;
  tin: string | null;
  nhfNumber: string | null;

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

export type RequisitionStatus = "draft" | "pending_approval" | "open" | "on_hold" | "closed";

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
