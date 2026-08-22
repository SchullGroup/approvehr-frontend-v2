"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
  Spinner,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type {
  CreateQuestionBody,
  ReviewAudience,
  ReviewQuestionKind,
} from "@/lib/api/performance";
import { useCycleQuestions } from "@/lib/store/performance";

/** Who a question is put to. `REPORT` exists in the enum and nothing reaches it. */
const AUDIENCES: { value: ReviewAudience; label: string }[] = [
  { value: "SELF", label: "The person themselves" },
  { value: "MANAGER", label: "Their manager" },
  { value: "PEER", label: "Their colleagues (anonymous)" },
];

const KINDS: { value: ReviewQuestionKind; label: string }[] = [
  { value: "TEXT", label: "In their own words" },
  { value: "RATING", label: "A mark out of five" },
  { value: "BOOLEAN", label: "Yes or no" },
];

const AUDIENCE_LABEL: Record<ReviewAudience, string> = {
  SELF: "Self",
  MANAGER: "Manager",
  PEER: "Colleagues",
  REPORT: "Reports",
};

const KIND_LABEL: Record<ReviewQuestionKind, string> = {
  TEXT: "Own words",
  RATING: "Mark out of 5",
  BOOLEAN: "Yes or no",
  CHOICE: "Pick one",
};

/**
 * The questions on one appraisal period.
 *
 * Only the three question types that need no extra setup are offered here.
 * A multiple-choice question needs its choices, and a period that cannot be
 * started because a half-built question is sitting on it is worse than a
 * shorter form — so `CHOICE` is read (any that exist are listed) but not
 * written. It is named in `KIND_LABEL` for that reason.
 */
export function QuestionsDialog({
  cycleId,
  periodName,
  onClose,
  onAdd,
  onRemove,
}: {
  cycleId: string;
  periodName: string;
  onClose: () => void;
  onAdd: (body: CreateQuestionBody) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const { questions, loading, reload } = useCycleQuestions(cycleId);

  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<ReviewQuestionKind>("TEXT");
  const [audience, setAudience] = useState<ReviewAudience | "ALL">("ALL");
  const [required, setRequired] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (prompt.trim().length < 5) {
      setError("Write the question out.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const body: CreateQuestionBody = { prompt: prompt.trim(), kind, required };
      if (audience !== "ALL") body.askedOf = [audience];
      await onAdd(body);
      setPrompt("");
      reload();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not add that question.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await onRemove(id);
      reload();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not remove that one.",
      );
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Questions"
      description={periodName}
      size="lg"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="flex flex-col gap-5">
        {loading ? (
          <span className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading the form
          </span>
        ) : questions.length === 0 ? (
          <p className="text-body-sm text-body">
            No questions yet. A form with none asks nobody anything.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {questions.map((question) => (
              <li
                key={question.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-line p-3"
              >
                <span className="min-w-0">
                  <span className="block text-body-sm font-medium text-ink">
                    {question.prompt}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Badge tone="neutral" size="sm">
                      {KIND_LABEL[question.kind]}
                    </Badge>
                    <Badge tone="neutral" size="sm">
                      {question.askedOf.length === 0
                        ? "Everyone"
                        : question.askedOf
                            .map((who) => AUDIENCE_LABEL[who])
                            .join(", ")}
                    </Badge>
                    {question.required && (
                      <Badge tone="accent" size="sm">
                        Must be answered
                      </Badge>
                    )}
                  </span>
                </span>
                <IconButton
                  label={`Remove "${question.prompt}"`}
                  onClick={() => void remove(question.id)}
                >
                  <Trash2 aria-hidden="true" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-4 border-t border-line pt-5">
          <Field label="Add a question" required {...(error ? { error } : {})}>
            <Input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="What went well for you this period?"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="How they answer">
              <Select
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as ReviewQuestionKind)
                }
              >
                {KINDS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Who is asked">
              <Select
                value={audience}
                onChange={(event) =>
                  setAudience(event.target.value as ReviewAudience | "ALL")
                }
              >
                <option value="ALL">Everyone on the form</option>
                {AUDIENCES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Checkbox
            label="It must be answered before the form can be sent"
            checked={required}
            onChange={(event) => setRequired(event.target.checked)}
          />

          <div>
            <Button variant="accent" loading={saving} onClick={() => void add()}>
              Add question
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
