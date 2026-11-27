"use client";

import { useState } from "react";
import {
  Button,
  Field,
  Input,
  Modal,
  Textarea,
  useToast,
} from "@/components/ui";
import { exactPoints } from "@/components/performance/record-check";
import { ApiError } from "@/lib/api/client";
import { scoreLabel, type ApiCalibration } from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import { useCycleMutations, useReviewFlag } from "@/lib/store/performance";

/**
 * Moving one person's mark at calibration. Shared by the period's marks list
 * and the fairness check's review queue, so both record a move the same way.
 */
export function CalibrateDialog({
  open,
  onClose,
  onChanged,
  cycleId,
  employeeId,
  employeeName,
  computedBp,
  existing,
  showEvidence = true,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  cycleId: string;
  employeeId: string;
  employeeName: string;
  /** What the answers produced. */
  computedBp: number;
  existing: ApiCalibration | null;
  /** Off where the evidence is already on screen beside the dialog. */
  showEvidence?: boolean;
}) {
  const periods = useCycleMutations();
  const toast = useToast();
  const [percent, setPercent] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [seededFor, setSeededFor] = useState(false);

  // Seeded with what is on screen each time it opens; the reason never is,
  // because a new decision needs a new account of itself.
  if (open && !seededFor) {
    setSeededFor(true);
    setPercent(
      String(Math.round((existing?.calibratedBp ?? computedBp) / 100)),
    );
    setReason("");
    setFailed(null);
  }
  if (!open && seededFor) setSeededFor(false);

  const canSeeFairness = useCan("VIEW_FAIRNESS");
  const { flag } = useReviewFlag(
    cycleId,
    employeeId,
    open && showEvidence && canSeeFairness,
  );
  const offEvidence =
    flag && (flag.status === "below" || flag.status === "above") ? flag : null;

  const save = async () => {
    const value = Number(percent);
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      setFailed("Give a whole percentage between 0 and 100.");
      return;
    }
    if (reason.trim().length < 10) return;
    setBusy(true);
    setFailed(null);
    try {
      await periods.calibrate(cycleId, employeeId, {
        calibratedBp: value * 100,
        reason: reason.trim(),
      });
      toast.push({
        title: `${employeeName}'s score is now ${String(value)}%`,
        tone: "success",
      });
      onClose();
      onChanged();
    } catch (caught) {
      setFailed(
        caught instanceof ApiError
          ? caught.message
          : "Could not change that score.",
      );
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await periods.clearCalibration(cycleId, employeeId);
      toast.push({
        title: `${employeeName}'s score is back to what the answers produced`,
        tone: "success",
      });
      onClose();
      onChanged();
    } catch (caught) {
      setFailed(
        caught instanceof ApiError
          ? caught.message
          : "Could not put that score back.",
      );
    } finally {
      setBusy(false);
    }
  };

  /* One line under the title, for whichever of the two things is true: the score
     has been changed already, or the evidence points somewhere else. */
  const line = [
    existing
      ? `Changed from ${scoreLabel(existing.originalBp)} to ${scoreLabel(existing.calibratedBp)}${existing.calibratedByName ? ` by ${existing.calibratedByName}` : ""}: “${existing.reason}”`
      : null,
    offEvidence && offEvidence.gapBp !== null && offEvidence.expectedBp !== null
      ? `The evidence suggests ${scoreLabel(offEvidence.expectedBp)}, ${exactPoints(offEvidence.gapBp)}.`
      : null,
  ]
    .filter((one): one is string => one !== null)
    .join(" ");

  // Stays mounted: `Modal` reads its own dismiss state for the exit animation.
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Change ${employeeName}'s score`}
      {...(line ? { description: line } : {})}
      size="sm"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {existing ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void clear()}
            >
              Put it back
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="accent"
              loading={busy}
              disabled={reason.trim().length < 10}
              onClick={() => void save()}
            >
              Save
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="New score"
          required
          {...(failed ? { error: failed } : {})}
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              inputMode="numeric"
              className="w-28"
              value={percent}
              disabled={busy}
              onChange={(event) => setPercent(event.target.value)}
            />
            <span className="text-body-sm text-muted">%</span>
          </div>
        </Field>

        <Field label="Why" required>
          <Textarea
            rows={3}
            value={reason}
            disabled={busy}
            placeholder="Agreed at the review meeting: this team's targets were set higher than the rest of the department."
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
