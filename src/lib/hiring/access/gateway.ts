import type {
  AccessEvent,
  AccessMember,
  InviteInput,
  InviteOptions,
  InviteOutcome,
  InviteResult,
  JobAccess,
  PendingInvite,
  PickPerson,
  ScoreVisibility,
} from "./model";

/**
 * What the access panel on a job asks of whatever is behind it.
 *
 * Connected, it is the API (`api-gateway.ts`). In a demo it is a book kept in this
 * browser (`demo-gateway.ts`). The panel and its dialogs are written against this and
 * nothing else, so there is one code path.
 *
 * Every method that can be refused **throws an `ApiError` whose message is the
 * sentence to show**, and a refusal that is about one field carries that field in its
 * details, so a dialog can put the sentence under the box it is about.
 */
export type AccessGateway = {
  mode: "api" | "demo";

  /** Who has access to a job, and how it is set. */
  get(requisitionId: string, signal: AbortSignal): Promise<JobAccess>;

  /** Every change to who can see the job, newest first. `null` where the server keeps none. */
  events(
    requisitionId: string,
    signal: AbortSignal,
  ): Promise<AccessEvent[] | null>;

  setRestricted(requisitionId: string, restricted: boolean): Promise<JobAccess>;
  setScoreVisibility(
    requisitionId: string,
    visibility: ScoreVisibility,
  ): Promise<JobAccess>;

  /** Takes access away. Nothing the person did is undone. */
  revoke(requisitionId: string, member: AccessMember): Promise<void>;

  invites: {
    /** What each role allows and what the email says: the API's words. */
    options(signal: AbortSignal): Promise<InviteOptions>;
    invite(requisitionId: string, input: InviteInput): Promise<InviteResult>;
    resend(
      requisitionId: string,
      invite: PendingInvite,
    ): Promise<InviteOutcome>;
    cancel(requisitionId: string, invite: PendingInvite): Promise<void>;
  };

  /** Members of staff who could be given access, found by name. */
  people(search: string, signal: AbortSignal): Promise<PickPerson[]>;
};
