"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Button,
  Field,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ReviewAudience, ReviewQuestionKind } from "@/lib/api/performance";
import { useCycleMutations } from "@/lib/store/performance";

const KINDS: { value: ReviewQuestionKind; label: string }[] = [
  { value: "RATING", label: "A mark out of five" },
  { value: "TEXT", label: "In their own words" },
  { value: "BOOLEAN", label: "Yes or no" },
];

const AUDIENCES: { value: ReviewAudience; label: string }[] = [
  { value: "MANAGER", label: "Their manager (you)" },
  { value: "SELF", label: "The person themselves" },
];

/**
 * A manager's own question on a draft period, on top of HR's standard ones.
 *
 * ## Deliberately narrower than HR's builder
 *
 * `QuestionsDialog` edits and removes every question on the cycle and files
 * one under a subsection HR manages — right for HR, wrong here. This adds
 * exactly one question, filed nowhere, and a manager cannot see or touch
 * anybody else's — the API scopes what gets created to the caller's own
 * department and refuses everything else about the cycle. No pick-from-a-list
 * kind either: that needs an options editor and suggested phrasing, which is
 * HR's configuration surface, not a one-off role-specific ask.
 *
 * ## Why this exists at all
 *
 * A team's work is not identical to the company's standard questions —
 * HR turns this on per period, scoped to `managersCanAddQuestions`, for
 * exactly that gap. Gone the moment the period starts, same as HR's own
 * question list: `addManagerQuestion` refuses once the cycle has left DRAFT.
 */
export function ManagerQuestionButton({
  cycleId,
  onAdded,
}: {
  cycleId: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" className="size-3.5" />
        Add your own question
      </Button>

      {open && (
        <ManagerQuestionDialog
          cycleId={cycleId}
          onClose={() => setOpen(false)}
          onAdded={() => {
            setOpen(false);
            onAdded();
          }}
        />
      )}
    </>
  );
}

function ManagerQuestionDialog({
  cycleId,
  onClose,
  onAdded,
}: {
  cycleId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const periods = useCycleMutations();
  const toast = useToast();

  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<ReviewQuestionKind>("RATING");
  const [audience, setAudience] = useState<ReviewAudience>("MANAGER");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (prompt.trim().length < 5) {
      setError("Write the question out.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await periods.addManagerQuestion(cycleId, {
        prompt: prompt.trim(),
        kind,
        askedOf: [audience],
        required: true,
      });
      toast.push({
        title: "Question added",
        tone: "success",
        detail: "Asked only of your own team.",
      });
      onAdded();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not add that.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add your own question"
      description="On top of the standard questions, and asked only of your own team."
      size="sm"
      footer={
        <>
          <Button disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" loading={saving} onClick={() => void save()}>
            Add the question
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="The question"
          required
          {...(error ? { error } : {})}
        >
          <Textarea
            rows={2}
            value={prompt}
            disabled={saving}
            placeholder="How well did they handle the new client handover this half?"
            onChange={(event) => setPrompt(event.target.value)}
          />
        </Field>

        <Field label="How it is answered" required>
          <Select
            value={kind}
            disabled={saving}
            onChange={(event) =>
              setKind(event.target.value as ReviewQuestionKind)
            }
          >
            {KINDS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Who answers it" required>
          <Select
            value={audience}
            disabled={saving}
            onChange={(event) =>
              setAudience(event.target.value as ReviewAudience)
            }
          >
            {AUDIENCES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
