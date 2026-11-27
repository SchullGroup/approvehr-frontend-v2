"use client";

import { useState } from "react";
import {
  Button,
  Field,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { useCycleMutations } from "@/lib/store/performance";

/** The API's floor for the reason on a request to look again. */
const REASON_MIN = 10;

/**
 * Sending one person's review back for another pass.
 *
 * ## One dialog, two doors
 *
 * The period's Scores menu and the fairness check's review queue both send a
 * review back, and they used to have a dialog each. This is the one, so the
 * title, the button and the toast say the same words wherever it is opened.
 *
 * ## A reopened review, not an edited one
 *
 * Opening a request clears that one review's submission and sign-off, without
 * touching the period's stage or anyone else's review. It resolves itself the
 * moment they send it again.
 *
 * ## Which review, only when it matters
 *
 * It is the manager's review unless the caller says otherwise, and the choice
 * between that and the person's own appraisal is offered only when both could be
 * meant (`choose`). A reason is required, so the button waits for one rather than
 * scolding afterwards.
 */
export function RevisionDialog({
  open,
  onClose,
  cycleId,
  employeeId,
  employeeName,
  onChanged,
  target = "MANAGER",
  choose = false,
  message = "",
}: {
  open: boolean;
  onClose: () => void;
  cycleId: string;
  employeeId: string;
  employeeName: string;
  onChanged: () => void;
  /** The review that is sent back, until the person chooses another. */
  target?: "SELF" | "MANAGER";
  /** Offer the choice between the manager's review and the person's own. */
  choose?: boolean;
  /** The words the reason starts with, for a caller that has a standard one. */
  message?: string;
}) {
  const periods = useCycleMutations();
  const toast = useToast();

  const [targetStage, setTargetStage] = useState<"SELF" | "MANAGER">(target);
  const [reason, setReason] = useState(message);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  /* A new form each time it opens, so last time's reason is gone. Adjusted
     during render, not in an effect. */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTargetStage(target);
      setReason(message);
      setFailed(null);
    }
  }

  const save = async () => {
    if (reason.trim().length < REASON_MIN) return;
    setBusy(true);
    setFailed(null);
    try {
      await periods.requestRevision(cycleId, {
        employeeId,
        targetStage,
        reason: reason.trim(),
      });
      toast.push({ title: `Sent back to ${employeeName}`, tone: "success" });
      onClose();
      onChanged();
    } catch (caught) {
      setFailed(
        caught instanceof ApiError || caught instanceof Error
          ? caught.message
          : "Could not send that back.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Send ${employeeName}'s review back`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={reason.trim().length < REASON_MIN}
            onClick={() => void save()}
          >
            Send back
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {choose && (
          <Field label="Which review">
            <Select
              value={targetStage}
              disabled={busy}
              onChange={(event) =>
                setTargetStage(event.target.value as "SELF" | "MANAGER")
              }
            >
              <option value="MANAGER">Manager review</option>
              <option value="SELF">Self-appraisal</option>
            </Select>
          </Field>
        )}

        <Field label="Why" required {...(failed ? { error: failed } : {})}>
          <Textarea
            rows={3}
            value={reason}
            disabled={busy}
            placeholder="The objectives section is missing answers for two of the agreed goals."
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
