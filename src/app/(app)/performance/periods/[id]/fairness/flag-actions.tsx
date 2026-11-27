"use client";

import { useState } from "react";
import {
  Button,
  Field,
  Modal,
  RowActions,
  Textarea,
  useToast,
} from "@/components/ui";
import { CalibrateDialog } from "@/components/performance/calibrate-dialog";
import { RevisionDialog } from "@/components/performance/revision-dialog";
import { ApiError } from "@/lib/api/client";
import type { ApiReviewFlag, ReviewCycleStage } from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateShort } from "@/lib/time";
import { useFlagDecisions } from "@/lib/store/performance";

/** What a manager is sent back with, until the person writes their own. */
const ASK_PROMPT =
  "Please add the work this score is based on, or reconsider it before the score review.";

/**
 * What has been decided about one flagged mark, and how to decide it: the score
 * stands, or it changes. Sending the review back is the rarer third, so it sits
 * in a menu. Publishing waits until every flagged mark has an answer here.
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
      toast.push({ title: `${first}'s score is open again`, tone: "success" });
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
      {resolution.state === "stands" && (
        <div className="text-body-sm text-body">
          <p>
            <span className="font-medium text-ink">Score stands</span>
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
            <span className="font-medium text-ink">Score changed</span>
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
            since {day(resolution.since)}.
          </p>
          <blockquote className="mt-2 border-l-2 border-line-strong pl-3 text-ink">
            {resolution.reason}
          </blockquote>
        </div>
      )}

      {!published && resolution.state === "open" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="accent"
            size="sm"
            onClick={() => setDialog("stands")}
          >
            Score stands
          </Button>
          {canMove && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDialog("move")}
            >
              Change the score
            </Button>
          )}
          <RowActions
            label={`More for ${first}`}
            items={[
              {
                label: "Send back",
                available: canAsk,
                onSelect: () => setDialog("ask"),
              },
            ]}
          />
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
      {canAsk && (
        <RevisionDialog
          open={dialog === "ask"}
          onClose={() => setDialog(null)}
          onChanged={onChanged}
          cycleId={cycleId}
          employeeId={person.employeeId}
          employeeName={person.name}
          message={ASK_PROMPT}
        />
      )}
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
        title: `${person.firstName}'s score stands`,
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
      title={`Let ${person.firstName}'s score stand?`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" loading={busy} onClick={() => void save()}>
            Score stands
          </Button>
        </div>
      }
    >
      <Field
        label="Why it stands (optional)"
        {...(failed ? { error: failed } : {})}
      >
        <Textarea
          rows={3}
          value={note}
          disabled={busy}
          placeholder="The manager showed the client work behind the score in the score review."
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
    </Modal>
  );
}
