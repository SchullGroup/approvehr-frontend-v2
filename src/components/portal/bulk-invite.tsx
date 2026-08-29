"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button, useToast, type ButtonVariant } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { employees as employeesApi } from "@/lib/api/endpoints";
import { invitesApi, type BulkInviteResult } from "@/lib/api/invites";
import { permissionsApi } from "@/lib/api/permissions";
import { useCan } from "@/lib/permissions";
import { useSession } from "@/lib/store/session";
import {
  InviteStaffDialog,
  type InviteCandidate,
  type InviteRoleOption,
} from "@/app/(app)/people/attendance/invite-staff-dialog";

/**
 * "Invite staff", wherever somebody looks for it.
 *
 * ## Why this is a component and not a second copy
 *
 * The bulk invite lived entirely inside `attendance-screen.tsx` — eighty lines
 * of orchestration around `InviteStaffDialog`, reachable only from Attendance.
 * That is a defensible place to *discover* it, since clocking in is what makes
 * a shop-floor login necessary, and a poor place to be the **only** door: the
 * question "why has nobody got a login" is asked on the Directory, which is
 * where the people are.
 *
 * So the orchestration moved here and both screens mount it. One copy of "load
 * everybody who cannot sign in, load the roles, default to Employee, send" —
 * because two copies drift until one of them stops defaulting to the right role
 * or stops filtering out people who already have an account.
 *
 * ## The question this answers for a company on day one
 *
 * Adding an employee creates a **record**, not an account. That is deliberate —
 * most of a payroll never signs in, and minting an account for a cleaner who
 * will never open the product is an unused credential and an unnecessary
 * mailbox. The importer sends an invitation only for a row that carries a
 * `role`.
 *
 * The consequence, which nothing used to say out loud: a company that imports
 * three hundred people with their emails and no `role` column gets three
 * hundred records and no logins, and the fix is this button.
 */
export function BulkInviteButton({
  label = "Invite staff",
  variant = "secondary",
  onDone,
}: {
  label?: string;
  variant?: ButtonVariant;
  /** Fired after a send, so a caller can refresh whatever it is showing. */
  onDone?: () => void;
}) {
  const session = useSession();
  const canInvite = useCan("INVITE_STAFF");
  const toast = useToast();

  const [open, setOpen] = useState(false);
  /** `null` means "the dialog is open and still loading". */
  const [candidates, setCandidates] = useState<InviteCandidate[] | null>(null);
  const [roles, setRoles] = useState<InviteRoleOption[]>([]);
  const [defaultRoleId, setDefaultRoleId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkInviteResult | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  /* Absent, not disabled. Somebody who cannot invite has no use for a button
     the API would refuse — the rule the nav and the dashboard tiles follow. */
  if (!canInvite) return null;

  async function openDialog() {
    /* An invitation creates a real account and sends a real email — the same
       category as a payment provider, not a demo write that never leaves this
       browser. Refusing here beats opening a form that can only ever fail. */
    if (!session.isConnected) {
      toast.push({
        title: "This needs the API",
        tone: "info",
        detail:
          "Demo mode cannot create a real account or send a real invitation email.",
      });
      return;
    }
    setOpen(true);
    setCandidates(null);
    setResult(null);
    setBanner(null);
    try {
      const [directory, roleList] = await Promise.all([
        employeesApi.list({ status: "ACTIVE", pageSize: 200 }),
        permissionsApi.roles(),
      ]);
      setCandidates(
        directory.data
          .filter((person) => !person.canLogin)
          .map((person) => ({
            employeeId: person.id,
            name: `${person.firstName} ${person.lastName}`,
            jobTitle: person.jobTitle,
            /* The address already on their record. Ticking somebody fills the
               box rather than asking for an email the import already stored. */
            email: person.email,
          })),
      );
      setRoles(roleList.roles.map((role) => ({ id: role.id, name: role.name })));
      /* "Employee" carries no permissions at all, which is exactly right for
         somebody being set up for nothing but their own payslips and their own
         requests. */
      setDefaultRoleId(
        roleList.roles.find((role) => role.name === "Employee")?.id ??
          roleList.roles[0]?.id ??
          null,
      );
    } catch (error) {
      setBanner(
        error instanceof ApiError
          ? error.message
          : "Could not load your staff list.",
      );
      setCandidates([]);
    }
  }

  async function send(
    people: { employeeId: string; email: string }[],
    roleId: string,
  ) {
    setBusy(true);
    setBanner(null);
    try {
      setResult(await invitesApi.bulkSend(people, [roleId]));
      onDone?.();
    } catch (error) {
      setBanner(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant={variant} size="sm" onClick={() => void openDialog()}>
        <KeyRound aria-hidden="true" className="size-3.5" />
        {label}
      </Button>

      {open && (
        <InviteStaffDialog
          candidates={candidates}
          roles={roles}
          defaultRoleId={defaultRoleId}
          busy={busy}
          result={result}
          banner={banner}
          onClose={() => {
            setOpen(false);
            setCandidates(null);
            setResult(null);
            setBanner(null);
          }}
          onSend={(people, roleId) => void send(people, roleId)}
        />
      )}
    </>
  );
}
