import type {
  AccessEvent,
  AccessMember,
  AccessRole,
  FieldProblem,
  InviteInput,
  InviteOptions,
  JobAccess,
  PendingInvite,
  PickPerson,
  ScoreVisibility,
} from "./model";
import { ROLE_LABEL, SCORE_VISIBILITY_LABEL } from "./model";
import { inviteOptions } from "./words";

/**
 * The demo's access book, as plain functions.
 *
 * Every function takes the book and answers with a new one, or with the sentence the
 * API would have refused with (and the field it is about, where it is about one). No
 * React, no storage: the book itself lives in `demo-store.ts`. The rules are the real
 * ones, so a demo cannot teach an action the product will not allow.
 */

export type DemoGrant = {
  id: string;
  name: string;
  email: string | null;
  role: AccessRole;
  kind: "STAFF" | "ACCOUNT";
  status: "ACTIVE" | "INVITED";
  /** ISO instant. */
  since: string;
  employeeId: string | null;
  /** Their sign-in. Absent from a book saved before panels took accounts. */
  userId?: string | null;
  /** Set on the role itself, not here. */
  fixed: boolean;
};

export type DemoJobAccess = {
  restricted: boolean;
  scoreVisibility: ScoreVisibility;
  grants: DemoGrant[];
  invites: PendingInvite[];
  events: AccessEvent[];
};

export type AccessBook = {
  jobs: Record<string, DemoJobAccess>;
  /** Staff who could be given access. */
  staff: (PickPerson & { email: string })[];
  /**
   * Who can always open a restricted job, by name. Set by the demo's seed (so the
   * invented name lives only behind `DEMO_ENABLED`); absent from an older saved book.
   */
  alwaysOpen?: string[];
};

export type Op<T = undefined> =
  | { ok: true; book: AccessBook; value: T }
  | { ok: false; error: string; problems?: FieldProblem[] };

const fail = (
  error: string,
  problems?: FieldProblem[],
): { ok: false; error: string; problems?: FieldProblem[] } => ({
  ok: false,
  error,
  ...(problems ? { problems } : {}),
});

/** The instant the demo's actions are stamped with. */
export const NOW = "2026-08-19T09:00:00.000Z";

/** The API's own sentence for a restricted job, as it words it. */
export const RESTRICTED_NOTE =
  "This job is restricted: people with company-wide hiring permission cannot open it unless they are on this list.";

const EMPTY_JOB: DemoJobAccess = {
  restricted: false,
  scoreVisibility: "HIRING_TEAM",
  grants: [],
  invites: [],
  events: [],
};

export const jobOf = (book: AccessBook, id: string): DemoJobAccess =>
  book.jobs[id] ?? EMPTY_JOB;

/* ------------------------------------------------------------------ reading */

export function accessOf(book: AccessBook, requisitionId: string): JobAccess {
  const job = jobOf(book, requisitionId);
  return {
    requisitionId,
    restricted: job.restricted,
    restrictedNote: RESTRICTED_NOTE,
    scoreVisibility: job.scoreVisibility,
    members: job.grants.map(memberOf),
    pending: job.invites,
    alsoReach: [],
    alwaysOpen: book.alwaysOpen ?? [],
    canManage: true,
  };
}

export function memberOf(grant: DemoGrant): AccessMember {
  return {
    id: grant.id,
    userId: grant.userId ?? (grant.kind === "ACCOUNT" ? `u-${grant.id}` : null),
    employeeId: grant.employeeId,
    name: grant.name,
    email: grant.email,
    role: grant.role,
    kind: grant.kind,
    status: grant.status,
    since: grant.since,
    canSeeScores: grant.role !== "PANELIST",
    seats: { stages: [], interviews: 0 },
    canRevoke: grant.fixed
      ? {
          allowed: false,
          reason:
            "They are the hiring manager on the role itself. Change the hiring manager there.",
        }
      : { allowed: true },
  };
}

export const eventsOf = (
  book: AccessBook,
  requisitionId: string,
): AccessEvent[] => jobOf(book, requisitionId).events;

export const pendingOf = (
  book: AccessBook,
  requisitionId: string,
): PendingInvite[] => jobOf(book, requisitionId).invites;

/** The invite dialog's words: what each role lets somebody see, and what the email says. */
export const optionsOf = (): InviteOptions => inviteOptions(true);

/* ------------------------------------------------------------------- writes */

const eventsWith = (
  job: DemoJobAccess,
  text: string,
  n: number,
): AccessEvent[] => [
  { id: `ev-${String(n)}`, at: NOW, by: "You", text },
  ...job.events,
];

const withJob = (
  book: AccessBook,
  id: string,
  next: DemoJobAccess,
): AccessBook => ({ ...book, jobs: { ...book.jobs, [id]: next } });

const count = (book: AccessBook): number =>
  Object.values(book.jobs).reduce(
    (sum, job) =>
      sum + job.events.length + job.grants.length + job.invites.length,
    0,
  ) + 1;

export function setRestricted(
  book: AccessBook,
  requisitionId: string,
  restricted: boolean,
): Op {
  const job = jobOf(book, requisitionId);
  if (job.restricted === restricted)
    return { ok: true, book, value: undefined };
  return {
    ok: true,
    book: withJob(book, requisitionId, {
      ...job,
      restricted,
      events: eventsWith(
        job,
        restricted
          ? "Restricted the job to the people listed."
          : "Opened the job to everybody who can see applicants in Hiring.",
        count(book),
      ),
    }),
    value: undefined,
  };
}

export function setScoreVisibility(
  book: AccessBook,
  requisitionId: string,
  visibility: ScoreVisibility,
): Op {
  const job = jobOf(book, requisitionId);
  if (job.scoreVisibility === visibility)
    return { ok: true, book, value: undefined };
  return {
    ok: true,
    book: withJob(book, requisitionId, {
      ...job,
      scoreVisibility: visibility,
      events: eventsWith(
        job,
        `Screening scores can now be seen by: ${SCORE_VISIBILITY_LABEL[visibility].toLowerCase()}.`,
        count(book),
      ),
    }),
    value: undefined,
  };
}

export function revoke(
  book: AccessBook,
  requisitionId: string,
  grantId: string,
): Op {
  const job = jobOf(book, requisitionId);
  const grant = job.grants.find((entry) => entry.id === grantId);
  if (!grant) return fail("They do not have access to this job any more.");
  if (grant.fixed)
    return fail(
      "They are the hiring manager on the role itself. Change the hiring manager there.",
    );
  return {
    ok: true,
    book: withJob(book, requisitionId, {
      ...job,
      grants: job.grants.filter((entry) => entry.id !== grantId),
      events: eventsWith(
        job,
        `Took ${grant.name} off the job (${ROLE_LABEL[grant.role].toLowerCase()}).`,
        count(book),
      ),
    }),
    value: undefined,
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function invite(
  book: AccessBook,
  requisitionId: string,
  input: InviteInput,
): Op<{
  member: AccessMember | null;
  invite: PendingInvite | null;
  said: string;
  emailLeft: boolean | null;
}> {
  const job = jobOf(book, requisitionId);

  if (input.kind === "STAFF") {
    const person = book.staff.find((entry) => entry.id === input.employeeId);
    if (!person)
      return fail("Choose a member of staff.", [
        { field: "employeeId", message: "Choose a member of staff." },
      ]);
    if (job.grants.some((grant) => grant.employeeId === person.id))
      return fail(`${person.name} already has access to this job.`, [
        {
          field: "employeeId",
          message: `${person.name} already has access to this job.`,
        },
      ]);
    const grant: DemoGrant = {
      id: `grant-${String(count(book))}`,
      name: person.name,
      email: person.email,
      role: input.role,
      kind: "STAFF",
      status: "ACTIVE",
      since: NOW,
      employeeId: person.id,
      fixed: false,
    };
    return {
      ok: true,
      book: withJob(book, requisitionId, {
        ...job,
        grants: [...job.grants, grant],
        events: eventsWith(
          job,
          `Gave ${person.name} access as ${ROLE_LABEL[input.role].toLowerCase()}.`,
          count(book),
        ),
      }),
      value: {
        member: memberOf(grant),
        invite: null,
        said: `${person.name} has access now. No email was sent: they can already sign in.`,
        emailLeft: null,
      },
    };
  }

  const problems: FieldProblem[] = [];
  if (input.firstName.trim() === "")
    problems.push({ field: "firstName", message: "Enter their first name." });
  if (input.lastName.trim() === "")
    problems.push({ field: "lastName", message: "Enter their last name." });
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email))
    problems.push({ field: "email", message: "Enter a valid email address." });
  else if (
    job.grants.some((grant) => grant.email?.toLowerCase() === email) ||
    job.invites.some((entry) => entry.email.toLowerCase() === email)
  )
    problems.push({
      field: "email",
      message:
        "That person already has access, or an invitation, for this job.",
    });
  else if (book.staff.some((person) => person.email.toLowerCase() === email))
    problems.push({
      field: "email",
      message:
        "That email belongs to a member of staff. Choose them from the staff list instead.",
    });
  if (problems.length > 0) return fail("Some fields are not valid.", problems);

  const sent: PendingInvite = {
    id: `invite-${String(count(book))}`,
    name: `${input.firstName.trim()} ${input.lastName.trim()}`,
    email,
    role: input.role,
    invitedAt: NOW,
    expiresAt: new Date(Date.parse(NOW) + 7 * 86_400_000).toISOString(),
    expired: false,
    invitedBy: "You",
  };
  return {
    ok: true,
    book: withJob(book, requisitionId, {
      ...job,
      invites: [...job.invites, sent],
      events: eventsWith(
        job,
        `Invited ${sent.name} as ${ROLE_LABEL[input.role].toLowerCase()}.`,
        count(book),
      ),
    }),
    value: {
      member: null,
      invite: sent,
      /* A practice copy sends nothing, and says so rather than claiming it did. */
      said: `${email} is invited. Nothing leaves a practice copy, so no email went anywhere. Until they accept, they can see nothing.`,
      emailLeft: false,
    },
  };
}

export function resend(
  book: AccessBook,
  requisitionId: string,
  inviteId: string,
): Op<PendingInvite> {
  const job = jobOf(book, requisitionId);
  const found = job.invites.find((entry) => entry.id === inviteId);
  if (!found) return fail("That invitation is not here any more.");
  const next: PendingInvite = {
    ...found,
    invitedAt: NOW,
    expiresAt: new Date(Date.parse(NOW) + 7 * 86_400_000).toISOString(),
    expired: false,
  };
  return {
    ok: true,
    book: withJob(book, requisitionId, {
      ...job,
      invites: job.invites.map((entry) =>
        entry.id === inviteId ? next : entry,
      ),
      events: eventsWith(
        job,
        `Sent ${found.name} the invitation again.`,
        count(book),
      ),
    }),
    value: next,
  };
}

export function cancel(
  book: AccessBook,
  requisitionId: string,
  inviteId: string,
): Op {
  const job = jobOf(book, requisitionId);
  const found = job.invites.find((entry) => entry.id === inviteId);
  if (!found) return fail("That invitation is not here any more.");
  return {
    ok: true,
    book: withJob(book, requisitionId, {
      ...job,
      invites: job.invites.filter((entry) => entry.id !== inviteId),
      events: eventsWith(
        job,
        `Cancelled the invitation to ${found.name}.`,
        count(book),
      ),
    }),
    value: undefined,
  };
}

/** Staff found by name or email, not yet on the job is the caller's to filter. */
export function findStaff(book: AccessBook, search: string): PickPerson[] {
  const words = search
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "");
  return book.staff
    .filter((person) =>
      words.every((word) =>
        `${person.name} ${person.email}`.toLowerCase().includes(word),
      ),
    )
    .map(({ id, name, jobTitle }) => ({
      id,
      name,
      ...(jobTitle ? { jobTitle } : {}),
    }));
}
