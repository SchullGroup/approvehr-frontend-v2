"use client";

import { useSyncExternalStore } from "react";
import { EMPLOYEES } from "@/lib/mock/people";
import { createPersistedState } from "@/lib/store/persisted";
import type { AccessBook, DemoGrant, DemoJobAccess, Op } from "./demo-ops";

/**
 * The demo's access to jobs, kept in this browser.
 *
 * One job is restricted, with a hiring manager, a recruiter, two panelists (one of them
 * a sign-in with no employee record) and an invitation nobody has accepted. The others
 * are open, with a hiring manager and a panelist. Everything below `seed` is behind
 * `DEMO_ENABLED`, so a production build holds an empty book and none of the invented
 * people.
 */

const DAY = 86_400_000;
const NOW_MS = Date.parse("2026-08-19T09:00:00.000Z");
const iso = (daysAgo: number): string =>
  new Date(NOW_MS - daysAgo * DAY).toISOString();

const EMPTY: AccessBook = { jobs: {}, staff: [] };

function seed(): AccessBook {
  if (!DEMO_ENABLED) return EMPTY;

  const staff = EMPLOYEES.map((person) => ({
    id: person.id,
    name: `${person.firstName} ${person.lastName}`,
    jobTitle: person.jobTitle,
    email:
      person.email ??
      `${person.firstName}.${person.lastName}@example.com`.toLowerCase(),
  }));
  const who = (id: string) => staff.find((person) => person.id === id);
  const staffGrant = (
    id: string,
    employeeId: string,
    role: DemoGrant["role"],
    daysAgo: number,
    fixed = false,
  ): DemoGrant => ({
    id,
    name: who(employeeId)?.name ?? "A colleague",
    email: who(employeeId)?.email ?? null,
    role,
    kind: "STAFF",
    status: "ACTIVE",
    since: iso(daysAgo),
    employeeId,
    fixed,
  });

  const open = (manager: string, panelist: string): DemoJobAccess => ({
    restricted: false,
    scoreVisibility: "HIRING_TEAM",
    grants: [
      staffGrant(`g-${manager}`, manager, "HIRING_MANAGER", 40, true),
      staffGrant(`g-${panelist}`, panelist, "PANELIST", 21),
    ],
    invites: [],
    events: [],
  });

  return {
    staff,
    alwaysOpen: ["Fatima Bello"],
    jobs: {
      "req-01": {
        restricted: true,
        scoreVisibility: "HIRING_TEAM",
        grants: [
          staffGrant("g-p-01", "p-01", "HIRING_MANAGER", 44, true),
          staffGrant("g-p-06", "p-06", "RECRUITER", 44),
          staffGrant("g-p-03", "p-03", "PANELIST", 30),
          {
            id: "g-account-1",
            name: "Folasade Ige",
            email: "folasade.ige@example.com",
            role: "PANELIST",
            kind: "ACCOUNT",
            status: "ACTIVE",
            since: iso(12),
            employeeId: null,
            fixed: false,
          },
        ],
        invites: [
          {
            id: "invite-1",
            name: "Kunle Adebayo",
            email: "kunle.adebayo@example.com",
            role: "PANELIST",
            invitedAt: iso(2),
            expiresAt: new Date(NOW_MS + 5 * DAY).toISOString(),
            expired: false,
            invitedBy: "Fatima Bello",
          },
        ],
        events: [
          {
            id: "ev-3",
            at: iso(2),
            by: "Fatima Bello",
            text: "Invited Kunle Adebayo as panelist.",
          },
          {
            id: "ev-2",
            at: iso(12),
            by: "Fatima Bello",
            text: "Gave Folasade Ige access as panelist.",
          },
          {
            id: "ev-1",
            at: iso(44),
            by: "Fatima Bello",
            text: "Restricted the job to the people listed.",
          },
        ],
      },
      "req-02": open("p-02", "p-04"),
      "req-03": open("p-04", "p-05"),
      "req-04": open("p-02", "p-05"),
    },
  };
}

/** Bump when the book's shape changes: an old payload is dropped, not merged. */
const BOOK_VERSION = 2;

export const demoAccess = createPersistedState<AccessBook>({
  key: "approvehr.hiring.access.store",
  empty: seed(),
  version: BOOK_VERSION,
});

/** The book, for rendering. Re-renders when anything changes it. */
export function useDemoAccess(): AccessBook {
  return useSyncExternalStore(
    demoAccess.subscribe,
    demoAccess.read,
    demoAccess.getServerSnapshot,
  );
}

/**
 * Run a write against the book and keep the result.
 *
 * Read with `current()`, never `read()`: until something subscribes `read()` is the
 * seed, and committing a write computed from it would throw away everything this
 * browser had stored. See `persisted.ts`.
 */
export function accessRun<T>(write: (book: AccessBook) => Op<T>): Op<T> {
  const result = write(demoAccess.current());
  if (result.ok) demoAccess.commit(result.book);
  return result;
}
