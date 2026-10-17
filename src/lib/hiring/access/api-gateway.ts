import { ApiError } from "@/lib/api/client";
import { auditApi } from "@/lib/api/audit";
import { employees } from "@/lib/api/endpoints";
import {
  jobAccessApi,
  type ApiAccessPerson,
  type ApiAccessVia,
  type ApiAccessView,
  type ApiGrantBody,
  type ApiInvitation,
} from "@/lib/api/job-access";
import type { AccessGateway } from "./gateway";
import type {
  AccessEvent,
  AccessMember,
  AccessRole,
  InviteInput,
  InviteResult,
  JobAccess,
  PendingInvite,
  PickPerson,
  ReachPerson,
} from "./model";
import { ROLE_LABEL } from "./model";
import { inviteOptions } from "./words";

/**
 * The access panel's gateway to the API.
 *
 * It turns the API's one read of "everybody who can reach this job" into three
 * things the panel draws: the people on the job's list who have signed in, the
 * invitations still waiting (a person on the list who has not signed in yet **is**
 * the invitation, so there is one of them, not two), and everybody else who can reach
 * the job some other way, read-only.
 *
 * What it sends and says is the API's. It writes no sentence about what happened that
 * the API did not decide: whether an email left is `delivered`, and when it did not,
 * the API's own `note` is what is shown.
 */

const VIA_WORDS: Record<ApiAccessVia, string> = {
  ACCESS_LIST: "On the job's list",
  HIRING_MANAGER: "Hiring manager on the role",
  STAGE_PANEL: "On a stage's panel",
  INTERVIEW_PANEL: "Invited to an interview",
};

const roleOf = (person: ApiAccessPerson): AccessRole =>
  person.role ?? "PANELIST";

const memberFrom = (person: ApiAccessPerson): AccessMember => ({
  id: person.id as string,
  userId: person.userId,
  employeeId: person.employeeId,
  name: person.name,
  email: person.email,
  role: roleOf(person),
  kind: person.employeeId ? "STAFF" : "ACCOUNT",
  status: "ACTIVE",
  since: person.addedAt ?? "",
  canSeeScores: person.canSeeScores,
  seats: person.seats ?? { stages: [], interviews: 0 },
  canRevoke: { allowed: true },
});

const pendingFrom = (person: ApiAccessPerson): PendingInvite => ({
  id: person.id as string,
  name: person.name,
  email: person.email ?? "",
  role: roleOf(person),
  invitedAt: person.addedAt ?? "",
  /* The API says whether the link has run out, not when. */
  expiresAt: null,
  expired: person.status === "INVITATION_EXPIRED",
  invitedBy: person.addedBy,
});

const reachFrom = (person: ApiAccessPerson): ReachPerson => ({
  name: person.name,
  via: person.via.map((way) => VIA_WORDS[way]),
  canSeeScores: person.canSeeScores,
});

export function accessFrom(view: ApiAccessView, addedYou = false): JobAccess {
  const listed = view.people.filter((person) => person.id !== null);
  const waiting = (person: ApiAccessPerson) =>
    person.status === "INVITED" || person.status === "INVITATION_EXPIRED";
  return {
    requisitionId: view.requisitionId,
    restricted: view.restricted,
    restrictedNote: view.companyWide.note,
    scoreVisibility: view.panelistsSeeScores ? "ALSO_PANELISTS" : "HIRING_TEAM",
    members: listed.filter((person) => !waiting(person)).map(memberFrom),
    pending: listed.filter(waiting).map(pendingFrom),
    alsoReach: view.people
      .filter((person) => person.id === null)
      .map(reachFrom),
    alwaysOpen: view.overrideHolders.map((holder) => holder.name),
    /* The panel is given `canManage` by whoever draws it; the API refuses anyway. */
    canManage: true,
    ...(addedYou ? { addedYou: true } : {}),
  };
}

const invitationSaid = (
  invitation: ApiInvitation | null,
  email: string,
): { delivered: boolean; said: string } => {
  if (!invitation || !invitation.issued) return { delivered: false, said: "" };
  if (invitation.delivered)
    return {
      delivered: true,
      said: `An invitation was sent to ${email}. Until they accept it, they can see nothing.`,
    };
  return {
    delivered: false,
    said: `No email was sent to ${email}. ${invitation.delivery?.note ?? "The server could not send it."}`,
  };
};

export const apiAccessGateway: AccessGateway = {
  mode: "api",

  get: async (requisitionId, signal) =>
    accessFrom(await jobAccessApi.get(requisitionId, signal)),

  /* The changes are in the company's audit trail, under the job. A reader who may not
     open the trail is not shown one, rather than an error about something they never
     asked for. */
  events: async (requisitionId, signal) => {
    try {
      const page = await auditApi.timeline(
        "requisitions",
        requisitionId,
        { pageSize: 100 },
        signal,
      );
      return page.data
        .filter((entry) => entry.action.startsWith("job_access."))
        .map((entry): AccessEvent => ({
          id: entry.id,
          at: entry.at,
          by: entry.actor.isSystem ? null : entry.actor.name,
          text: entry.actionLabel,
        }));
    } catch (error) {
      if (error instanceof ApiError && [403, 404].includes(error.status))
        return null;
      throw error;
    }
  },

  setRestricted: async (requisitionId, restricted) => {
    const change = await jobAccessApi.update(requisitionId, { restricted });
    return accessFrom(change, change.addedYou);
  },

  setScoreVisibility: async (requisitionId, visibility) => {
    const change = await jobAccessApi.update(requisitionId, {
      panelistsSeeScores: visibility === "ALSO_PANELISTS",
    });
    return accessFrom(change);
  },

  revoke: async (requisitionId, member) => {
    await jobAccessApi.revoke(requisitionId, member.id);
  },

  invites: {
    /* Whether there is a staff list to choose from is asked of the staff list itself:
       a company without Core HR has none. */
    options: async (signal) => {
      let staff = false;
      try {
        const page = await employees.list({ pageSize: 1 }, signal);
        staff = page.meta.total > 0;
      } catch {
        staff = false;
      }
      return inviteOptions(staff);
    },

    invite: async (
      requisitionId,
      input: InviteInput,
    ): Promise<InviteResult> => {
      const body: ApiGrantBody =
        input.kind === "EMAIL"
          ? {
              role: input.role,
              email: input.email,
              firstName: input.firstName,
              lastName: input.lastName,
            }
          : { role: input.role, employeeId: input.employeeId };
      const granted = await jobAccessApi.grant(requisitionId, body);
      const person = granted.person;
      const waiting =
        person !== null &&
        (person.status === "INVITED" || person.status === "INVITATION_EXPIRED");
      const named =
        person?.name ?? (input.kind === "EMAIL" ? input.email : "They");
      const outcome = invitationSaid(
        granted.invitation,
        person?.email ?? (input.kind === "EMAIL" ? input.email : ""),
      );
      return {
        member: person && !waiting ? memberFrom(person) : null,
        invite: person && waiting ? pendingFrom(person) : null,
        said:
          outcome.said ||
          `${named} has access as ${ROLE_LABEL[input.role].toLowerCase()} now. No email was sent: they can already sign in.`,
        emailLeft:
          granted.invitation && granted.invitation.issued
            ? outcome.delivered
            : null,
      };
    },

    resend: async (requisitionId, invite) => {
      const invitation = await jobAccessApi.resend(requisitionId, invite.id);
      const outcome = invitationSaid(
        { ...invitation, issued: true },
        invite.email,
      );
      return {
        delivered: outcome.delivered,
        said: outcome.delivered
          ? `Invitation sent again to ${invite.email}. The earlier link no longer works.`
          : outcome.said,
      };
    },

    /* Taking the row off the job closes an invitation nobody accepted. */
    cancel: async (requisitionId, invite) => {
      await jobAccessApi.revoke(requisitionId, invite.id);
    },
  },

  people: async (search, signal): Promise<PickPerson[]> => {
    const page = await employees.list(
      { pageSize: 25, ...(search.trim() ? { q: search.trim() } : {}) },
      signal,
    );
    return page.data.map((row) => ({
      id: row.id,
      name: row.fullName,
      ...(row.jobTitle ? { jobTitle: row.jobTitle } : {}),
    }));
  },
};
