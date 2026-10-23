import { request } from "@/lib/api/client";

/**
 * Company reports: what the records say about the people side of the company,
 * worked out on the server by fixed rules, as one answer.
 *
 * Design: `docs/superpowers/specs/2026-10-22-company-report-design.md`. The
 * server half is `approvehr-api/src/modules/insights/company-report.ts`, whose
 * header is the better explanation of every rule below.
 *
 * ## Blocks arrive absent, not empty
 *
 * The server omits a block the caller may not see, or that has nothing to say:
 * `headline` is not in the response when nothing qualifies, `departments[].cost`
 * is not on a row for somebody without `VIEW_SALARIES`, `rules` is not there
 * without `VIEW_FAIRNESS`, and a department under five people comes back as a
 * row with **no figure keys at all**. So check for presence, never for a falsy
 * value (ADR 0003). A screen that prints `0` where a key is missing has made a
 * claim about the company.
 *
 * Every optional field below is optional for the reason `ReportsData` gives: a
 * browser cannot pin the version of the API it is talking to.
 */

export type ReviewStage =
  "DRAFT" | "SELF" | "MANAGER" | "CALIBRATION" | "PUBLISHED";

export type StageLabel =
  | "Draft"
  | "Self-reviews open"
  | "Manager reviews open"
  | "In calibration"
  | "Published";

export type ReportAxis = "results" | "process" | "fairness";

export type ReportBand =
  "OUTSTANDING" | "EXCEEDS" | "MEETS" | "PARTIALLY_MEETS" | "BELOW";

export type ReportAction = { id: string; label: string; href: string };

export type CoverageCell = {
  key: string;
  label: string;
  n: number;
  of: number;
  note?: string;
};

export type NotMeasured = { what: string; why: string };

export type NamedLine = {
  department: string;
  employeeId: string;
  name: string;
  /** One sentence that says why this person is on the list. */
  basis: string;
  marksMayMove: boolean;
};

export type FindingId =
  "F1" | "F2" | "F3" | "F4" | "F5" | "F6" | "F7" | "F8" | "F9" | "F10" | "F11";

export type ReportFinding = {
  id: FindingId;
  axis: ReportAxis;
  /** What the system will do about it, not a grade. */
  status: "blocks" | "weakens" | "info";
  statusLabel: string;
  title: string;
  figure: { n: number; of: number };
  /** Source, period and date first, then any detail lines. */
  evidence: string[];
  /** Present only where a rule of the system backs it. Never a prediction. */
  ifNothingChanges?: string;
  act?: { label: string; href: string };
  departments?: string[];
  /** F10 and F11 only. Grouped by department, sorted by name, never by score. */
  lines?: NamedLine[];
  caveats?: string[];
};

export type ReportStrength = {
  id: string;
  title: string;
  figure: { n: number; of: number };
  evidence: string;
};

export type HeadlineRule = "H1" | "H2" | "H3" | "H4" | "H5";

export type ReportHeadline = {
  rule: HeadlineRule;
  sentence: string;
  figure: { n: number; of: number };
  firstStep: { sentence: string; action?: ReportAction };
};

export type GoalFigures = {
  objectives: number;
  progressMean: number | null;
  atRiskOrOff: number;
};

export type DepartmentRow =
  | {
      id: string;
      name: string;
      headName: string | null;
      people: number;
      shown: false;
      reason: "small" | "protects";
    }
  | {
      id: string;
      name: string;
      headName: string | null;
      people: number;
      shown: true;
      results: {
        /** Basis points. Null when nobody in the department has a mark. */
        markMeanBp: number | null;
        scored: number;
        bands: Record<ReportBand, number>;
        goals: GoalFigures;
        tasks: { people: number; withLogged: number; withGraded: number };
      };
      process: {
        withAppraiser: number;
        withAgreedObjective: number;
        reviewsWritten: number;
        reviewsExpected: number;
        /** Present with `VIEW_FAIRNESS`. */
        flagged?: { open: number; total: number };
      };
      /** Present with `VIEW_FAIRNESS`, and only when the rest of the company is big enough to compare with. */
      fairness?: {
        gapBp: number;
        lowBp: number | null;
        highBp: number | null;
        flagged: boolean;
      };
      /** Present with `VIEW_SALARIES`. Integer kobo. */
      cost?: { perHeadKobo: number; totalKobo: number; paid: number };
    };

export type ShownDepartment = Extract<DepartmentRow, { shown: true }>;

export type ReportDepartments = {
  rows: DepartmentRow[];
  company: {
    people: number;
    markMeanBp: number | null;
    goalProgressMean: number | null;
    /** `VIEW_SALARIES` only. Integer kobo. */
    perHeadKobo?: number;
  };
  /** Departments left out of the figures by the five-person rule. */
  notShown: number;
  /** The payroll the cost comes from. `VIEW_SALARIES` only. */
  costFrom?: { period: string; status: string };
  /** Said wherever departments are compared. */
  caveat: string;
};

export type CompanyReport = {
  asOf: string;
  cycle: {
    id: string;
    name: string;
    stage: ReviewStage;
    stageLabel: StageLabel;
    published: boolean;
    marksMayMove: boolean;
  } | null;
  cycles: {
    id: string;
    name: string;
    stage: ReviewStage;
    stageLabel: StageLabel;
  }[];
  /** **Absent** when nothing qualifies. A clean absence, not a placeholder. */
  headline?: ReportHeadline;
  coverage: { cells: CoverageCell[]; notMeasured: NotMeasured[] };
  findings: ReportFinding[];
  strengths?: ReportStrength[];
  actions: ReportAction[];
  departments?: ReportDepartments;
  rules?: { minGroup: number };
};

export type DepartmentPeople = {
  department: { id: string; name: string };
  cycle: { id: string; name: string; marksMayMove: boolean };
  people: {
    employeeId: string;
    name: string;
    jobTitle: string;
    markBp: number | null;
    bandLabel: string | null;
    why: string[];
  }[];
  caveats: string[];
};

/** The dashboard banner's answer: the headline alone, absent when there is none. */
export type CompanyHeadlineAnswer = {
  headline?: ReportHeadline;
  cycle?: { id: string; name: string };
};

/**
 * The headlines this build knows how to print.
 *
 * A browser cannot pin the version of the API it talks to, so a headline with a
 * rule this build was not written against is not printed. See `printableHeadline`
 * in `insights.ts` for the same rule applied to the retired explorer headline.
 */
const KNOWN_RULES: readonly string[] = ["H1", "H2", "H3", "H4", "H5"];

export function printableCompanyHeadline(
  headline: ReportHeadline | null | undefined,
): ReportHeadline | null {
  if (!headline) return null;
  if (!KNOWN_RULES.includes(headline.rule)) return null;
  if (headline.sentence.trim() === "") return null;
  return headline;
}

export const companyReportApi = {
  get: (cycleId?: string, signal?: AbortSignal): Promise<CompanyReport> =>
    request<CompanyReport>("/insights/company-report", {
      query: { cycleId },
      signal,
    }),

  /** The headline alone, for the dashboard banner. Kept briefly by the server. */
  headline: (signal?: AbortSignal): Promise<CompanyHeadlineAnswer> =>
    request<CompanyHeadlineAnswer>("/insights/company-report/headline", {
      signal,
    }),

  /** Everyone in one department of five or more. By name, never by score. */
  people: (
    departmentId: string,
    cycleId?: string,
    signal?: AbortSignal,
  ): Promise<DepartmentPeople> =>
    request<DepartmentPeople>(
      `/insights/company-report/departments/${departmentId}/people`,
      { query: { cycleId }, signal },
    ),

  /**
   * Tell the server the report is about to be printed to PDF.
   *
   * Called **before** the print dialog opens, and the dialog does not open if it
   * fails: a trail that records only the prints somebody completed can be
   * defeated by closing the dialog. `EXPORT_DATA` and `EDIT_RECORDS` both.
   */
  printed: (cycleId: string, sections: readonly string[]): Promise<void> =>
    request<void>("/exports/company-report/printed", {
      method: "POST",
      body: { cycleId, sections },
    }),
};

/* ------------------------------------------------------------------ wording */

/** Basis points as a percentage with one decimal and no trailing zero: 8518 is "85.2%". */
export const markPercent = (bp: number): string =>
  `${String(Math.round(bp / 10) / 10)}%`;

/** Points between two marks: 1640 is "16.4". */
export const pointsBetween = (bp: number): string =>
  String(Math.round(Math.abs(bp) / 10) / 10);

/** "5 of 7". Every figure in a report carries its own denominator. */
export const ofLabel = (figure: { n: number; of: number }): string =>
  `${String(figure.n)} of ${String(figure.of)}`;
