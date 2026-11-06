"use client";

import { useState } from "react";
import { Button, Field, Input, Modal, useToast } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { useCycleMutations } from "@/lib/store/performance";

/** The API's own bounds on a period name (`cycleName` in the backend schema). */
const MIN = 3;
const MAX = 80;

/**
 * Renames an appraisal period.
 *
 * The name was settable only in the start-a-period dialog, so a typo there was
 * on every form, inbox and report for good. `PATCH /cycles/:id` has always taken
 * `name` (and refuses one another period already uses); this is its caller.
 * Open at every stage: a corrected name changes nothing anybody wrote.
 */
export function RenamePeriodDialog({
  period,
  open,
  onClose,
  onRenamed,
}: {
  period: { id: string; name: string };
  open: boolean;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const periods = useCycleMutations();
  const toast = useToast();
  const [name, setName] = useState(period.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Reset to the current name each time it opens, so a cancelled edit does not
     come back the next time. Adjusted during render, not in an effect. */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(period.name);
      setError(null);
    }
  }

  const trimmed = name.trim();
  const unchanged = trimmed === period.name;

  const save = async () => {
    /* The Save button is off while this runs, and Enter in the box is not: it
       submits the form. A second press in flight would send the same name twice. */
    if (saving) return;
    if (trimmed.length < MIN) {
      setError("Name it: people will see this in their inbox.");
      return;
    }
    if (trimmed.length > MAX) {
      setError(`Keep it to ${MAX} characters: it is a heading.`);
      return;
    }
    if (unchanged) {
      onClose();
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await periods.updateCycle(period.id, { name: trimmed });
      onRenamed();
      onClose();
      toast.push({ title: `Renamed to ${trimmed}`, tone: "success" });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not rename it. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rename this period"
      description="The new name shows on everybody's form, inbox and report."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={saving}
            disabled={unchanged}
            onClick={() => void save()}
          >
            Save name
          </Button>
        </div>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field label="Period name" required {...(error ? { error } : {})}>
          <Input
            value={name}
            maxLength={MAX}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}
