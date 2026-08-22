import type { ApiAnnouncement } from "@/lib/api/announcements";

/**
 * A demo noticeboard.
 *
 * Read-only, and that is the decision this file records. Writing here is refused
 * in `lib/store/announcements.ts` for the reason `lib/store/knowledge.ts` refuses
 * publishing an article: **publishing is the company speaking to its staff, and
 * a notice written into one browser reaches nobody.** A demo that lets somebody
 * post a notice teaches the opposite of how the product works.
 *
 * Rows are still seeded, because the alternative is worse. This is the one
 * feature the incumbent's dashboard has that we had nothing for, the product gets
 * shown on laptops with no database, and a noticeboard panel that is empty in
 * that room demonstrates the gap rather than closing it.
 *
 * ## Why these five
 *
 * Each one is a state the management screen exists to handle, so a demo shows an
 * editor something to do rather than a tidy list:
 *
 * - a **pinned** notice older than the rest, to prove pinning beats recency;
 * - a **departmental** notice, so the audience column is not all "Everybody";
 * - a **draft**, which must be absent from the dashboard entirely;
 * - an **expired** one, which is published and invisible at the same time —
 *   the state nothing but the `expired` flag reveals;
 * - and one ordinary company-wide notice, because most of them are.
 *
 * Dates are relative to `TODAY` rather than literals, so the seed does not decay
 * into a board of notices from last year.
 */

import { TODAY } from "@/lib/today";

const DAY = 86_400_000;

const shift = (days: number): string => {
  const base = new Date(`${TODAY}T00:00:00.000Z`);
  return new Date(base.getTime() + days * DAY).toISOString();
};
const shiftDate = (days: number): string => shift(days).slice(0, 10);

/** The demo company's departments, matching `lib/mock/people.ts`. */
const ENGINEERING = "demo-engineering";

export const DEMO_ANNOUNCEMENTS: ApiAnnouncement[] = [
  {
    id: "an-fire-drill",
    title: "Fire drill on Friday at 11am",
    body:
      "The alarm will sound at 11 and it is not a real one.\n\n" +
      "Leave by the nearest stairwell and assemble in the car park behind the " +
      "building. Floor marshals will count heads before anybody goes back in.",
    audience: "EVERYONE",
    departmentIds: [],
    departmentNames: [],
    pinned: true,
    published: true,
    publishedAt: shift(-9),
    expiresOn: null,
    expired: false,
    postedByName: "Adaeze Okonkwo",
    createdAt: shift(-9),
    updatedAt: shift(-9),
  },
  {
    id: "an-payday",
    title: "Payday moves to the 27th this month",
    body:
      "The 28th falls on a Sunday, so salaries go out on Friday the 27th. " +
      "Nothing else about the run changes, and payslips are available the same " +
      "morning.",
    audience: "EVERYONE",
    departmentIds: [],
    departmentNames: [],
    pinned: false,
    published: true,
    publishedAt: shift(-2),
    expiresOn: shiftDate(9),
    expired: false,
    postedByName: "Adaeze Okonkwo",
    createdAt: shift(-2),
    updatedAt: shift(-2),
  },
  {
    id: "an-standup",
    title: "Engineering standup moves to 10am",
    body:
      "From Monday, so the Abuja half of the team is not dialling in at eight. " +
      "The Friday review keeps its slot.",
    audience: "DEPARTMENTS",
    departmentIds: [ENGINEERING],
    departmentNames: ["Engineering"],
    pinned: false,
    published: true,
    publishedAt: shift(-1),
    expiresOn: null,
    expired: false,
    postedByName: "Chidi Nwosu",
    createdAt: shift(-1),
    updatedAt: shift(-1),
  },
  {
    /* Published and invisible at once. The state the `expired` flag exists for. */
    id: "an-health-cover",
    title: "Health cover renewal — send your dependants by the 14th",
    body:
      "The renewal window has closed. Anybody who missed it is on last year's " +
      "cover until the next renewal.",
    audience: "EVERYONE",
    departmentIds: [],
    departmentNames: [],
    pinned: false,
    published: true,
    publishedAt: shift(-24),
    expiresOn: shiftDate(-3),
    expired: true,
    postedByName: "Adaeze Okonkwo",
    createdAt: shift(-30),
    updatedAt: shift(-24),
  },
  {
    /* A draft, mid-sentence on purpose: this is what a draft looks like, and it
       is why staff must not see one. */
    id: "an-christmas",
    title: "Christmas closure",
    body: "The office shuts on the",
    audience: "EVERYONE",
    departmentIds: [],
    departmentNames: [],
    pinned: false,
    published: false,
    publishedAt: null,
    expiresOn: null,
    expired: false,
    postedByName: null,
    createdAt: shift(-4),
    updatedAt: shift(-4),
  },
];
