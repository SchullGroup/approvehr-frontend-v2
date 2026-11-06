"use client";

import { useState } from "react";
import { Button, Field, Input, Modal, useToast } from "@/components/ui";
import type { ApiCycle } from "@/lib/api/performance";
import {
  periodNameProblem,
  renamedToast,
  renameNote,
} from "@/lib/performance/period-name";
import { useCycleMutations } from "@/lib/store/performance";
import { actionMessage } from "@/lib/use-action";

/**
 * Change what an appraisal period is called.
 *
 * The API has always taken a new `name` on `PATCH /cycles/:id`, at any stage,
 * and nothing in the product offered it: a name typed wrongly while creating a
 * period could only be fixed by deleting the period and starting again, which a
 * draft allows and a running one never does.
 *
 * ## Mounted only while it is open
 *
 * The screen renders it while `renaming` is set, so every open starts from the
 * period's current name and the last attempt's typing or refusal is never
 * carried into the next. The same pattern as `NewVersionDialog`.
 *
 * ## A refusal stays on the field
 *
 * The one the API gives that matters is a name already in use, and it is the
 * server's own sentence: only it knows about every period. It is shown under
 * the box with what was typed still there, and the dialog cannot be closed
 * while the request is in flight, so the answer is never lost behind a dialog
 * that has gone.
 */
export function RenamePeriodDialog({
  period,
  onClose,
  onRenamed,
}: {
  period: Pick<ApiCycle, "id" | "name" | "stage">;
  onClose: () => void;
  /** After the API said yes. The screen reads the period again. */
  onRenamed: (name: string) => void;
}) {
  const { updateCycle } = useCycleMutations();
  const toast = useToast();
  const [name, setName] = useState(period.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const changed = trimmed !== period.name;
  const close = () => {
    if (!busy) onClose();
  };

  const save = async () => {
    if (busy || !changed) return;
    const problem = periodNameProblem(name);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateCycle(period.id, { name: trimmed });
      onRenamed(trimmed);
      toast.push({ ...renamedToast(trimmed), tone: "success" });
      onClose();
    } catch (caught) {
      setError(actionMessage(caught, "the new name"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={close}
      title="Rename this period"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={!changed}
            onClick={() => void save()}
          >
            Save
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field label="Period name" required {...(error ? { error } : {})}>
          <Input
            value={name}
            disabled={busy}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
        </Field>
        <p className="text-body-sm text-muted">
          {renameNote(period.stage !== "DRAFT")}
        </p>
      </form>
    </Modal>
  );
}
