"use client";

import { useState } from "react";
import {
  Button,
  Callout,
  Field,
  Modal,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiEmploymentChangeRow } from "@/lib/api/endpoints";
import { useEmploymentChangeActions } from "@/lib/store/employment-changes";
import { summarise } from "./changes-screen";

/**
 * Approve, turn down, or withdraw a proposed change.
 *
 * One dialog for both, because which controls it offers is decided by the row's
 * own status and not by which button opened it — a pending change can be
 * approved or declined, a scheduled one can only be withdrawn. Two dialogs
 * would be two places for that rule to drift.
 *
 * The consequence sits above the buttons in both cases, and for approving it is
 * the sentence people get wrong: **approving writes nothing today.** The change
 * is agreed and the record does not move until its date.
 */
export function DecideChangeDialog({
  row,
  onClose,
}: {
  row: ApiEmploymentChangeRow;
  onClose: () => void;
}) {
  const { decide, cancel, readOnly } = useEmploymentChangeActions();
  const toast = useToast();

  const scheduled = row.status === "SCHEDULED";
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function run(action: "approve" | "decline" | "withdraw") {
    setSaving(true);
    setFailure(null);
    try {
      if (action === "approve") {
        await decide(row.id, true, note.trim() || undefined);
        toast.push({
          tone: "success",
          title: `Agreed — ${row.name}'s ${row.kindLabel.toLowerCase()} takes effect on ${row.effectiveOn}`,
          detail: "Nothing on their record has changed yet.",
        });
      } else if (action === "decline") {
        await decide(row.id, false, note.trim());
        toast.push({ tone: "info", title: `Turned down for ${row.name}` });
      } else {
        await cancel(row.id, note.trim());
        toast.push({ tone: "info", title: `Withdrawn for ${row.name}` });
      }
      onClose();
    } catch (error) {
      setFailure(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Something went wrong. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  /* A reason is required for every outcome that is not a plain approval. Same
     rule the API enforces, stated here so somebody is told before they press
     rather than by a 400 after. */
  const needsReason = true;
  const reasonGiven = note.trim() !== "";

  return (
    <Modal
      open
      onClose={onClose}
      title={`${row.kindLabel} — ${row.name}`}
      description={`${summarise(row)} · takes effect ${row.effectiveOn}`}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          {scheduled ? (
            <Button
              variant="danger"
              disabled={saving || readOnly || !reasonGiven}
              onClick={() => void run("withdraw")}
            >
              {saving ? "Saving…" : "Withdraw it"}
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                disabled={saving || readOnly || !reasonGiven}
                onClick={() => void run("decline")}
              >
                Turn it down
              </Button>
              <Button
                variant="approve"
                disabled={saving || readOnly}
                onClick={() => void run("approve")}
              >
                {saving ? "Saving…" : "Agree to it"}
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Callout
          tone={scheduled ? "warning" : "info"}
          title={
            scheduled
              ? "Withdrawing is only possible before the date"
              : "Agreeing does not change their record today"
          }
        >
          {scheduled
            ? `This was already agreed and is waiting for ${row.effectiveOn}. Withdrawing it now leaves the record exactly as it is. Once it has taken effect it cannot be withdrawn — the way back is a change in the other direction, so the history keeps both.`
            : `Their record stays exactly as it is until ${row.effectiveOn}, when it is written automatically. A payroll prepared before then pays the figure they are on now, which is correct — the run says so on its own list.`}
        </Callout>

        {row.note && (
          <div>
            <p className="text-meta text-muted">Reason given</p>
            <p className="text-body-sm text-body">{row.note}</p>
          </div>
        )}

        <Field
          label={scheduled ? "Why it is being withdrawn" : "Note"}
          required={needsReason}
          help={
            scheduled
              ? "Required. This is what somebody reads back if the change comes up again."
              : "Required to turn it down. Optional if you are agreeing."
          }
        >
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
          />
        </Field>

        {failure && (
          <Callout tone="danger" title="That was refused">
            {failure}
          </Callout>
        )}
      </div>
    </Modal>
  );
}
