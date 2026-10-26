"use client";

import { useSyncExternalStore } from "react";
import { createPersistedState } from "@/lib/store/persisted";
import type {
  DemoEmployee,
  DemoHire,
  DemoJob,
  HiredBook,
  Op,
} from "./demo-ops";

/**
 * The demo's Hired list, kept in this browser.
 *
 * A hire made an employee here is still one on the next screen and after a refresh,
 * and a person marked as not joining stays marked. Everything below `seed` is behind
 * `DEMO_ENABLED`, so a production build holds an empty book and none of the invented
 * people, jobs or employees.
 *
 * The seed is a spread rather than a handful, on purpose: one job with twenty-odd
 * people is what makes paging, "select all matching" and a bulk action worth seeing.
 */

const DAY = 86_400_000;
const NOW_MS = Date.parse("2026-08-19T09:00:00.000Z");

const iso = (daysAgo: number, hour = 9): string =>
  new Date(NOW_MS - daysAgo * DAY + (hour - 9) * 3_600_000).toISOString();
const dateOnly = (daysFromNow: number): string =>
  new Date(NOW_MS + daysFromNow * DAY).toISOString().slice(0, 10);

const FIRST = [
  "Adaeze",
  "Tunde",
  "Bola",
  "Kemi",
  "Seun",
  "Ifeoma",
  "Yusuf",
  "Amaka",
  "Dayo",
  "Halima",
  "Obinna",
  "Funmi",
  "Segun",
  "Nneka",
  "Tobi",
  "Hauwa",
  "Emeka",
  "Folake",
  "Musa",
  "Chiamaka",
  "Rotimi",
  "Zainab",
  "Ikenna",
  "Bisi",
  "Kunle",
  "Aisha",
  "Uche",
  "Damilola",
];
const LAST = [
  "Adeyemi",
  "Okafor",
  "Bello",
  "Nwosu",
  "Balogun",
  "Eze",
  "Danjuma",
  "Oladipo",
  "Ibrahim",
  "Okonkwo",
  "Afolabi",
  "Umar",
  "Chukwu",
  "Salami",
  "Obi",
  "Lawal",
  "Onuoha",
  "Ajayi",
  "Sani",
  "Idowu",
  "Akpan",
  "Williams",
  "Mohammed",
  "Fashola",
  "Nnamdi",
  "Abiola",
  "Etim",
  "Ogundipe",
  "Hassan",
  "Olawale",
  "Eke",
];

const SOURCES = [
  "careers-page",
  "linkedin",
  "referral",
  "careers-page",
  "jobberman",
  "careers-page",
];

function person(index: number): { name: string; email: string; phone: string } {
  const first = FIRST[index % FIRST.length] ?? "Ada";
  const last = LAST[(index * 5 + 3) % LAST.length] ?? "Obi";
  return {
    name: `${first} ${last}`,
    email: `${first}.${last}@mail.com`.toLowerCase(),
    phone: `+234 80${String(3 + (index % 6))} ${String(100 + index)} ${String(1000 + index * 13)}`,
  };
}

/** What each demo job pays a month, in naira. */
const PAY: Record<string, number> = {
  "req-01": 1_500_000,
  "req-02": 780_000,
  "req-03": 1_100_000,
  "req-cs": 420_000,
  "req-boot": 150_000,
};

/** The same blank book a production build holds: nobody, nowhere. */
const EMPTY: HiredBook = {
  hires: [],
  employees: [],
  jobs: [],
  settings: { onOfferAccepted: "HIRED_LIST_ONLY", coreHr: true },
};

function seed(): HiredBook {
  if (!DEMO_ENABLED) return EMPTY;

  const jobs: DemoJob[] = [
    {
      id: "req-01",
      title: "Senior Backend Engineer",
      reference: "ENG-114",
      department: "Engineering",
      employmentType: "FULL_TIME",
      headcount: 2,
      status: "FILLED",
    },
    {
      id: "req-02",
      title: "Payroll Analyst",
      reference: "FIN-032",
      department: "Finance",
      employmentType: "FULL_TIME",
      headcount: 1,
      status: "FILLED",
    },
    {
      id: "req-03",
      title: "Product Designer",
      reference: "PRD-009",
      department: "Product",
      employmentType: "FULL_TIME",
      headcount: 1,
      status: "OPEN",
    },
    {
      id: "req-cs",
      title: "Customer Success Associate",
      reference: "CS-021",
      department: "Support",
      employmentType: "FULL_TIME",
      headcount: 4,
      status: "OPEN",
    },
    {
      id: "req-boot",
      title: "Boot camp associate",
      reference: "BOOT-2026",
      department: "Learning",
      employmentType: "INTERN",
      headcount: 24,
      status: "OPEN",
    },
  ];

  const hires: DemoHire[] = [];
  let index = 0;
  const add = (
    jobId: string,
    acceptedDaysAgo: number,
    startInDays: number,
    extra: Partial<DemoHire> = {},
  ) => {
    const who = person(index);
    hires.push({
      id: `hire-${String(index + 1)}`,
      ...who,
      jobId,
      source: SOURCES[index % SOURCES.length] ?? null,
      acceptedAt: iso(acceptedDaysAgo, 9 + (index % 7)),
      startDate: dateOnly(startInDays),
      grossMonthlyNaira: PAY[jobId] ?? 400_000,
      employeeId: null,
      employeeVia: null,
      didNotJoin: null,
      ...extra,
    });
    index += 1;
  };

  /* Senior Backend Engineer: two hired, one already an employee. */
  add("req-01", 31, -3, { employeeId: "emp-demo-1", employeeVia: "CREATED" });
  add("req-01", 24, 12);
  /* Payroll Analyst: one place, one person, not yet an employee. */
  add("req-02", 18, 9);
  /* Product Designer: the one who accepted did not join, so the job reopened. */
  add("req-03", 21, 6, {
    didNotJoin: {
      reason: "Took a counter-offer from her current employer.",
      at: iso(5),
      by: "Amina Yusuf",
    },
  });
  /* Customer Success Associate: three of four places taken. */
  add("req-cs", 14, 20);
  add("req-cs", 12, 20);
  add("req-cs", 9, 27);
  /* Boot camp: a large intake, so the list pages and "select all" is worth seeing. */
  for (let n = 0; n < 22; n += 1) {
    add("req-boot", 16 - (n % 12), 30 + (n % 3) * 7);
  }

  /* One hire shares an email with somebody already on the books, to show the link. */
  const clash = hires[index - 3];
  const employees: DemoEmployee[] = [
    {
      id: "emp-demo-1",
      employeeNo: "EMP-1001",
      name: hires[0]?.name ?? "Ada Obi",
      email: hires[0]?.email ?? "ada.obi@mail.com",
    },
  ];
  if (clash) {
    employees.push({
      id: "emp-demo-existing",
      employeeNo: "EMP-0457",
      name: clash.name,
      email: clash.email,
    });
  }

  return {
    hires,
    employees,
    jobs,
    settings: { onOfferAccepted: "HIRED_LIST_ONLY", coreHr: true },
  };
}

/** Bump when the book's shape changes: an old payload is dropped, not merged. */
const BOOK_VERSION = 1;

export const demoHired = createPersistedState<HiredBook>({
  key: "approvehr.hiring.hired.store",
  empty: seed(),
  version: BOOK_VERSION,
});

/** The book, for rendering. Re-renders when anything changes it. */
export function useDemoHired(): HiredBook {
  return useSyncExternalStore(
    demoHired.subscribe,
    demoHired.read,
    demoHired.getServerSnapshot,
  );
}

/**
 * Run a write against the book and keep the result.
 *
 * Read with `current()`, never `read()`: until something subscribes `read()` is
 * the seed, and committing a write computed from it would throw away everything
 * this browser had stored. See `persisted.ts`.
 */
export function hiredRun<T>(write: (book: HiredBook) => Op<T>): Op<T> {
  const result = write(demoHired.current());
  if (result.ok) demoHired.commit(result.book);
  return result;
}
