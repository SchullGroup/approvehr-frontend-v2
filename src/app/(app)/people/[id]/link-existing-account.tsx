"use client";

import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import {
  Button,
  Callout,
  Field,
  Modal,
  Select,
  Spinner,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { invitesApi, type UnlinkedUser } from "@/lib/api/invites";

/**
 * The other half of "give them a login" — pointing a sign-in that already
 * exists at this record, rather than sending a fresh invitation.
 *
 * Exists for exactly one recurring shape: whoever registered the company has
 * a real account and no personnel file, permanently — `register` never had
 * an employee to point at, and nothing since has offered a way to fix that
 * after the fact. `invitesApi.unlinked()` is every account in that state, and
 * this is the screen that closes it: their own record, picked from the
 * directory like anyone else's, with this dialog reachable from it.
 */
function LinkExistingAccount({
  employeeId,
  employeeName,
  onClose,
}: {
  employeeId: string;
  employeeName: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [candidates, setCandidates] = useState<UnlinkedUser[] | null>(null);
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void invitesApi
      .unlinked(controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return;
        setCandidates(rows);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCandidates([]);
      });
    return () => controller.abort();
  }, []);

  async function link() {
    setBusy(true);
    setFailed(null);
    try {
      const linked = await invitesApi.linkEmployee(userId, employeeId);
      toast.push({
        title: `${linked.name}'s sign-in is now ${employeeName}`,
        tone: "success",
      });
      onClose();
    } catch (caught) {
      setFailed(
        caught instanceof ApiError
          ? caught.message
          : "That did not link. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Link a sign-in to ${employeeName}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" disabled={!userId || busy} onClick={() => void link()}>
            {busy ? "Linking…" : "Link it"}
          </Button>
        </div>
      }
    >
      {candidates === null ? (
        <div className="flex items-center gap-2 text-body-sm text-muted">
          <Spinner size="sm" />
          Loading
        </div>
      ) : candidates.length === 0 ? (
        <p className="text-body-sm leading-relaxed text-muted">
          Every sign-in in your company already has a personnel file, or there
          is only one account and it is already linked. There is nothing to
          link here yet.
        </p>
      ) : (
        <Field
          label="Sign-in"
          help="Whoever this is will see this record's documents, leave and payslips as their own."
        >
          <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Choose one</option>
            {candidates.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.name} — {c.email}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {failed && (
        <Callout tone="danger" title="That did not work" className="mt-4">
          {failed}
        </Callout>
      )}
    </Modal>
  );
}

export function LinkExistingAccountButton({
  employeeId,
  employeeName,
}: {
  employeeId: string;
  employeeName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" size="sm" block onClick={() => setOpen(true)}>
        <Link2 aria-hidden="true" className="size-3.5" />
        Link an existing sign-in
      </Button>
      {open && (
        <LinkExistingAccount
          employeeId={employeeId}
          employeeName={employeeName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
