/**
 * Who can see a job, and what they can see of it.
 *
 * A job's applicants are the company's most personal data about strangers, so a job
 * can be **restricted** to the people it names. This is what the access panel on a job
 * draws, whichever side it came from: `api-gateway.ts` turns the API's answers into
 * these types and `demo-gateway.ts` makes them from a book kept in this browser.
 *
 * No React, no state.
 */

/** What somebody is on a job as. A hiring manager is set on the role itself. */
export type AccessRole = "HIRING_MANAGER" | "RECRUITER" | "PANELIST";

export const ROLE_LABEL: Record<AccessRole, string> = {
  HIRING_MANAGER: "Hiring manager",
  RECRUITER: "Recruiter",
  PANELIST: "Panelist",
};

export type AccessMember = {
  /** The grant's own id: what revoking names. */
  id: string;
  /** Their sign-in, and their employee record when they have one. */
  userId: string | null;
  employeeId: string | null;
  name: string;
  email: string | null;
  role: AccessRole;
  /**
   * `STAFF` have an employee record; `ACCOUNT` is somebody invited to hire with the
   * company who has a sign-in and no employee record, so there is no record to open
   * and nothing about them in Core HR.
   */
  kind: "STAFF" | "ACCOUNT";
  /** `INVITED` has been asked and has not signed in yet. */
  status: "ACTIVE" | "INVITED";
  /** ISO instant they were given access. */
  since: string;
  /** Whether this person is shown the job's screening scores. */
  canSeeScores: boolean;
  /** Where they sit on the job: the stages whose panel they are on, and interviews they were invited to. */
  seats: { stages: string[]; interviews: number };
  /** Whether access can be taken away here, and if not, why. */
  canRevoke: { allowed: true } | { allowed: false; reason: string };
};

/**
 * Somebody who can reach the job without being on its list: the hiring manager named
 * on the role, staff on a stage's panel, people invited to one interview. Listed so
 * "who can see this job?" has one honest answer, and read-only here because each is
 * changed where they were put there.
 */
export type ReachPerson = {
  name: string;
  /** How they reach it, in words: "Hiring manager on the role". */
  via: string[];
  canSeeScores: boolean;
};

/**
 * Who may see a screening score on this job.
 *
 * Scores are advice for a person, not a verdict, so they are kept to the people who
 * decide: the recruiters and the hiring manager. A company can add the panelists.
 */
export type ScoreVisibility = "HIRING_TEAM" | "ALSO_PANELISTS";

export const SCORE_VISIBILITY_LABEL: Record<ScoreVisibility, string> = {
  HIRING_TEAM: "Recruiters and the hiring manager",
  ALSO_PANELISTS: "Recruiters, the hiring manager and panelists",
};

export type JobAccess = {
  requisitionId: string;
  restricted: boolean;
  /**
   * The API's own sentence about who can see the applicants of a restricted job,
   * beyond the people listed, whether or not this one is restricted yet. Said as
   * written: it names roles and permissions only the API knows.
   */
  restrictedNote: string | null;
  scoreVisibility: ScoreVisibility;
  /** The people on the job's list who have signed in. */
  members: AccessMember[];
  /** Invited, and not signed in yet (or the link has run out). */
  pending: PendingInvite[];
  /** Everybody else who can reach the job, and how. Empty when nobody does. */
  alsoReach: ReachPerson[];
  /**
   * Who can open the job whether or not they are on its list (the permission the
   * Owner holds). Said on a restricted job, so "who can see this?" has one answer.
   */
  alwaysOpen: string[];
  /** The viewer may change any of this. */
  canManage: boolean;
  /**
   * Set by the change that restricted the job when it put the person who made it on
   * the list, so they did not lock themselves out of what they just made.
   */
  addedYou?: boolean;
};

/** What happened when an invitation was asked for again. */
export type InviteOutcome = {
  /** A provider took the email. When not, `said` says so and what to do. */
  delivered: boolean;
  said: string;
};

/** One change to who can see the job, as a sentence, for the trail. */
export type AccessEvent = {
  id: string;
  /** ISO instant. */
  at: string;
  /** Who made the change, or `null` where the system did. */
  by: string | null;
  /** What changed, in words. */
  text: string;
};

export type PendingInvite = {
  id: string;
  name: string;
  email: string;
  role: AccessRole;
  /** ISO instant it was sent. */
  invitedAt: string;
  /** ISO instant it stops working, or `null`. */
  expiresAt: string | null;
  expired: boolean;
  invitedBy: string | null;
};

/** What a role lets somebody do, in the API's words, for the invite dialog. */
export type RoleInfo = {
  role: AccessRole;
  label: string;
  /** One sentence for the choice. */
  description: string;
  /** What they will be able to see, one thing per line. Narrow, and complete. */
  sees: string[];
  /** What they can never see or do, in one sentence. */
  cannot?: string;
};

export type InviteOptions = {
  roles: RoleInfo[];
  /** The email a new account is sent, as the API words it. */
  email: { subject: string; summary: string } | null;
  /** What happens for somebody who is staff already and can sign in. */
  staffNote: string | null;
  /**
   * There is a staff list to choose from. A company without Core HR has none, and is
   * offered the email form alone, not a picker with nobody in it.
   */
  staffAvailable: boolean;
};

/** Who is being invited: somebody by email, or a member of staff. */
export type InviteInput =
  | {
      kind: "EMAIL";
      firstName: string;
      lastName: string;
      email: string;
      role: AccessRole;
    }
  | { kind: "STAFF"; employeeId: string; role: AccessRole };

export type InviteResult = {
  /** The grant, when there is one already (a member of staff who can sign in). */
  member: AccessMember | null;
  /** The invitation, when an email went to somebody new. */
  invite: PendingInvite | null;
  /** The API's sentence for what was done and what was sent. */
  said: string;
  /**
   * Whether an invitation email actually left: `true` it did, `false` one was due and
   * did not (no mail provider, or it refused), `null` no email was involved because
   * they could already sign in. Said plainly either way, never assumed.
   */
  emailLeft: boolean | null;
};

/** One field's refusal, for the dialog to put under the box it is about. */
export type FieldProblem = { field: string; message: string };

/** Somebody who could be added from the company's staff. */
export type PickPerson = { id: string; name: string; jobTitle?: string };
