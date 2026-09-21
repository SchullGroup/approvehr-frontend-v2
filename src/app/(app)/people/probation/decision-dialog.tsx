"use client";

import { useState } from "react";
import {
  Button,
  Callout,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type {
  ApiProbationRow,
  ProbationDecisionBody,
} from "@/lib/api/endpoints";
import { useProbationDecision } from "@/lib/store/probation";

type Outcome = "confirm" | "extend" | "not_confirmed";

/**
 * Confirm, extend, or record that a probation was not passed.
 *
 * ## What each outcome actually does, said on the form
 *
 * The consequence line changes with the choice rather than sitting in help text
 * nobody reads, because the three outcomes differ in ways somebody pressing the
 * button needs to know *before* pressing it — and one of them differs from what
 * people expect. **Not confirming ends nothing.** It records the decision; the
 * exit is a separate, deliberate act through offboarding, which is where the
 * notice period, the final payslip and the asset return live. A dialog that
 * quietly terminated somebody would be an act with consequences taken on the
 * strength of a click that did not say so.
 *
 * The reason box is required for two of the three, matching the API rather than
 * duplicating its judgement: an extension and a refusal are the decisions most
 * likely to be questioned later, and a plain confirmation needs no sentence —
 * demanding one for the ordinary outcome is how a form teaches people to type
 * "ok" into it.
 */
export function ProbationDecisionDialog({
  row,
  onClose,
}: {
  row: ApiProbationRow;
  onClose: () => void;
}) {
  const { decide, readOnly } = useProbationDecision();
  const toast = useToast();

  const [outcome, setOutcome] = useState<Outcome>("confirm");
  const [extendTo, setExtendTo] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const needsReason = outcome !== "confirm";
  const canSave =
    !saving &&
    !readOnly &&
    (outcome !== "extend" || extendTo !== "") &&
    (!needsReason || note.trim() !== "");

  async function save() {
    setSaving(true);
    setFailure(null);
    try {
      const body: ProbationDecisionBody =
        outcome === "confirm"
          ? {
              outcome: "confirm",
              ...(note.trim() ? { note: note.trim() } : {}),
            }
          : outcome === "extend"
            ? { outcome: "extend", extendTo, note: note.trim() }
            : { outcome: "not_confirmed", note: note.trim() };

      await decide(row.employeeId, body);
      toast.push({
        tone: outcome === "confirm" ? "success" : "info",
        title:
          outcome === "confirm"
            ? `${row.name} is confirmed`
            : outcome === "extend"
              ? `${row.name}'s probation now ends ${extendTo}`
              : `Recorded: ${row.name} did not pass probation`,
      });
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

  return (
    <Modal
      open
      onClose={onClose}
      title={`${row.name}'s probation`}
      description={
        row.daysRemaining < 0
          ? `Ended ${Math.abs(row.daysRemaining)} days ago, on ${row.probationEndsAt}.`
          : `Ends on ${row.probationEndsAt}.`
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant={outcome === "confirm" ? "approve" : "accent"}
            onClick={() => void save()}
            disabled={!canSave}
          >
            {saving
              ? "Saving…"
              : outcome === "confirm"
                ? "Confirm them"
                : outcome === "extend"
                  ? "Extend probation"
                  : "Record the decision"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* No `id` on the control and no `htmlFor` here: `Field` generates the
            id and wires the label itself, and passing one breaks that binding
            so the label points at nothing. */}
        <Field label="Outcome">
          <Select
            value={outcome}
            onChange={(e) => setOutcome(e.currentTarget.value as Outcome)}
          >
            <option value="confirm">Confirm — they passed</option>
            <option value="extend">Extend the probation</option>
            <option value="not_confirmed">Not confirmed</option>
          </Select>
        </Field>

        {/* The consequence, stated before the button rather than after it. */}
        <Callout
          tone={outcome === "not_confirmed" ? "warning" : "info"}
          title={
            outcome === "confirm"
              ? "This confirms their employment"
              : outcome === "extend"
                ? "This moves the date, nothing else"
                : "This ends nothing on its own"
          }
        >
          {outcome === "confirm"
            ? "Their status moves to active and the confirmation is recorded against their record with your name and today's date."
            : outcome === "extend"
              ? "They stay on probation until the new date, and a fresh decision is raised as it approaches."
              : "The decision is recorded and their employment continues unchanged. Ending it has a notice period, a final payslip and equipment to collect — start that from their record, under Record their exit."}
        </Callout>

        {outcome === "extend" && (
          <Field
            label="New end date"
            help={`Must be later than ${row.probationEndsAt}.`}
            required
          >
            <Input
              type="date"
              value={extendTo}
              onChange={(e) => setExtendTo(e.currentTarget.value)}
            />
          </Field>
        )}

        <Field
          label={needsReason ? "Reason" : "Note"}
          required={needsReason}
          {...(needsReason
            ? { help: "This is the part somebody reads back months later." }
            : { optional: true })}
        >
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            placeholder={
              outcome === "extend"
                ? "What needs to happen before they can be confirmed?"
                : outcome === "not_confirmed"
                  ? "What was not met?"
                  : ""
            }
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
