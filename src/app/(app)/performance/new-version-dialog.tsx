"use client";

import { useState } from "react";
import {
  Button,
  Callout,
  Field,
  Modal,
  Select,
  useToast,
} from "@/components/ui";
import { kindOf } from "@/lib/api/failure";
import type {
  AnswerKind,
  ApiCompetency,
  NewVersionResult,
} from "@/lib/api/performance";
import { answerKindOf, kindOptionLabel } from "@/lib/performance/answer-kind";
import {
  NEW_VERSION_CONFIRM,
  newVersionEffects,
  newVersionTitle,
  otherKinds,
  startedLine,
  startedToast,
} from "@/lib/performance/new-version";
import { useFrameworkActions } from "@/lib/store/performance";
import { actionMessage } from "@/lib/use-action";

/**
 * Start a new version of a subsection, answered another way.
 *
 * ## Where it lives, and why not in the panel that opens it
 *
 * The tree renders this, not the panel. Starting a version retires the subsection
 * the panel is showing, so the list re-reads and that row, and the panel under it,
 * go. A dialog owned by the panel would be unmounted by the very read this press
 * causes, in the middle of showing what happened. Held by the tree, which stays,
 * it can stay on screen until somebody has read it.
 *
 * ## One press, with the consequences on the page above it
 *
 * Choosing the kind and confirming are one dialog: the choice is the only input,
 * and the lines under it say what happens, in words, before the button is pressed.
 * Nothing is chosen for somebody: **Start new version** waits for a choice, because
 * what it makes is a second subsection and a retired first one.
 *
 * ## What the API says after, and why it stays up
 *
 * The API names what moved and what was left behind (which draft periods, which
 * job roles) in sentences of its own. When it sends any, they are shown here, as
 * they came, until **Done**: a toast is gone in six seconds and these are the
 * sentences that say what to do next (add the choices, ask it again). With none,
 * there is nothing to stay for and the dialog closes on a toast.
 *
 * ## A refusal stays in the dialog
 *
 * The one that matters is a period that is running and asks the subsection: the API
 * names it, and the dialog stays open with that sentence and the choice still made,
 * the way `DeclineDialog` keeps a reason. It cannot be closed while the request is
 * in flight, so what comes back is never lost behind a dialog that has gone.
 */
export function NewVersionDialog({
  competency,
  onClose,
  onStarted,
}: {
  competency: ApiCompetency;
  onClose: () => void;
  /** After the API said yes. The tree re-reads and opens the new subsection. */
  onStarted: (result: NewVersionResult, kind: AnswerKind) => void;
}) {
  const { newCompetencyVersion } = useFrameworkActions();
  const toast = useToast();
  const [to, setTo] = useState<AnswerKind | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    result: NewVersionResult;
    kind: AnswerKind;
  } | null>(null);

  const from = answerKindOf(competency);
  const options = otherKinds(from);
  const close = () => {
    if (!busy) onClose();
  };

  const start = async () => {
    if (to === "" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await newCompetencyVersion(competency.id, to);
      onStarted(result, to);
      if (result.notes.length === 0) {
        toast.push({ ...startedToast(result), tone: "success" });
        onClose();
      } else {
        setDone({ result, kind: to });
      }
    } catch (caught) {
      /* The API's own sentence: it names the subsection and, when a running
         period asks it, the period. Nothing here can say either. A 404 is the one
         answer that has no sentence of its own to show, and what it says is gone is
         the subsection, never the version this was about to make. */
      setError(
        kindOf(caught) === "missing"
          ? `${competency.name} is not there any more, so nothing was changed.`
          : actionMessage(caught, "the new version"),
      );
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Modal
        open
        onClose={close}
        title={`Started a new version of ${done.result.competency.name}`}
        size="md"
        footer={
          <Button variant="accent" onClick={close}>
            Done
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-body-sm text-ink">
            {startedLine(done.result, done.kind, from)}
          </p>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-body-sm text-muted">
            {done.result.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={close}
      title={newVersionTitle(competency.name)}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={to === ""}
            onClick={() => void start()}
          >
            {NEW_VERSION_CONFIRM}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="How the new version is answered" required>
          <Select
            value={to}
            placeholder="Choose how it is answered"
            disabled={busy}
            onChange={(event) => {
              setTo(event.target.value as AnswerKind | "");
              setError(null);
            }}
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {kindOptionLabel(option, competency.scaleMax)}
              </option>
            ))}
          </Select>
        </Field>

        <ul className="flex list-disc flex-col gap-2 pl-5 text-body-sm text-muted">
          {newVersionEffects({
            name: competency.name,
            ratingCount: competency.ratingCount,
            from,
            to: to === "" ? null : to,
          }).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>

        {error && (
          <Callout tone="danger" title="That did not go through">
            {error}
          </Callout>
        )}
      </div>
    </Modal>
  );
}
