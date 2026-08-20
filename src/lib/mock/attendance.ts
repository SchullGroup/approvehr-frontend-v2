import { EMPLOYEES } from "./people";
import { LEAVE_REQUESTS } from "./workflows";
import { TODAY } from "@/lib/today";

/**
 * Attendance seed data.
 *
 * The marketing site promises that "what time tracking records is what payroll
 * pays", which was a claim with no screen behind it until now. The point of this
 * module is that the days-present figure it produces is the same figure payroll
 * prorates against — see `lib/workflows/attendance.ts`.
 */

export type AttendanceStatus =
  | "present"
  | "late"
  | "absent"
  | "on_leave"
  | "holiday"
  | "rest_day";

export type AttendanceEntry = {
  id: string;
  employeeId: string;
  /** ISO date. One entry per employee per day, at most. */
  date: string;
  /** 24-hour local time, `HH:MM`. Absent when they never clocked in. */
  clockIn?: string;
  clockOut?: string;
  locationId?: string;
  /** Set by HR when they correct an entry, so a change is never silent. */
  note?: string;
};

/**
 * Where people clock in. A site team clocking in "at the office" is the exact
 * problem this solves, so a location is part of the record rather than an
 * afterthought.
 */
export type WorkLocation = {
  id: string;
  name: string;
  address: string;
  /** Whether clock-ins from off-site are accepted for this location. */
  remoteAllowed: boolean;
};

export const WORK_LOCATIONS: WorkLocation[] = [
  {
    id: "loc-hq",
    name: "Lagos HQ",
    address: "Victoria Island, Lagos",
    remoteAllowed: true,
  },
  {
    id: "loc-abuja",
    name: "Abuja office",
    address: "Central Business District, Abuja",
    remoteAllowed: true,
  },
  {
    id: "loc-site",
    name: "Abeokuta site",
    address: "Ogun State",
    remoteAllowed: false,
  },
  {
    id: "loc-remote",
    name: "Remote",
    address: "Anywhere",
    remoteAllowed: true,
  },
];

export const locationById = (id?: string) =>
  WORK_LOCATIONS.find((l) => l.id === id);

/**
 * Attendance policy.
 *
 * Deliberately company settings rather than constants, for the same reason
 * `workingDaysPerMonth` is: an office and a shift crew do not share a start
 * time, and a product that hardcodes 09:00 is telling a construction company it
 * was not built for them.
 */
export type AttendancePolicy = {
  /** `HH:MM`. Anything after this plus the grace period is late. */
  shiftStart: string;
  shiftEnd: string;
  /** Minutes after `shiftStart` that still count as on time. */
  graceMinutes: number;
  /** Days of the week that are working days. 0 = Sunday. */
  workingWeekdays: number[];
  /** Whether staff may clock themselves in, or only HR may record it. */
  selfServiceClockIn: boolean;
};

export const DEFAULT_POLICY: AttendancePolicy = {
  shiftStart: "08:00",
  shiftEnd: "17:00",
  graceMinutes: 15,
  workingWeekdays: [1, 2, 3, 4, 5],
  selfServiceClockIn: true,
};

/* -------------------------------------------------------------------- Seed */

/** The working days up to and including TODAY, most recent first. */
export function recentWorkingDays(count: number, policy = DEFAULT_POLICY) {
  const days: string[] = [];
  const cursor = new Date(TODAY);
  while (days.length < count) {
    if (policy.workingWeekdays.includes(cursor.getUTCDay())) {
      days.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return days;
}

/**
 * A deterministic pseudo-random source in [0, 1).
 *
 * `Math.random()` would give a different dataset on the server and the client —
 * a hydration mismatch, and a demo whose numbers change on every refresh.
 *
 * The finalising avalanche steps are load-bearing, not ceremony. A plain FNV-1a
 * hash followed by `Math.abs(h) / 2 ** 31` left the low bits badly correlated
 * across keys differing only in a trailing date, which produced a dataset where
 * one employee was absent fourteen days out of fifteen while nobody was ever
 * late. Both looked like plausible seed choices rather than a broken hash, which
 * is exactly why it is worth spelling out here.
 */
function hash(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Fifteen working days of history. Most people are on time, a few are
 * habitually a little late, and a couple of days are missed entirely — a
 * dataset where everyone is perfect would make the screen useless to look at.
 */
export const ATTENDANCE: AttendanceEntry[] = EMPLOYEES.flatMap((employee) =>
  recentWorkingDays(15).flatMap((date, dayIndex) => {
    /* Two independent draws. Using one for both "did they turn up" and "what
       time" meant the two were correlated: filtering today's roster to the low
       half of the draw also filtered out every late arrival, so the Late stat
       could never be anything but zero. */
    const seed = hash(`${employee.id}:${date}`);
    const showed = hash(`show:${employee.id}:${date}`);

    /* Someone on approved leave has nothing to clock. Generating an entry for
       them produced a row reading "On leave" and "clocked in at 07:46" at the
       same time, which is a contradiction rather than an edge case. */
    const covered = LEAVE_REQUESTS.some(
      (r) =>
        r.employeeId === employee.id &&
        r.status === "approved" &&
        r.from <= date &&
        r.to >= date,
    );
    if (covered) return [];

    /* TODAY is left partly empty on purpose: the point of the screen is a day
       in progress, with people still to clock in. */
    if (dayIndex === 0 && showed > 0.62) return [];

    /* A missed day, roughly one in eighteen. */
    if (showed > 0.945) return [];

    const lateProne = hash(employee.id) > 0.72;
    const base = 8 * 60 - 22; // 07:38
    /* Anyone can be a few minutes late; some people habitually are. The
       non-prone ceiling sits just past the grace period on purpose, so the
       Late column is occasionally non-zero for ordinary people too. */
    const drift = seed * (lateProne ? 66 : 41);
    const inMinutes = base + drift;
    const outMinutes = 17 * 60 + (seed - 0.5) * 60;

    const location =
      employee.location === "Abuja"
        ? "loc-abuja"
        : seed > 0.86
          ? "loc-remote"
          : employee.department === "Operations"
            ? "loc-site"
            : "loc-hq";

    return [
      {
        id: `att-${employee.id}-${date}`,
        employeeId: employee.id,
        date,
        clockIn: minutesToTime(inMinutes),
        /* No clock-out yet for today — people are still at work. */
        clockOut: dayIndex === 0 ? undefined : minutesToTime(outMinutes),
        locationId: location,
      },
    ];
  }),
);
