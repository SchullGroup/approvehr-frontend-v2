import type { InviteOptions, RoleInfo } from "./model";
import { ROLE_LABEL } from "./model";

/**
 * What an invitation to one job gives, and what it sends, in words.
 *
 * ## Where these words come from
 *
 * The API's narrow door (`/recruitment/my/…`) is the whole of what an invited person
 * can reach, and the sentences below are what it does, written from its own contract
 * (see "Phase 4 step B" in the recruitment spec): a person is shown a candidate's name,
 * the job, the stage, their interviews and a link to the CV, and never contact details,
 * pay, answers, history or offers; a recruiter or the hiring manager also reads every
 * scorecard; a panelist reads only their own, because scoring is blind until it is
 * handed in; the fit score goes to recruiters and the hiring manager, and to panelists
 * only where the job says so.
 *
 * The email is the company's standard invitation, word for word. It does **not** name
 * the job or who invited them, so the dialog does not promise that it does.
 *
 * The API serves no list of these, so they live here, once, for the real dialog and
 * the demo alike. If the API ever serves them, this file is the one to delete.
 */

const WHAT_THEY_CANNOT_DO =
  "They never see contact details, pay, answers to questions, history or offers, and they cannot move, reject, email or make offers to anybody.";

const RUNS_IT = [
  "This job, and every application for it: name, stage and a link to the CV",
  "Every interview booked for it, and every scorecard handed in",
  "The interview score the scorecards come to",
  "The fit score and the reasons for it",
];

export const ROLES: RoleInfo[] = [
  {
    role: "HIRING_MANAGER",
    label: ROLE_LABEL.HIRING_MANAGER,
    description: "Decides who is hired for this job.",
    sees: RUNS_IT,
    cannot: WHAT_THEY_CANNOT_DO,
  },
  {
    role: "RECRUITER",
    label: ROLE_LABEL.RECRUITER,
    description: "Runs the hiring for this job alongside you.",
    sees: RUNS_IT,
    cannot: WHAT_THEY_CANNOT_DO,
  },
  {
    role: "PANELIST",
    label: ROLE_LABEL.PANELIST,
    description: "Interviews people and hands in a scorecard.",
    sees: [
      "The candidates whose interviews they are invited to: name, job, stage and a link to the CV",
      "Their own scorecard, and nobody else's: scoring is blind until it is handed in",
      "The fit score and the reasons for it, only if this job lets panelists see scores",
    ],
    cannot: WHAT_THEY_CANNOT_DO,
  },
];

export const INVITE_EMAIL: NonNullable<InviteOptions["email"]> = {
  subject: "You have been invited to ApproveHR",
  summary:
    "You have been invited to ApproveHR. Accept the invitation to set up your account and choose a password. The email does not name the job or who invited them. The link stops working after a while, and Send again makes a fresh one.",
};

export const STAFF_NOTE =
  "A member of staff who can already sign in is given access at once, with no email. One who cannot is sent the same invitation, to their work email.";

export function inviteOptions(staffAvailable: boolean): InviteOptions {
  return {
    roles: ROLES,
    email: INVITE_EMAIL,
    staffNote: STAFF_NOTE,
    staffAvailable,
  };
}
