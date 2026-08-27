"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
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
  ApiQuestion,
  CreateQuestionBody,
  ReviewAudience,
  ReviewQuestionKind,
  UpdateQuestionBody,
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
  onUpdate,
  onRemove,
}: {
  cycleId: string;
  periodName: string;
  onClose: () => void;
  onAdd: (body: CreateQuestionBody) => Promise<void>;
  onUpdate: (id: string, body: UpdateQuestionBody) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const { questions, loading, reload } = useCycleQuestions(cycleId);

  /** The question being changed, or `null` while the form is adding a new one. */
  const [editing, setEditing] = useState<ApiQuestion | null>(null);
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<ReviewQuestionKind>("TEXT");
  const [audience, setAudience] = useState<ReviewAudience | "ALL">("ALL");
  const [required, setRequired] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const startEdit = (question: ApiQuestion) => {
    setEditing(question);
    setPrompt(question.prompt);
    setKind(question.kind);
    setAudience(question.askedOf[0] ?? "ALL");
    setRequired(question.required);
    setError(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setPrompt("");
    setKind("TEXT");
    setAudience("ALL");
    setRequired(true);
    setError(null);
  };

  const save = async () => {
    if (prompt.trim().length < 5) {
      setError("Write the question out.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const askedOf = audience === "ALL" ? [] : [audience];
      if (editing) {
        await onUpdate(editing.id, {
          prompt: prompt.trim(),
          kind,
          askedOf,
          required,
        });
        cancelEdit();
      } else {
        await onAdd({ prompt: prompt.trim(), kind, askedOf, required });
        setPrompt("");
      }
      reload();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : editing
            ? "Could not save that change."
            : "Could not add that question.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await onRemove(id);
      if (editing?.id === id) cancelEdit();
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
        ) : questions.length === 0 ? null : (
          <ul className="flex flex-col gap-2">
            {questions.map((question) => (
              <li
                key={question.id}
                className={cn(
                  "flex flex-wrap items-start justify-between gap-3 rounded-md border p-3",
                  editing?.id === question.id
                    ? "border-accent-line bg-accent-soft"
                    : "border-line",
                )}
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
                <span className="flex shrink-0 gap-1">
                  {/* A multiple-choice question is read here and never written by
                      this form — see the file's own header — so editing it here
                      would silently coerce it to a kind with no choices. */}
                  {question.kind !== "CHOICE" && (
                    <IconButton
                      label={`Edit "${question.prompt}"`}
                      disabled={saving}
                      onClick={() => startEdit(question)}
                    >
                      <Pencil aria-hidden="true" />
                    </IconButton>
                  )}
                  <IconButton
                    label={`Remove "${question.prompt}"`}
                    disabled={saving}
                    onClick={() => void remove(question.id)}
                  >
                    <Trash2 aria-hidden="true" />
                  </IconButton>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-4 border-t border-line pt-5">
          <Field
            label={editing ? "Edit the question" : "Add a question"}
            required
            {...(error ? { error } : {})}
          >
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

          <div className="flex gap-2">
            <Button variant="accent" loading={saving} onClick={() => void save()}>
              {editing ? "Save changes" : "Add question"}
            </Button>
            {editing && (
              <Button variant="ghost" disabled={saving} onClick={cancelEdit}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
