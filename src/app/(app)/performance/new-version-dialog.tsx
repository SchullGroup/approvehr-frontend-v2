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
  startedToast,
} from "@/lib/performance/new-version";
import { useFrameworkActions } from "@/lib/store/performance";
import { actionMessage } from "@/lib/use-action";

/**
 * Start a new version of a subsection, answered another way.
 *
 * ## The choice, and nothing else on the page
 *
 * One select, Cancel and **Start new version**, which waits for a choice because
 * what it makes is a second subsection and a retired first one. What that does is
 * behind the icon beside the label, in words, so it can be read before the button
 * is pressed without being a page of bullets to get past.
 *
 * ## It is held by whoever opens it, not by the panel that has the button
 *
 * Starting a version retires the subsection the panel is showing, so the list
 * re-reads and that row, and the panel under it, go. A dialog owned by the panel
 * would be unmounted by the very read this press causes.
 *
 * ## The result is a toast
 *
 * What happened, and the API's own sentences about what moved and what was left
 * behind when it sends any (which draft periods, which job roles), as the toast's
 * detail. A refusal stays in the dialog, with the choice still made, the way
 * `DeclineDialog` keeps a reason; it cannot be closed while the request is in
 * flight, so what comes back is never lost behind a dialog that has gone.
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
      toast.push({ ...startedToast(result), tone: "success" });
      onClose();
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

  return (
    <Modal
      open
      onClose={close}
      title={newVersionTitle(competency.name)}
      size="sm"
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
        <Field
          label="How the new version is answered"
          required
          help={newVersionEffects({
            name: competency.name,
            ratingCount: competency.ratingCount,
            from,
            to: to === "" ? null : to,
          }).join(" ")}
        >
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

        {error && (
          <Callout tone="danger" title="That did not go through">
            {error}
          </Callout>
        )}
      </div>
    </Modal>
  );
}
