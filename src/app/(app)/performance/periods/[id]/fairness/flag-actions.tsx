"use client";

import { useState } from "react";
import { Button, Field, Modal, Textarea, useToast } from "@/components/ui";
import { CalibrateDialog } from "@/components/performance/calibrate-dialog";
import { ApiError } from "@/lib/api/client";
import type { ApiReviewFlag, ReviewCycleStage } from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateShort } from "@/lib/time";
import { useCycleMutations, useFlagDecisions } from "@/lib/store/performance";

const ASK_PROMPT =
  "Please add the work this mark is based on, or reconsider it before calibration.";

/**
 * What has been decided about one flagged mark, and the three ways to decide
 * it. Publishing waits until every flagged mark has an answer here.
 */
export function FlagActions({
  cycleId,
  person,
  stage,
  onChanged,
}: {
  cycleId: string;
  person: ApiReviewFlag;
  stage: ReviewCycleStage | null;
  onChanged: () => void;
}) {
  const canManage = useCan("MANAGE_SETTINGS");
  const timeZone = useOrgTimezone();
  const day = (iso: string) => formatDateShort(iso, timeZone);
  const { reopen } = useFlagDecisions();
  const toast = useToast();
  const [dialog, setDialog] = useState<"stands" | "move" | "ask" | null>(null);
  const [busy, setBusy] = useState(false);

  const resolution = person.resolution;
  if (!resolution) return null;
  const published = stage === "PUBLISHED";
  const canMove = canManage && (stage === "MANAGER" || stage === "CALIBRATION");
  const canAsk = canManage && person.managerReviewSubmitted;
  const first = person.firstName;

  const takeBack = async () => {
    setBusy(true);
    try {
      await reopen(cycleId, person.employeeId);
      toast.push({ title: `${first}'s mark is open again`, tone: "success" });
      onChanged();
    } catch (caught) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail: caught instanceof Error ? caught.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-10 border-t border-line pt-6">
      <h3 className="mb-2 text-body-sm font-semibold text-ink">Decision</h3>

      {resolution.state === "open" && (
        <p className="text-body-sm text-body">
          Not decided yet.
          {published
            ? ""
            : " Publishing waits until every flagged mark has a decision."}
        </p>
      )}
      {resolution.state === "stands" && (
        <div className="text-body-sm text-body">
          <p>
            <span className="font-medium text-ink">Mark stands</span>
            {resolution.by ? `, decided by ${resolution.by}` : ""} on{" "}
            {day(resolution.at)}.
          </p>
          {resolution.note && (
            <blockquote className="mt-2 border-l-2 border-line-strong pl-3 text-ink">
              {resolution.note}
            </blockquote>
          )}
        </div>
      )}
      {resolution.state === "moved" && (
        <div className="text-body-sm text-body">
          <p>
            <span className="font-medium text-ink">Mark changed</span>
            {resolution.by ? ` by ${resolution.by}` : ""} on{" "}
            {day(resolution.at)}.
          </p>
          <blockquote className="mt-2 border-l-2 border-line-strong pl-3 text-ink">
            {resolution.reason}
          </blockquote>
        </div>
      )}
      {resolution.state === "waiting" && (
        <div className="text-body-sm text-body">
          <p>
            <span className="font-medium text-ink">
              Waiting on their manager
            </span>{" "}
            since {day(resolution.since)}. {first} comes back here for a
            decision once the review is sent again.
          </p>
          <blockquote className="mt-2 border-l-2 border-line-strong pl-3 text-ink">
            {resolution.reason}
          </blockquote>
        </div>
      )}

      {!published && resolution.state === "open" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="accent"
            size="sm"
            onClick={() => setDialog("stands")}
          >
            Mark stands
          </Button>
          {canMove && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDialog("move")}
            >
              Change the mark
            </Button>
          )}
          {canAsk && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDialog("ask")}
            >
              Ask the manager
            </Button>
          )}
        </div>
      )}
      {!published && resolution.state === "stands" && (
        <div className="mt-4">
          <Button
            variant="ghost"
            size="sm"
            loading={busy}
            onClick={() => void takeBack()}
          >
            Reopen
          </Button>
        </div>
      )}

      <MarkStandsDialog
        open={dialog === "stands"}
        onClose={() => setDialog(null)}
        onDone={onChanged}
        cycleId={cycleId}
        person={person}
      />
      <CalibrateDialog
        open={dialog === "move"}
        onClose={() => setDialog(null)}
        onChanged={onChanged}
        cycleId={cycleId}
        employeeId={person.employeeId}
        employeeName={person.name}
        computedBp={person.markBp}
        existing={null}
        showEvidence={false}
      />
      <AskManagerDialog
        open={dialog === "ask"}
        onClose={() => setDialog(null)}
        onDone={onChanged}
        cycleId={cycleId}
        person={person}
      />
    </section>
  );
}

function MarkStandsDialog({
  open,
  onClose,
  onDone,
  cycleId,
  person,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  cycleId: string;
  person: ApiReviewFlag;
}) {
  const { stands } = useFlagDecisions();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await stands(cycleId, person.employeeId, note.trim() || null);
      toast.push({
        title: `${person.firstName}'s mark stands`,
        tone: "success",
      });
      setNote("");
      onClose();
      onDone();
    } catch (caught) {
      setFailed(
        caught instanceof ApiError || caught instanceof Error
          ? caught.message
          : "Could not record that.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Let ${person.firstName}'s mark stand?`}
      description="Recorded with your name and today's date. If the mark changes later, this reopens."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" loading={busy} onClick={() => void save()}>
            Mark stands
          </Button>
        </div>
      }
    >
      <Field
        label="Why it stands (optional)"
        help="Kept with the decision, so it explains itself if anybody asks later."
        {...(failed ? { error: failed } : {})}
      >
        <Textarea
          rows={3}
          value={note}
          disabled={busy}
          placeholder="The manager showed the client work behind the mark at the calibration meeting."
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
    </Modal>
  );
}

function AskManagerDialog({
  open,
  onClose,
  onDone,
  cycleId,
  person,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  cycleId: string;
  person: ApiReviewFlag;
}) {
  const periods = useCycleMutations();
  const toast = useToast();
  const [reason, setReason] = useState(ASK_PROMPT);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const manager = person.managerName ?? "their manager";

  const send = async () => {
    if (reason.trim().length < 10) {
      setFailed(
        "Say what you need in a sentence: this is what they will read.",
      );
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      await periods.requestRevision(cycleId, {
        employeeId: person.employeeId,
        targetStage: "MANAGER",
        reason: reason.trim(),
      });
      toast.push({
        title: `Sent back to ${manager}`,
        tone: "success",
        detail: `${person.firstName} comes back to the queue once the review is sent again.`,
      });
      setReason(ASK_PROMPT);
      onClose();
      onDone();
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
      title={`Ask ${manager} to look again`}
      description={`Reopens ${person.firstName}'s manager review with your message.`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" loading={busy} onClick={() => void send()}>
            Send it back
          </Button>
        </div>
      }
    >
      <Field
        label="Message"
        required
        help={`${manager} sees only this message. The fairness check, its summary and its patterns are never shared with them.`}
        {...(failed ? { error: failed } : {})}
      >
        <Textarea
          rows={4}
          value={reason}
          disabled={busy}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
    </Modal>
  );
}
