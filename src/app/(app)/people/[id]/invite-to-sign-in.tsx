"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import {
  Button,
  Callout,
  Field,
  Modal,
  Select,
  Spinner,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { invitesApi } from "@/lib/api/invites";
import { permissionsApi } from "@/lib/api/permissions";
import { DeliveryNote } from "@/components/portal/delivery-note";
import { InviteLinkButton } from "@/components/portal/invite-link";
import type { PendingInvite, SentInvite } from "@/lib/api/invites";

/**
 * Giving one person a login, from their own record.
 *
 * ## The door this closes
 *
 * `POST /invites` — one person, one role — was built, tested and had **no
 * caller anywhere in the frontend**. Every other way into the invite system is
 * bulk: the attendance screen sets a batch of clock-in logins up, and the
 * importer now sends one per row that carries a role. Neither answers "this
 * person, now", which is the shape the question takes on a record page, and it
 * is the last of the four moments a company needs to bring somebody's email
 * in.
 *
 * ## Why the address is not a field here
 *
 * The API refuses one. `sendInviteSchema` takes an `employeeId` and no email,
 * on the grounds that accepting an address in the request would let somebody
 * invite themselves to a colleague's account — the invitation goes to the
 * address **on the record**, so the record is the only thing that decides
 * where it lands. So this dialog states the address rather than offering it,
 * and a record without one is sent to the editor instead.
 *
 * ## Somebody already invited gets the two buttons, not a refusal
 *
 * The first version of this dialog only sent. Press it for somebody with an
 * invitation already outstanding and the API answers *"They have already been
 * invited. Resend or revoke that invitation instead."* — a correct refusal
 * naming two actions the dialog did not offer, leaving nothing to do but press
 * the same button again.
 *
 * That is the failure this codebase already has a rule about: a button that
 * returns "that is refused" was a design failure two clicks earlier. So the
 * dialog reads the pending invitations **as it opens**, beside the roles it was
 * already fetching, and renders whichever of the two states is true. Resend and
 * revoke are the actions the API named; now they are the actions on screen.
 *
 * Reading up front rather than reacting to the refusal is the deliberate half.
 * It costs one request the dialog was already parallelising, and it means the
 * screen is never briefly wrong about what pressing the button will do.
 */
export function InviteToSignIn({
  employeeId,
  name,
  email,
  onClose,
}: {
  employeeId: string;
  name: string;
  /** From the record. Null sends them to the editor rather than a text box. */
  email: string | null;
  onClose: () => void;
}) {
  const [roles, setRoles] = useState<{ id: string; name: string }[] | null>(
    null,
  );
  const [roleId, setRoleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [sent, setSent] = useState<SentInvite | null>(null);
  /**
   * The invitation already outstanding for this person.
   *
   * `undefined` while the list is still being read, `null` once it is known
   * there is none. The distinction is the whole reason it is not a boolean:
   * rendering "Send the invitation" during the read and swapping it for
   * "Resend" a moment later is a button that changes meaning under the cursor.
   */
  const [pending, setPending] = useState<PendingInvite | null | undefined>(
    undefined,
  );
  const [revoked, setRevoked] = useState(false);
  /**
   * Whether this server can send email at all.
   *
   * `undefined` while unknown, `null` when the check itself failed. Only an
   * explicit `email: false` makes the dialog say an invitation will not arrive
   * — claiming it in either of the other two states would be guessing about
   * somebody's deployment.
   */
  const [delivery, setDelivery] = useState<
    { email: boolean; note: string | null } | null | undefined
  >(undefined);
  const noEmail = delivery?.email === false;

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      /* Both reads together — the dialog cannot render until it knows the roles
         anyway, so the invitation costs no extra wait. `allSettled` because a
         failed invitation read must not cost somebody the ability to send one:
         the API still refuses a duplicate, and that refusal is still shown. */
      const [roleResult, inviteResult, deliveryResult] =
        await Promise.allSettled([
          permissionsApi.roles(controller.signal),
          invitesApi.list({ pageSize: 200 }, controller.signal),
          invitesApi.delivery(controller.signal),
        ]);
      if (controller.signal.aborted) return;

      /* Undefined until known. Assuming email works and being wrong is the
         failure this whole change is about, so an unanswered check says
         nothing rather than promising delivery. */
      setDelivery(
        deliveryResult.status === "fulfilled" ? deliveryResult.value : null,
      );

      if (roleResult.status === "fulfilled") {
        const list = roleResult.value;
        setRoles(list.roles.map((role) => ({ id: role.id, name: role.name })));
        /* Employee is the answer for almost everybody being given a login for
           the first time, so it is offered rather than a blank picker. */
        const staff = list.roles.find((role) => role.name === "Employee");
        setRoleId(staff?.id ?? list.roles[0]?.id ?? "");
      } else {
        setRoles([]);
      }

      setPending(
        inviteResult.status === "fulfilled"
          ? (inviteResult.value.data.find(
              (row) => row.employeeId === employeeId,
            ) ?? null)
          : null,
      );
    })();
    return () => controller.abort();
  }, [employeeId]);

  const send = async () => {
    setBusy(true);
    setFailed(null);
    try {
      setSent(await invitesApi.send(employeeId, [roleId]));
    } catch (caught) {
      setFailed(
        caught instanceof ApiError
          ? caught.message
          : "That did not send. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!pending) return;
    setBusy(true);
    setFailed(null);
    try {
      setSent(await invitesApi.resend(pending.userId));
    } catch (caught) {
      setFailed(
        caught instanceof ApiError
          ? caught.message
          : "That did not send. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  /**
   * Cancel the outstanding invitation.
   *
   * Leaves the dialog on the ordinary send form rather than closing, because
   * revoking is almost never the end of the job — it is what somebody does
   * when the address was wrong, and the next thing they want is to fix the
   * record and invite again. `revoked` is what says so on screen.
   */
  const revoke = async () => {
    if (!pending) return;
    setBusy(true);
    setFailed(null);
    try {
      await invitesApi.revoke(pending.userId);
      setPending(null);
      setRevoked(true);
    } catch (caught) {
      setFailed(
        caught instanceof ApiError
          ? caught.message
          : "That did not cancel. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  /* Once it has gone, the dialog stops being a form and becomes a receipt —
     the same shape the bulk invite uses, and the only place the link appears
     when no mail transport is wired. */
  if (sent) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Invitation sent"
        footer={<Button onClick={onClose}>Done</Button>}
      >
        <div className="flex flex-col gap-4">
          {/* Two different facts, and the old copy asserted the wrong one
              whenever no transport was wired: it promised an email that was
              never sent. */}
          {noEmail ? (
            <Callout tone="warning" title={`${name}'s account is ready`}>
              This server cannot send email, so nothing has been sent to them.
              Take the link below and pass it on yourself.
            </Callout>
          ) : (
            <Callout tone="success" title={`${name} was invited`}>
              They can set a password from the link in their email and sign in
              as soon as they do.
            </Callout>
          )}

          {noEmail && <InviteLinkButton userId={sent.userId} name={name} />}

          <DeliveryNote
            hint={sent.delivery}
            href={(token) =>
              `/accept-invite?token=${encodeURIComponent(token)}`
            }
            action="Set their password"
          />
        </div>
      </Modal>
    );
  }

  if (!email) {
    return (
      <Modal
        open
        onClose={onClose}
        title="They have no work email"
        footer={<Button onClick={onClose}>Close</Button>}
      >
        <p className="text-body-sm leading-relaxed text-body">
          An invitation goes to the address on somebody&rsquo;s record, so there
          is nowhere to send this one. Add a work email to {name} under Personal
          details, then come back.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={pending ? `${name} has been invited` : `Give ${name} a login`}
      footer={
        /* Revoke sits on the left, away from the action somebody came to
           perform. It is the destructive half of this dialog and the two must
           not be adjacent. */
        <div className="flex flex-wrap items-center justify-between gap-2">
          {pending ? (
            <Button variant="ghost" disabled={busy} onClick={() => void revoke()}>
              Cancel the invitation
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Close
            </Button>
            {pending === undefined ? null : pending ? (
              <Button
                variant="accent"
                loading={busy}
                disabled={busy}
                onClick={() => void resend()}
              >
                Send it again
              </Button>
            ) : (
              <Button
                variant="accent"
                loading={busy}
                disabled={busy || !roleId}
                onClick={() => void send()}
              >
                Send the invitation
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {failed && (
          <p
            role="status"
            className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink"
          >
            {failed}
          </p>
        )}

        {/* Said before the click, not after it. A dialog that takes the action
            and then explains that nothing happened is the shape of failure this
            whole change is about. */}
        {noEmail && delivery?.note && (
          <Callout tone="warning" title="No email will be sent">
            {delivery.note}
          </Callout>
        )}

        {revoked && (
          <Callout tone="info" title="That invitation is cancelled">
            The old link no longer works. If the address was wrong, fix it on
            their record first — an invitation always goes to the address on
            file.
          </Callout>
        )}

        {pending === undefined ? (
          <span className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Checking whether they have already been invited
          </span>
        ) : pending ? (
          /* The state that used to arrive as a refusal after a failed click.
             It names the address the invitation actually went to — which is
             the one on the record at the time, and may no longer be the one
             shown on the record now. */
          <div className="flex flex-col gap-2">
            <p className="text-body-sm leading-relaxed text-body">
              An invitation went to{" "}
              <span className="font-medium text-ink">{pending.email}</span> on{" "}
              {new Date(pending.invitedAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
              })}
              , and they have not set a password yet.
            </p>
            {pending.expired && (
              <Callout tone="warning" title="That link has expired">
                {noEmail
                  ? "Take a new link below."
                  : "Sending it again issues a fresh one."}
              </Callout>
            )}
            {/* The way through when nothing can be emailed: the invitation
                exists and, without this, nobody could ever act on it. */}
            {noEmail && (
              <InviteLinkButton
                userId={pending.userId}
                name={name}
                hint="They have an account waiting. This is the link that lets them set a password."
              />
            )}
            {pending.email !== email && email && (
              /* The record has moved on since the invitation went out. This is
                 exactly the case somebody hits when they came here to correct
                 an address, so it says which button does what rather than
                 leaving them to guess. */
              <Callout tone="warning" title="Their record says something else">
                The record now reads{" "}
                <span className="font-medium">{email}</span>. Sending it again
                still goes to {pending.email} — cancel the invitation and send a
                new one to use the address on the record.
              </Callout>
            )}
          </div>
        ) : (
          <p className="text-body-sm leading-relaxed text-body">
            Sent to <span className="font-medium text-ink">{email}</span>, which
            is the address on their record. Change it there if it is wrong.
          </p>
        )}

        {pending ? null : roles === null ? (
          <span className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Reading the roles
          </span>
        ) : (
          <Field
            label="Sign in as"
            help="What they can see and do. You can only give out a role whose permissions you hold yourself."
          >
            <Select
              value={roleId}
              disabled={busy}
              onChange={(event) => setRoleId(event.target.value)}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

/** The button, so the record page does not carry the open/closed state. */
export function InviteToSignInButton({
  employeeId,
  name,
  email,
}: {
  employeeId: string;
  name: string;
  email: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" size="sm" block onClick={() => setOpen(true)}>
        <KeyRound aria-hidden="true" className="size-3.5" />
        Give them a login
      </Button>
      {open && (
        <InviteToSignIn
          employeeId={employeeId}
          name={name}
          email={email}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
