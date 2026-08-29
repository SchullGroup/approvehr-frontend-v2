"use client";

import { request } from "@/lib/api/client";
import {
  type OvertimeKind,
  type OvertimePolicy,
  type OvertimeStatus,
  type OvertimeHourlyBasis,
} from "@/lib/overtime/derive";

/**
 * Overtime — `/api/v1/overtime`.
 *
 * ## Nothing here is filed by anybody
 *
 * There is no create endpoint, deliberately. `POST /overtime/detect` reads the
 * attendance already recorded for a month and writes one row per person per day.
 * It is idempotent, so working a month out twice cannot pay anybody twice, and a
 * row already on a payslip is left alone.
 *
 * | Action | Endpoint | Needs |
 * |---|---|---|
 * | Read the policy | `GET /overtime/policy` | nothing |
 * | Change the policy | `PATCH /overtime/policy` | `MANAGE_PAY_STRUCTURE` |
 * | Read everybody's | `GET /overtime` | `VIEW_SALARIES` |
 * | Read your own | `GET /overtime/mine` | nothing — it is your pay |
 * | Work a month out | `POST /overtime/detect` | `RUN_PAYROLL` |
 * | Approve or decline | `POST /overtime/:id/decide` | `APPROVE_LEAVE_ALL` |
 *
 * `APPROVE_LEAVE_ALL` is reused rather than a second permission minted: whoever
 * signs off a person's absence signs off their extra hours.
 *
 * ## The money, and why this module is the odd one out
 *
 * Every other module speaks integer **kobo** on the wire. This one does not: the
 * service stores naira into a `Decimal(14,2)` column and hands the rows straight
 * back, so `amount` and `hourlyRate` arrive as decimal *strings* — `"14062.50"`.
 * They are converted to integer kobo here, at the boundary, so screens see the
 * same units as everywhere else and no component ever multiplies by 100.
 * `naira()` at the bottom is the only division on this side.
 *
 * ## Two refusals to show verbatim
 *
 * - "You cannot approve your own overtime." Guard for it before offering the
 *   button; the API refuses regardless.
 * - "Overtime is switched off. Turn it on in Settings before working it out."
 *
 * ## `awaitingApproval` is company-wide, even from `/mine`
 *
 * The aggregate on the API is filtered by status only — not by employee, not by
 * period — on both endpoints. It is the right figure for the approver's screen
 * and the **wrong** figure for a personal one, where it would show somebody the
 * whole company's pending total as though it were theirs. A personal screen adds
 * its own rows up.
 *
 * ## Nothing here moves money
 *
 * `PAID` means a payroll run took the hours onto a payslip, which is why this
 * module labels that status "On a payslip" rather than "Paid". Bank transfers are
 * not wired anywhere in this product.
 */

/* ------------------------------------------------------------------ the wire */

type WirePolicy = {
  enabled: boolean;
  graceMinutes: number;
  dailyCapMinutes: number;
  weekdayRate: number | string;
  weekendRate: number | string;
  holidayRate: number | string;
  requiresApproval: boolean;
  hoursPerDay: number;
  hourlyBasis?: OvertimeHourlyBasis;
};

type WireRecord = {
  id: string;
  employeeId: string;
  /** A `@db.Date` column: midnight UTC, serialised as a full timestamp. */
  onDate: string;
  minutes: number;
  kind: OvertimeKind;
  rate: number | string;
  /** Naira, not kobo. See the header. */
  hourlyRate: number | string;
  amount: number | string;
  status: OvertimeStatus;
  approvedById: string | null;
  approvedAt: string | null;
  declinedReason: string | null;
  payslipId: string | null;
  note: string | null;
  employee: { employeeNo: string; firstName: string; lastName: string };
};

type WireList = {
  rows: WireRecord[];
  total: number;
  awaitingApproval: {
    count: number;
    minutes: number;
    amount: number | string;
  };
};

/* ----------------------------------------------------------------- the money */

/**
 * A naira decimal string to whole kobo. The only multiplication on this side.
 *
 * `Number()` then round: the values are two-decimal fixed point in the database,
 * so the float cannot be off by more than a fraction of a kobo before rounding
 * puts it back on the integer.
 */
const koboOf = (value: number | string): number =>
  Math.round(Number(value) * 100);

/** Kobo to naira, for the screen. The only division by 100 on this side. */
export const naira = (kobo: number): number => Math.round(kobo) / 100;

/* ---------------------------------------------------------------- the shapes */

/** One day of somebody's overtime, in the units the app uses. */
export type OvertimeRecord = {
  id: string;
  employeeId: string;
  employeeNo: string | null;
  name: string;
  /** `YYYY-MM-DD`. */
  onDate: string;
  /** What is paid for, after the daily cap. */
  minutes: number;
  /**
   * What the clock actually said, before the cap. `null` from the API, which
   * does not keep it — only the local derivation knows the uncapped figure.
   */
  rawMinutes: number | null;
  kind: OvertimeKind;
  rate: number;
  hourlyRateKobo: number;
  amountKobo: number;
  status: OvertimeStatus;
  declinedReason: string | null;
  /** True once a payroll run has taken it onto a payslip. */
  onPayslip: boolean;
};

export type OvertimeList = {
  rows: OvertimeRecord[];
  total: number;
  /** Company-wide and every month, on both endpoints. See the header. */
  awaitingApproval: { count: number; minutes: number; amountKobo: number };
};

export type OvertimeListParams = {
  status?: OvertimeStatus;
  employeeId?: string;
  /** `YYYY-MM-DD`, inclusive. */
  from?: string;
  to?: string;
  take?: number;
  skip?: number;
};

function toPolicy(wire: WirePolicy): OvertimePolicy {
  return {
    enabled: wire.enabled,
    graceMinutes: wire.graceMinutes,
    dailyCapMinutes: wire.dailyCapMinutes,
    /* A rate is four significant figures — safely a float, unlike money. */
    weekdayRate: Number(wire.weekdayRate),
    weekendRate: Number(wire.weekendRate),
    holidayRate: Number(wire.holidayRate),
    requiresApproval: wire.requiresApproval,
    hoursPerDay: wire.hoursPerDay,
    /* Absent means an API older than the column. CALENDAR_DAYS is the API's own
       default for a new company, and reading an absence as the other one would
       show a preview a third away from what the payslip gets. */
    hourlyBasis: wire.hourlyBasis ?? "CALENDAR_DAYS",
  };
}

function toRecord(wire: WireRecord): OvertimeRecord {
  return {
    id: wire.id,
    employeeId: wire.employeeId,
    employeeNo: wire.employee?.employeeNo ?? null,
    name: wire.employee
      ? `${wire.employee.firstName} ${wire.employee.lastName}`
      : "Unknown",
    onDate: wire.onDate.slice(0, 10),
    minutes: wire.minutes,
    rawMinutes: null,
    kind: wire.kind,
    rate: Number(wire.rate),
    hourlyRateKobo: koboOf(wire.hourlyRate),
    amountKobo: koboOf(wire.amount),
    status: wire.status,
    declinedReason: wire.declinedReason,
    onPayslip: wire.payslipId !== null,
  };
}

function toList(wire: WireList): OvertimeList {
  return {
    rows: wire.rows.map(toRecord),
    total: wire.total,
    awaitingApproval: {
      count: wire.awaitingApproval.count,
      minutes: wire.awaitingApproval.minutes,
      amountKobo: koboOf(wire.awaitingApproval.amount),
    },
  };
}

const listQuery = (params: OvertimeListParams) => ({
  status: params.status,
  employeeId: params.employeeId,
  from: params.from,
  to: params.to,
  take: params.take ?? 100,
  skip: params.skip ?? 0,
});

/* ------------------------------------------------------------------- the api */

export const overtimeApi = {
  policy: async (signal?: AbortSignal): Promise<OvertimePolicy> =>
    toPolicy(await request<WirePolicy>("/overtime/policy", { signal })),

  /** Partial by design: send only what changed. */
  updatePolicy: (patch: Partial<OvertimePolicy>) =>
    request<{ id: string }>("/overtime/policy", { method: "PATCH", body: patch }),

  list: async (
    params: OvertimeListParams = {},
    signal?: AbortSignal,
  ): Promise<OvertimeList> =>
    toList(
      await request<WireList>("/overtime", { query: listQuery(params), signal }),
    ),

  /** Your own, whatever permissions you hold. */
  mine: async (
    params: OvertimeListParams = {},
    signal?: AbortSignal,
  ): Promise<OvertimeList> =>
    toList(
      await request<WireList>("/overtime/mine", {
        query: listQuery(params),
        signal,
      }),
    ),

  /** `period` is `YYYY-MM`. Reads attendance; writes one row per person per day. */
  workOut: (period: string) =>
    request<{ found: number; written: number; skippedPaid: number }>(
      "/overtime/detect",
      { method: "POST", body: { period } },
    ),

  decide: (id: string, body: { approve: boolean; reason?: string }) =>
    request<{ id: string; status: "APPROVED" | "DECLINED" }>(
      `/overtime/${id}/decide`,
      { method: "POST", body },
    ),
};

/* ---------------------------------------------------------------- for screens */

/** `95` → `1h 35m`. Minutes alone below an hour, because `0h 35m` reads badly. */
export function hoursLabel(minutes: number): string {
  const whole = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (whole === 0) return `${rest}m`;
  if (rest === 0) return `${whole}h`;
  return `${whole}h ${rest}m`;
}

/** For a heading: `360` → `6 hours`, `90` → `1 hour 30 minutes`. */
export function spokenHours(minutes: number): string {
  const whole = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hours = whole === 0 ? "" : `${whole} ${whole === 1 ? "hour" : "hours"}`;
  const mins = rest === 0 ? "" : `${rest} ${rest === 1 ? "minute" : "minutes"}`;
  return [hours, mins].filter(Boolean).join(" ") || "no time";
}

export const KIND_LABEL: Record<OvertimeKind, string> = {
  WEEKDAY: "Weekday",
  WEEKEND: "Weekend",
  PUBLIC_HOLIDAY: "Public holiday",
};

/**
 * `PAID` reads "On a payslip".
 *
 * Because that is what it means, and because a green "Paid" that moved no money
 * is the failure this product exists to not have.
 */
export const STATUS_LABEL: Record<OvertimeStatus, string> = {
  PENDING: "Waiting",
  APPROVED: "Approved",
  DECLINED: "Declined",
  PAID: "On a payslip",
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** `2026-08` → `August 2026`. */
export function monthLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const name = MONTHS[(month ?? 1) - 1] ?? period;
  return `${name} ${year}`;
}

/** `2026-08-12` → `Wed 12 Aug`. Parsed as UTC, never local. */
export function dayLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  const day = DAYS[date.getUTCDay()] ?? "";
  const month = (MONTHS[date.getUTCMonth()] ?? "").slice(0, 3);
  return `${day} ${date.getUTCDate()} ${month}`;
}

/** `2026-08-12` → `2026-08`. */
export const periodOf = (isoDate: string): string => isoDate.slice(0, 7);

/** First and last day of a `YYYY-MM`, as the API's `from` and `to`. */
export function periodRange(period: string): { from: string; to: string } {
  const [year, month] = period.split("-").map(Number);
  const y = year ?? 1970;
  const m = month ?? 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: `${period}-01`,
    to: `${period}-${String(last).padStart(2, "0")}`,
  };
}

/** The month a date falls in, and the months before it, newest first. */
export function recentPeriods(isoDate: string, count = 12): string[] {
  const [year, month] = periodOf(isoDate).split("-").map(Number);
  const periods: string[] = [];
  for (let back = 0; back < count; back++) {
    const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1 - back, 1));
    periods.push(
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  }
  return periods;
}

/**
 * `1.5` → `one and a half times`.
 *
 * Spelled out for the multipliers a contract actually uses, and left as digits
 * for anything else — "1.35 times" is clearer than a phrase nobody says.
 */
export function multiplierWords(rate: number): string {
  const words: Record<string, string> = {
    "1": "the same as",
    "1.25": "one and a quarter times",
    "1.5": "one and a half times",
    "1.75": "one and three quarter times",
    "2": "twice",
    "2.5": "two and a half times",
    "3": "three times",
    "4": "four times",
    "5": "five times",
  };
  return words[String(rate)] ?? `${rate} times`;
}
