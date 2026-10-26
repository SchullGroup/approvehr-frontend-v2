"use client";

import { request } from "@/lib/api/client";
import { kindOf } from "@/lib/api/failure";

/**
 * What is true for the signed-in person today — `/api/v1/me`.
 *
 * `GET /me/today` is one aggregation endpoint with eight sections, and the types
 * here are the contract it is built against (`src/modules/me/types.ts` on the API
 * and `docs/superpowers/specs/2026-10-20-today-panel-design.md`). Dates are
 * `YYYY-MM-DD` and mean the **company's** calendar day; instants are ISO 8601 UTC;
 * money is integer kobo and stays kobo until it is drawn; clock times are `HH:MM`
 * in the company's zone.
 *
 * ## Every section answers for itself
 *
 * The endpoint is a 200 whatever the sections do, and each one comes back as one
 * of three things:
 *
 * | `status` | Means | The panel |
 * |---|---|---|
 * | `ok` | Here is the data. It may be a true empty. | renders it |
 * | `unavailable` | Does not apply to this person or company. | renders **nothing** |
 * | `error` | Could not be read just now. | a quiet retry on that card only |
 *
 * `unavailable` is not a failure and not a zero. A person with no staff record has
 * no leave balance, and "0 days left" would say they had used it. So read a section
 * through `sectionData`, which gives the data or `null` and nothing in between, and
 * never test the data for falsiness: `pay.latestPayslip` is `null` when there is no
 * payslip, and a net pay of 0 is a thing nobody has decided.
 *
 * ## Why the section key is always there
 *
 * Unlike `/insights/dashboard`, which omits a block the caller may not see, this
 * response has to say *failed* differently from *not for you*, and an omitted key
 * cannot. The `Partial` is for `?sections=`: only what was asked for comes back.
 *
 * ## Polling
 *
 * The global limiter is 300 requests per quarter-hour per session. Read the whole
 * panel no more than once a minute (the store rides `useRevalidation`, which has a
 * floor), and refresh one section after the person acts on it rather than on a
 * timer.
 */

/* ------------------------------------------------------------------- shapes */

export const TODAY_SECTION_NAMES = [
  "announcements",
  "policies",
  "pay",
  "leave",
  "advance",
  "tasks",
  "oneOnOne",
  "clockIn",
] as const;

export type TodaySectionName = (typeof TODAY_SECTION_NAMES)[number];

/** Why a section does not apply. Every one is a switch somebody can already see. */
export type TodayUnavailableReason =
  "no_staff_record" | "feature_off" | "policy_off" | "not_in_plan";

export type TodaySection<T> =
  | { status: "ok"; data: T }
  | { status: "unavailable"; reason: TodayUnavailableReason }
  | {
      status: "error";
      code: "section_failed" | "section_timeout";
      /** Safe to show. Never carries the cause. */
      message: string;
    };

export type ApiTodayNotice = {
  id: string;
  title: string;
  /** Plain text, up to 4,000 characters. Never HTML. */
  body: string;
  pinned: boolean;
  /** Staff are expected to open it. It marks and counts and blocks nothing. */
  mandatory: boolean;
  publishedAt: string;
  postedByName: string | null;
  /** Empty when it is for everybody. */
  departmentNames: string[];
  read: boolean;
  readAt: string | null;
};

export type AnnouncementsToday = {
  /**
   * At most five: mandatory unread first, then the other unread, then read, each
   * group pinned first then newest. The order is the API's and is kept.
   */
  notices: ApiTodayNotice[];
  /**
   * Visible to this person and not yet read, mandatory or not. Not capped at
   * five. A badge: "notices I have not opened". It is **not** the to-do count,
   * which is `mandatoryUnread` (see `noticeTodoCount`).
   */
  unread: number;
  /**
   * Of `unread`, the ones staff are expected to open. Not capped at five: with
   * seven unread the list shows five, all mandatory, and this says 7.
   *
   * Absent from an API that predates it, which is why callers go through
   * `noticeTodoCount` rather than reading it bare.
   */
  mandatoryUnread: number;
  /** Visible to this person. Not capped at five. */
  total: number;
};

/**
 * How many notices are a task.
 *
 * `mandatoryUnread`, never `unread`: an unread notice that nobody has to read is
 * something to look at and not something to do, and a to-do count that included
 * every one would make the tab shout about a canteen menu. An API that predates
 * the field sends no number at all, and then every unread notice counts, as it did
 * before there was a difference. A missing figure is not a zero.
 */
export function noticeTodoCount(section: AnnouncementsToday): number {
  return typeof section.mandatoryUnread === "number"
    ? section.mandatoryUnread
    : section.unread;
}

export type PoliciesToday = {
  /** Up to five awaiting acknowledgement, newest published first. */
  outstanding: {
    id: string;
    title: string;
    category: string | null;
    version: number;
    publishedAt: string | null;
    /** Set when they accepted an earlier version: a re-ask, not a first ask. */
    previouslyAcceptedVersion: number | null;
  }[];
  /** All of them, not capped. */
  total: number;
};

export type PayToday = {
  /** The next pay date on a run that includes this person, or null. */
  nextPayday: {
    date: string;
    /** `YYYY-MM` */
    period: string;
    state: "planned" | "approved" | "paid";
  } | null;
  /** Their latest payslip on an approved or paid run, or null. Never a zero. */
  latestPayslip: {
    /** Open it with `GET /payroll/payslips/:id`. */
    id: string;
    /** `YYYY-MM` */
    period: string;
    payDate: string;
    netKobo: number;
    paid: boolean;
  } | null;
};

export type LeaveToday = {
  year: number;
  /** Every type they have an entitlement in, largest first. */
  balances: {
    leaveTypeId: string;
    leaveType: string;
    entitled: number;
    taken: number;
    pending: number;
    remaining: number;
  }[];
};

export type AdvanceToday = {
  /** `YYYY-MM` */
  period: string;
  eligible: boolean;
  /** What they could ask for now. Null when there is no salary on file. */
  availableKobo: number | null;
  /** One sentence saying why not, or null when they can. */
  refusal: string | null;
  minAmountKobo: number;
  feeKobo: number;
  outstandingKobo: number;
  /** Must be shown wherever `availableKobo` is. */
  estimateNotice: string;
};

export type ApiTodayTaskGrade = "PARTIALLY_COMPLETED" | "REJECTED";

export type TasksToday = {
  week: { start: string; end: string; daysLeft: number };
  /** Agreed objectives they own. Zero means there is nothing to log against. */
  objectives: number;
  loggedThisWeek: number;
  awaitingGrade: number;
  /** Graded partly done or rejected in the last 14 days, newest first, up to five. */
  needsAttention: {
    id: string;
    goalTitle: string;
    description: string;
    grade: ApiTodayTaskGrade;
    gradeNote: string | null;
    gradedAt: string;
  }[];
};

export type OneOnOneToday = {
  activeSeries: number;
  /** The earliest meeting not yet held, or null when none is scheduled. */
  next: {
    meetingId: string;
    seriesId: string;
    date: string;
    withEmployeeId: string;
    withName: string;
    role: "manager" | "report";
    cadence: "WEEKLY" | "FORTNIGHTLY" | "MONTHLY" | "QUARTERLY";
    cadenceLabel: string;
  } | null;
};

export type ClockInToday = {
  date: string;
  state: "not_clocked_in" | "clocked_in" | "clocked_out";
  clockInAt: string | null;
  clockOutAt: string | null;
  /** `HH:MM`, company zone. */
  clockIn: string | null;
  clockOut: string | null;
  /** An earlier day clocked into and never out of. */
  earlierOpen: { date: string; clockIn: string } | null;
};

export type ApiTodaySections = {
  announcements: TodaySection<AnnouncementsToday>;
  policies: TodaySection<PoliciesToday>;
  pay: TodaySection<PayToday>;
  leave: TodaySection<LeaveToday>;
  advance: TodaySection<AdvanceToday>;
  tasks: TodaySection<TasksToday>;
  oneOnOne: TodaySection<OneOnOneToday>;
  clockIn: TodaySection<ClockInToday>;
};

export type ApiToday = {
  /** The instant the server answered. */
  asOf: string;
  /** Only the sections asked for; all eight when none were named. */
  sections: Partial<ApiTodaySections>;
};

/* ------------------------------------------------------------------ helpers */

/**
 * The data of a section that answered, or `null` for everything else.
 *
 * One function so a screen cannot treat "this does not apply to you" or "this
 * failed" as an empty list. `null` here is **absent**, never zero.
 */
export function sectionData<T>(section: TodaySection<T> | undefined): T | null {
  return section?.status === "ok" ? section.data : null;
}

/** Whether a section was asked for, answered, and failed. */
export function sectionFailed<T>(
  section: TodaySection<T> | undefined,
): section is Extract<TodaySection<T>, { status: "error" }> {
  return section?.status === "error";
}

/**
 * The API this build is talking to does not have `/me/today` at all.
 *
 * A browser cannot pin the version of the API behind it: a deploy puts a new
 * bundle in front of people while the API is whatever it is. The route takes no
 * id, so a 404 cannot mean "that record is gone", only "this deployment does not
 * have it yet", and the panel draws nothing for it rather than an error card on
 * the first screen everybody opens.
 */
export function todayEndpointMissing(error: unknown): boolean {
  return kindOf(error) === "missing";
}

/**
 * Whole calendar days from one `YYYY-MM-DD` to another, or `null` if either is
 * not one.
 *
 * Counted on the date parts as UTC calendar days, never on instants and never
 * through the browser's zone: `new Date("2026-10-22")` is midnight UTC, which is
 * still the 21st in New York, and "tomorrow" read off that is a day wrong. Both
 * sides here are already the company's calendar days, so this is plain
 * arithmetic on them.
 */
export function calendarDaysBetween(from: string, to: string): number | null {
  const parts = (day: string): number | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    if (!match) return null;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  };
  const start = parts(from);
  const end = parts(to);
  if (start === null || end === null) return null;
  return Math.round((end - start) / 86_400_000);
}

/* -------------------------------------------------------------------- calls */

export const meApi = {
  /**
   * The Today panel.
   *
   * `sections` limits the answer to those names, so one card can be refreshed
   * after the person acts on it. Absent asks for all eight. The query is built
   * here, once, as the comma-separated list the API reads.
   */
  today(
    sections?: readonly TodaySectionName[],
    signal?: AbortSignal,
  ): Promise<ApiToday> {
    return request<ApiToday>("/me/today", {
      ...(sections && sections.length > 0
        ? { query: { sections: sections.join(",") } }
        : {}),
      ...(signal ? { signal } : {}),
    });
  },

  /**
   * "This account opened the app today."
   *
   * 204 and no body whatever happened (first open of the day, a repeat, or the
   * company having tracking off), so there is nothing to read. The caller sends it
   * once per app load and ignores the answer; see `AppOpenBeacon`.
   */
  appOpen(): Promise<void> {
    return request<void>("/me/app-open", { method: "POST" });
  },
};
