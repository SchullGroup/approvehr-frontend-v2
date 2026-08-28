"use client";

import { useState } from "react";
import { Copy, Pencil, Trash2 } from "lucide-react";
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
import { useAppraisals, useCycleQuestions } from "@/lib/store/performance";

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
  onCopyFrom,
}: {
  cycleId: string;
  periodName: string;
  onClose: () => void;
  onAdd: (body: CreateQuestionBody) => Promise<void>;
  onUpdate: (id: string, body: UpdateQuestionBody) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  /** Absent on a period that has started — copying is refused there anyway. */
  onCopyFrom?: (sourceCycleId: string) => Promise<{ copied: number }>;
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
        caught instanceof ApiError
          ? caught.message
          : "Could not remove that one.",
      );
    }
  };

  const copyFrom = async (sourceCycleId: string) => {
    if (!onCopyFrom) return;
    setError(null);
    setSaving(true);
    try {
      await onCopyFrom(sourceCycleId);
      reload();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not copy those questions.",
      );
    } finally {
      setSaving(false);
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
          /* The blank page this whole feature exists for. Offered **only** while
             the form is empty: the API refuses a copy onto a period that already
             has questions, and a button that returns "that is refused" was a
             design failure two clicks earlier.

             Nothing is shared — the questions arrive as this period's own rows,
             so editing one here does not touch the period it came from. */
          onCopyFrom && <CopyFromPeriod cycleId={cycleId} busy={saving} onCopy={copyFrom} />
        ) : (
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
            <Button
              variant="accent"
              loading={saving}
              onClick={() => void save()}
            >
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

/**
 * "Start from a previous period."
 *
 * The single biggest reason an appraisal period sits unstarted: somebody has to
 * write eight questions from a blank page, every half, and the questions barely
 * change between halves. This is one click and a picker.
 *
 * ## Only periods that have questions are offered
 *
 * A period with an empty form is not a template, and offering one produces a
 * copy of nothing followed by the same blank page. The list is filtered on
 * `questionCount` rather than the API refusing it afterwards, because the
 * refusal would arrive after the choice.
 *
 * ## And the period being edited is never in its own list
 *
 * Copying a period onto itself is refused by the API and would be a confusing
 * thing to offer even if it were not.
 */
function CopyFromPeriod({
  cycleId,
  busy,
  onCopy,
}: {
  cycleId: string;
  busy: boolean;
  onCopy: (sourceCycleId: string) => Promise<void>;
}) {
  const appraisals = useAppraisals();
  const [chosen, setChosen] = useState("");

  const sources = appraisals.cycles.filter(
    (cycle) => cycle.id !== cycleId && cycle.questionCount > 0,
  );

  if (appraisals.loading) {
    return (
      <span className="flex items-center gap-2 text-body-sm text-muted">
        <Spinner size="sm" />
        Looking for a period to copy from
      </span>
    );
  }

  /* Absent, not disabled. A company running its first period has nothing to
     copy from and does not need to be told about a feature it cannot use. */
  if (sources.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-canvas p-3">
      <span>
        <span className="block text-body-sm font-medium text-ink">
          Start from a previous period
        </span>
        <span className="mt-0.5 block text-meta text-muted">
          Copies its questions onto this one. They become this period&rsquo;s
          own — editing them here changes nothing about the period they came
          from.
        </span>
      </span>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Copy from">
          <Select
            value={chosen}
            disabled={busy}
            onChange={(event) => setChosen(event.target.value)}
          >
            <option value="">Pick a period</option>
            {sources.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.name} · {cycle.questionCount} question
                {cycle.questionCount === 1 ? "" : "s"}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          variant="secondary"
          loading={busy}
          disabled={busy || !chosen}
          onClick={() => void onCopy(chosen)}
        >
          <Copy aria-hidden="true" className="size-3.5" />
          Copy them over
        </Button>
      </div>
    </div>
  );
}
