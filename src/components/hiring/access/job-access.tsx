"use client";

import { useState } from "react";
import { Lock, UserPlus } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Disclosure,
  Select,
  Skeleton,
  Switch,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { formatDateShort } from "@/lib/time";
import { useOrgTimezone } from "@/lib/store/session";
import { useLoaded } from "@/lib/use-loaded";
import {
  ROLE_LABEL,
  SCORE_VISIBILITY_LABEL,
  type AccessMember,
  type PendingInvite,
  type ScoreVisibility,
} from "@/lib/hiring/access/model";
import {
  accessChanged,
  useAccessGateway,
} from "@/lib/hiring/access/use-access";
import { sentenceOf } from "@/lib/hiring/pipeline/errors";
import { InviteDialog } from "./invite-dialog";

/**
 * Who can see one job, and what they can see of it.
 *
 * ## What it is for
 *
 * A job's applicants are strangers' CVs, contact details and answers. By default
 * everybody who can see applicants in Hiring sees them. **Restricting** a job narrows
 * that to the people listed here, the hiring manager named on the role and whoever holds
 * the Restricted jobs permission, so a sensitive
 * role, a confidential replacement, an internal move, is not an open book. Collaborators
 * the company invites to interview see only the jobs they are on, and what they can see
 * of a person is narrow.
 *
 * ## What it will not do
 *
 * - **Write the consequence itself.** Who always keeps sight of a restricted job is the
 *   API's sentence, shown as written.
 * - **Change who can see a score without saying so.** Scores are advice for a person,
 *   not a verdict, and who may see them on this job is one explicit choice.
 * - **Act without asking where it narrows or widens.** Restricting, opening and
 *   taking somebody off each say what changes before it does.
 */

type Asking =
  | { kind: "restrict"; restricted: boolean }
  | { kind: "revoke"; member: AccessMember }
  | { kind: "cancel"; invite: PendingInvite };

export function JobAccessCard({
  requisitionId,
  canManage,
}: {
  requisitionId: string;
  /** The viewer may change who has access: `MANAGE_HIRING`. */
  canManage: boolean;
}) {
  const gateway = useAccessGateway();
  const toast = useToast();
  const timeZone = useOrgTimezone();
  const base = `access:${gateway.mode}:${requisitionId}`;

  const access = useLoaded(base, true, (signal) =>
    gateway.get(requisitionId, signal),
  );
  const events = useLoaded(`${base}:events`, true, (signal) =>
    gateway.events(requisitionId, signal),
  );
  const options = useLoaded(
    `access-options:${gateway.mode}`,
    canManage,
    (signal) => gateway.invites.options(signal),
  );

  const [inviting, setInviting] = useState(false);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [busy, setBusy] = useState(false);

  const reloadAll = () => {
    access.reload();
    events.reload();
    /* A panel's picker offers who is on the job: it asks again. */
    accessChanged();
  };

  async function run(work: () => Promise<void>, failed: string) {
    setBusy(true);
    try {
      await work();
      setAsking(null);
      reloadAll();
    } catch (error) {
      toast.push({
        title: failed,
        tone: "danger",
        detail: sentenceOf(error),
      });
      setAsking(null);
    } finally {
      setBusy(false);
    }
  }

  const heading = (
    <CardHeader
      title="Who can see this job"
      description="The people on it, and whether anybody else who can see applicants in Hiring can see this job's."
      action={
        canManage ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setInviting(true)}
            disabled={access.data === null}
          >
            <UserPlus aria-hidden="true" className="size-3.5" />
            Invite somebody
          </Button>
        ) : undefined
      }
    />
  );

  if (access.loading) {
    return (
      <Card>
        {heading}
        <CardBody>
          <Skeleton className="h-32 w-full" />
          <span className="sr-only-focusable">
            Loading who can see this job
          </span>
        </CardBody>
      </Card>
    );
  }

  if (access.error || !access.data) {
    return (
      <Card>
        {heading}
        <CardBody>
          <LoadFailure
            subject="who can see this job"
            error={access.error}
            onRetry={access.reload}
            missingMeans="module"
          />
        </CardBody>
      </Card>
    );
  }

  const data = access.data;
  const mayManage = canManage && data.canManage;
  const invites = data.pending;
  const trail = events.data;

  return (
    <Card>
      {heading}
      <CardBody className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <Switch
            label="Restricted job"
            description="On: only the people listed below, the hiring manager named on the role and whoever holds the Restricted jobs permission can see this job. Everybody else, including people who manage hiring for the whole company, is not told it exists. Off: everybody who can see applicants in Hiring can."
            checked={data.restricted}
            disabled={!mayManage || busy}
            onChange={(event) =>
              setAsking({ kind: "restrict", restricted: event.target.checked })
            }
          />
          {data.restricted && data.restrictedNote && (
            <Callout
              tone="info"
              title="This job is restricted"
              icon={<Lock aria-hidden="true" className="size-4" />}
            >
              {data.restrictedNote}
              {data.alwaysOpen.length > 0 && (
                <>
                  {" "}
                  These people can open it whether or not they are listed:{" "}
                  {data.alwaysOpen.join(", ")}.
                </>
              )}
            </Callout>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`score-visibility-${requisitionId}`}
            className="text-body-sm font-medium text-ink"
          >
            Who can see screening scores on this job
          </label>
          <Select
            id={`score-visibility-${requisitionId}`}
            value={data.scoreVisibility}
            disabled={!mayManage || busy}
            className="max-w-md"
            onChange={(event) =>
              void run(async () => {
                const next = event.target.value as ScoreVisibility;
                await gateway.setScoreVisibility(requisitionId, next);
                toast.push({
                  title: "Score visibility saved",
                  tone: "success",
                  detail: `${SCORE_VISIBILITY_LABEL[next]} can see screening scores on this job.`,
                });
              }, "Score visibility was not changed")
            }
          >
            {(Object.keys(SCORE_VISIBILITY_LABEL) as ScoreVisibility[]).map(
              (value) => (
                <option key={value} value={value}>
                  {SCORE_VISIBILITY_LABEL[value]}
                </option>
              ),
            )}
          </Select>
          <p className="text-body-sm text-muted">
            A score is advice for a person, not a verdict. Recruiters and the
            hiring manager always see it. A panelist sees it only if you choose
            so here, and is otherwise shown nothing, not an empty box where it
            would be.
          </p>
        </div>

        <div>
          <h3 className="text-body-sm font-semibold text-ink">
            People on this job
          </h3>
          {data.members.length === 0 ? (
            <p className="mt-2 text-body-sm text-muted">
              Nobody has been given access to this job yet.
            </p>
          ) : (
            <ul
              aria-label="People on this job"
              className="mt-2 divide-y divide-line rounded-lg border border-line"
            >
              {data.members.map((member) => (
                <li
                  key={member.id}
                  className="flex flex-wrap items-start justify-between gap-3 p-3.5"
                >
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium text-ink">
                      {member.name}
                    </p>
                    {member.email && (
                      <p className="break-words text-body-sm text-muted">
                        {member.email}
                      </p>
                    )}
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-meta text-muted">
                      <Badge tone="neutral" size="sm">
                        {ROLE_LABEL[member.role]}
                      </Badge>
                      <Badge
                        tone={
                          member.status === "ACTIVE" ? "success" : "warning"
                        }
                        size="sm"
                        dot
                      >
                        {member.status === "ACTIVE"
                          ? "Active"
                          : "Invited, not signed in"}
                      </Badge>
                      {member.kind === "ACCOUNT" && (
                        <Badge tone="info" size="sm">
                          Not on staff
                        </Badge>
                      )}
                      <span>
                        Since {formatDateShort(member.since, timeZone)}
                      </span>
                    </p>
                    {(member.seats.stages.length > 0 ||
                      member.seats.interviews > 0) && (
                      <p className="mt-1 text-meta text-muted">
                        {[
                          member.seats.stages.length > 0
                            ? `On the panel for ${member.seats.stages.join(", ")}`
                            : null,
                          member.seats.interviews > 0
                            ? `invited to ${String(member.seats.interviews)} ${member.seats.interviews === 1 ? "interview" : "interviews"}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(", ")
                          .replace(/^./, (c) => c.toUpperCase())}
                        . Taking them off also takes them off these.
                      </p>
                    )}
                  </div>
                  {mayManage &&
                    (member.canRevoke.allowed ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setAsking({ kind: "revoke", member })}
                        aria-label={`Take ${member.name} off this job`}
                      >
                        Take off
                      </Button>
                    ) : (
                      <span className="max-w-60 text-meta text-muted">
                        {member.canRevoke.reason}
                      </span>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </div>

        {data.alsoReach.length > 0 && (
          <div>
            <h3 className="text-body-sm font-semibold text-ink">
              Also able to reach this job
            </h3>
            <p className="mt-1 text-body-sm text-muted">
              Put there somewhere else: on the role, on a stage&apos;s panel or
              on an interview. Change it where they were put.
            </p>
            <ul
              aria-label="Also able to reach this job"
              className="mt-2 divide-y divide-line rounded-lg border border-line"
            >
              {data.alsoReach.map((person) => (
                <li
                  key={`${person.name}:${person.via.join(",")}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-3.5"
                >
                  <p className="text-body-sm font-medium text-ink">
                    {person.name}
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-meta text-muted">
                    {person.via.map((way) => (
                      <Badge key={way} tone="neutral" size="sm">
                        {way}
                      </Badge>
                    ))}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {invites.length > 0 && (
          <div>
            <h3 className="text-body-sm font-semibold text-ink">
              Invitations waiting
            </h3>
            <ul
              aria-label="Invitations waiting"
              className="mt-2 divide-y divide-line rounded-lg border border-line"
            >
              {invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-wrap items-start justify-between gap-3 p-3.5"
                >
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium text-ink">
                      {invite.name}
                    </p>
                    <p className="break-words text-body-sm text-muted">
                      {invite.email}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-meta text-muted">
                      <Badge tone="neutral" size="sm">
                        {ROLE_LABEL[invite.role]}
                      </Badge>
                      <span>
                        Sent {formatDateShort(invite.invitedAt, timeZone)}
                        {invite.invitedBy ? ` by ${invite.invitedBy}` : ""}
                      </span>
                      {invite.expired ? (
                        <Badge tone="danger" size="sm">
                          Expired
                        </Badge>
                      ) : invite.expiresAt ? (
                        <span>
                          Works until{" "}
                          {formatDateShort(invite.expiresAt, timeZone)}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  {mayManage && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        aria-label={`Send ${invite.name} the invitation again`}
                        onClick={() =>
                          void run(async () => {
                            const outcome = await gateway.invites.resend(
                              requisitionId,
                              invite,
                            );
                            toast.push({
                              title: outcome.delivered
                                ? `Invitation sent again to ${invite.email}`
                                : `No email was sent to ${invite.email}`,
                              tone: outcome.delivered ? "success" : "danger",
                              detail: outcome.said,
                            });
                          }, `The invitation to ${invite.name} was not sent again`)
                        }
                      >
                        Send again
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        aria-label={`Cancel the invitation to ${invite.name}`}
                        onClick={() => setAsking({ kind: "cancel", invite })}
                      >
                        Cancel invitation
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {trail !== null && trail !== undefined && (
          <Disclosure
            title="Who changed this, and when"
            meta={`${String(trail.length)} ${trail.length === 1 ? "change" : "changes"}`}
          >
            {trail.length === 0 ? (
              <p className="text-body-sm text-muted">
                Nothing has changed yet.
              </p>
            ) : (
              <ul
                aria-label="Changes to who can see this job"
                className="flex flex-col gap-2"
              >
                {trail.map((event) => (
                  <li key={event.id} className="text-body-sm text-body">
                    <span className="text-muted">
                      {formatDateShort(event.at, timeZone)}
                      {event.by ? `, ${event.by}` : ""}:
                    </span>{" "}
                    {event.text}
                  </li>
                ))}
              </ul>
            )}
          </Disclosure>
        )}
      </CardBody>

      <ConfirmDialog
        open={asking?.kind === "restrict"}
        onClose={() => setAsking(null)}
        title={
          asking?.kind === "restrict" && !asking.restricted
            ? "Open this job to everybody who can see applicants?"
            : "Restrict this job to the people listed?"
        }
        body={
          asking?.kind === "restrict" && !asking.restricted
            ? "Everybody who can see applicants in Hiring will see this job's applicants again, whether or not they are listed here."
            : `Only the people on this job's list, the hiring manager named on the role and whoever holds the Restricted jobs permission${
                data.alwaysOpen.length > 0
                  ? ` (${data.alwaysOpen.join(", ")})`
                  : ""
              } will be able to see this job and its applicants. Everybody else, including people who manage hiring for the whole company, will no longer be told it exists. You are added to the list if you would otherwise lose it.`
        }
        confirmLabel={
          asking?.kind === "restrict" && !asking.restricted
            ? "Open the job"
            : "Restrict the job"
        }
        tone="primary"
        loading={busy}
        onConfirm={() => {
          if (asking?.kind !== "restrict") return;
          const restricted = asking.restricted;
          void run(async () => {
            const changed = await gateway.setRestricted(
              requisitionId,
              restricted,
            );
            toast.push({
              title: restricted ? "The job is restricted" : "The job is open",
              tone: "success",
              ...(changed.addedYou
                ? {
                    detail:
                      "You were put on the list as a recruiter, so you keep access to what you just restricted.",
                  }
                : {}),
            });
          }, "The job's access was not changed");
        }}
      />

      <ConfirmDialog
        open={asking?.kind === "revoke"}
        onClose={() => setAsking(null)}
        title={
          asking?.kind === "revoke"
            ? `Take ${asking.member.name} off this job?`
            : "Take them off this job?"
        }
        body="They can no longer see this job, its applicants or its interviews. Anything they have already done on it, scorecards included, stays."
        confirmLabel="Take off"
        loading={busy}
        onConfirm={() => {
          if (asking?.kind !== "revoke") return;
          const member = asking.member;
          void run(async () => {
            await gateway.revoke(requisitionId, member);
            toast.push({
              title: `${member.name} is off this job`,
              tone: "success",
            });
          }, `${member.name} was not taken off`);
        }}
      />

      <ConfirmDialog
        open={asking?.kind === "cancel"}
        onClose={() => setAsking(null)}
        title={
          asking?.kind === "cancel"
            ? `Cancel the invitation to ${asking.invite.name}?`
            : "Cancel the invitation?"
        }
        body="The link in their email stops working. They can be invited again later."
        confirmLabel="Cancel invitation"
        loading={busy}
        onConfirm={() => {
          if (asking?.kind !== "cancel") return;
          const invite = asking.invite;
          void run(async () => {
            await gateway.invites.cancel(requisitionId, invite);
            toast.push({
              title: `The invitation to ${invite.name} is cancelled`,
              tone: "success",
            });
          }, `The invitation to ${invite.name} was not cancelled`);
        }}
      />

      <InviteDialog
        open={inviting}
        onClose={() => setInviting(false)}
        requisitionId={requisitionId}
        gateway={gateway}
        options={options.data}
        optionsLoading={options.loading}
        optionsError={options.error}
        onDone={(result) => {
          toast.push({
            title:
              result.emailLeft === false
                ? "Invited, but no email was sent"
                : "Done",
            tone: result.emailLeft === false ? "warning" : "success",
            detail: result.said,
          });
          reloadAll();
        }}
      />
    </Card>
  );
}
