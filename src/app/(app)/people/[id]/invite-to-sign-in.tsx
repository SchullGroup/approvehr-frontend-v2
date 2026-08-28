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
import type { SentInvite } from "@/lib/api/invites";

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

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const list = await permissionsApi.roles(controller.signal);
        if (controller.signal.aborted) return;
        setRoles(list.roles.map((role) => ({ id: role.id, name: role.name })));
        /* Employee is the answer for almost everybody being given a login for
           the first time, so it is offered rather than a blank picker. */
        const staff = list.roles.find((role) => role.name === "Employee");
        setRoleId(staff?.id ?? list.roles[0]?.id ?? "");
      } catch {
        if (!controller.signal.aborted) setRoles([]);
      }
    })();
    return () => controller.abort();
  }, []);

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
          <Callout tone="success" title={`${name} was invited`}>
            They can set a password from the link in their email and sign in as
            soon as they do.
          </Callout>
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
      title={`Give ${name} a login`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={busy || !roleId}
            onClick={() => void send()}
          >
            Send the invitation
          </Button>
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

        <p className="text-body-sm leading-relaxed text-body">
          Sent to <span className="font-medium text-ink">{email}</span>, which
          is the address on their record. Change it there if it is wrong.
        </p>

        {roles === null ? (
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
