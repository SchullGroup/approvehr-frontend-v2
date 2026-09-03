"use client";

import { useState } from "react";
import { Copy, Pencil, Plus, Trash2, X } from "lucide-react";
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
import {
  useAppraisals,
  useCycleQuestions,
  useFramework,
  useFrameworkActions,
} from "@/lib/store/performance";
import { QUESTION_BANK } from "@/lib/performance/question-bank";

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
  { value: "CHOICE", label: "Pick from a list" },
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
 * ## Sections, subsections and where a question is filed
 *
 * "Filed under" is a subsection (a `Competency`) — optional, since the
 * existing cycle-wide shape (a question with no subsection, asked of
 * everyone) is still the default and still correct for a general question
 * like "what went well this period". Picking a subsection is how HR builds
 * the "Behavioural Competence → Communication, Teamwork" structure: create
 * the sections and subsections once here (they carry over to every future
 * cycle, framework-level), then file each question under the one it tests.
 *
 * ## CHOICE now has somewhere complete to live
 *
 * It used to be read here and never written — a half-built multiple-choice
 * question was worse than a shorter form. It is buildable now because it has
 * one: an options editor, and "Also accept a typed answer" for a respondent
 * who wants to say something the list didn't anticipate. The suggested
 * phrasings come from `QUESTION_BANK`, filtered by the chosen subsection —
 * a starting point to edit or ignore, never a requirement.
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
  const framework = useFramework();

  /** The question being changed, or `null` while the form is adding a new one. */
  const [editing, setEditing] = useState<ApiQuestion | null>(null);
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<ReviewQuestionKind>("TEXT");
  const [audience, setAudience] = useState<ReviewAudience | "ALL">("ALL");
  const [required, setRequired] = useState(true);
  const [competencyId, setCompetencyId] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [allowCustom, setAllowCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const startEdit = (question: ApiQuestion) => {
    setEditing(question);
    setPrompt(question.prompt);
    setKind(question.kind);
    setAudience(question.askedOf[0] ?? "ALL");
    setRequired(question.required);
    setCompetencyId(question.competencyId ?? "");
    setOptions(question.options.length > 0 ? question.options : ["", ""]);
    setAllowCustom(question.allowCustom);
    setError(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setPrompt("");
    setKind("TEXT");
    setAudience("ALL");
    setRequired(true);
    setCompetencyId("");
    setOptions(["", ""]);
    setAllowCustom(false);
    setError(null);
  };

  const save = async () => {
    if (prompt.trim().length < 5) {
      setError("Write the question out.");
      return;
    }
    const cleanOptions = options
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
    if (kind === "CHOICE" && cleanOptions.length < 2) {
      setError("A pick-from-a-list question needs at least two choices.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const askedOf = audience === "ALL" ? [] : [audience];
      const shared = {
        prompt: prompt.trim(),
        kind,
        askedOf,
        required,
        ...(kind === "CHOICE"
          ? { options: cleanOptions, allowCustom }
          : { options: [], allowCustom: false }),
        ...(competencyId ? { competencyId } : {}),
      };
      if (editing) {
        await onUpdate(editing.id, {
          ...shared,
          competencyId: competencyId || null,
        });
        cancelEdit();
      } else {
        await onAdd(shared);
        setPrompt("");
        setOptions(["", ""]);
        setAllowCustom(false);
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

  const competencyName = (id: string) =>
    framework.competencies.find((c) => c.id === id)?.name ?? null;

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
          onCopyFrom && (
            <CopyFromPeriod cycleId={cycleId} busy={saving} onCopy={copyFrom} />
          )
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
                    {question.competencyId && (
                      <Badge tone="neutral" size="sm">
                        {competencyName(question.competencyId) ?? "Filed"}
                      </Badge>
                    )}
                    {question.source === "MANAGER" && (
                      <Badge tone="neutral" size="sm">
                        Added by a manager
                      </Badge>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <IconButton
                    label={`Edit "${question.prompt}"`}
                    disabled={saving}
                    onClick={() => startEdit(question)}
                  >
                    <Pencil aria-hidden="true" />
                  </IconButton>
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

          <SubsectionPicker value={competencyId} onChange={setCompetencyId} />

          {kind === "CHOICE" && (
            <ChoiceEditor
              options={options}
              onChange={setOptions}
              allowCustom={allowCustom}
              onAllowCustomChange={setAllowCustom}
              competencyId={competencyId}
            />
          )}

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
 * Which subsection this question is filed under, plus creating one on the
 * spot.
 *
 * A subsection is a `Competency` and a section is what it's filed under —
 * both framework-level, shared across every cycle. Quick-creating one here
 * rather than sending HR to a separate screen is deliberate: the moment a
 * question needs a subsection that doesn't exist yet is the moment to make
 * it, not three clicks later.
 */
function SubsectionPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const framework = useFramework();
  const actions = useFrameworkActions();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSectionId, setNewSectionId] = useState("");
  const [newSectionName, setNewSectionName] = useState("");
  const [creatingSection, setCreatingSection] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const addSubsection = async () => {
    if (newName.trim().length < 2) {
      setAddError("Give it a name.");
      return;
    }
    setAddError(null);
    setBusy(true);
    try {
      let sectionId = newSectionId;
      if (creatingSection) {
        if (newSectionName.trim().length < 2) {
          setAddError("Give the section a name too.");
          setBusy(false);
          return;
        }
        const section = await actions.createSection({
          name: newSectionName.trim(),
        });
        sectionId = section.id;
      }
      const competency = await actions.createCompetency({
        name: newName.trim(),
        scaleMax: 5,
        ...(sectionId ? { sectionId } : {}),
      });
      onChange(competency.id);
      setAdding(false);
      setNewName("");
      setNewSectionId("");
      setNewSectionName("");
      setCreatingSection(false);
    } catch (caught) {
      setAddError(
        caught instanceof ApiError ? caught.message : "Could not add that.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (adding) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-line bg-canvas p-3">
        <div className="flex items-center justify-between">
          <span className="text-body-sm font-medium text-ink">
            New subsection
          </span>
          <IconButton label="Cancel" onClick={() => setAdding(false)}>
            <X aria-hidden="true" />
          </IconButton>
        </div>
        <Field
          label="Subsection name"
          {...(addError ? { error: addError } : {})}
        >
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Communication"
          />
        </Field>
        {creatingSection ? (
          <Field label="New section name">
            <Input
              value={newSectionName}
              onChange={(event) => setNewSectionName(event.target.value)}
              placeholder="Behavioural competency"
            />
          </Field>
        ) : (
          <Field label="Section it belongs to">
            <Select
              value={newSectionId}
              onChange={(event) => {
                if (event.target.value === "__new__") {
                  setCreatingSection(true);
                  setNewSectionId("");
                } else {
                  setNewSectionId(event.target.value);
                }
              }}
            >
              <option value="">No section (unfiled)</option>
              {framework.groups
                .filter((g) => g.sectionId)
                .map((g) => (
                  <option key={g.sectionId} value={g.sectionId ?? ""}>
                    {g.sectionName}
                  </option>
                ))}
              <option value="__new__">+ New section&hellip;</option>
            </Select>
          </Field>
        )}
        <Button
          variant="secondary"
          size="sm"
          loading={busy}
          onClick={() => void addSubsection()}
        >
          Add subsection
        </Button>
      </div>
    );
  }

  return (
    <Field label="Filed under">
      <div className="flex gap-2">
        <Select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="flex-1"
        >
          <option value="">Not filed under a subsection</option>
          {framework.groups.map((group) => (
            <optgroup key={group.sectionName} label={group.sectionName}>
              {group.competencies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" className="size-3.5" />
          New
        </Button>
      </div>
    </Field>
  );
}

/**
 * The choices for a CHOICE question, and whether a typed answer is also
 * accepted.
 *
 * Suggested phrasings from `QUESTION_BANK` are offered as one-click adds —
 * filtered to the chosen subsection when there is one, since a suggestion
 * for "Communication" is noise on a question filed under "Teamwork". They
 * are a starting point: every one is editable and removable like a
 * hand-typed choice, because a bank of phrasing is a convenience, not a
 * fixed vocabulary.
 */
function ChoiceEditor({
  options,
  onChange,
  allowCustom,
  onAllowCustomChange,
  competencyId,
}: {
  options: string[];
  onChange: (options: string[]) => void;
  allowCustom: boolean;
  onAllowCustomChange: (value: boolean) => void;
  competencyId: string;
}) {
  const framework = useFramework();
  const competencyName = framework.competencies.find(
    (c) => c.id === competencyId,
  )?.name;
  const suggestions = (
    competencyName
      ? (QUESTION_BANK[competencyName] ?? [])
      : Object.values(QUESTION_BANK).flat()
  ).filter((phrase) => !options.includes(phrase));

  const setOption = (index: number, value: string) => {
    const next = [...options];
    next[index] = value;
    onChange(next);
  };

  const removeOption = (index: number) => {
    onChange(options.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-canvas p-3">
      <span className="text-body-sm font-medium text-ink">Choices</span>
      {options.map((option, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            value={option}
            onChange={(event) => setOption(index, event.target.value)}
            placeholder={`Choice ${index + 1}`}
          />
          {options.length > 2 && (
            <IconButton
              label={`Remove choice ${index + 1}`}
              onClick={() => removeOption(index)}
            >
              <X aria-hidden="true" />
            </IconButton>
          )}
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => onChange([...options, ""])}
      >
        <Plus aria-hidden="true" className="size-3.5" />
        Add a choice
      </Button>

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-line pt-3">
          <span className="text-meta text-muted">Suggested phrasing (click to add)</span>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.slice(0, 8).map((phrase) => (
              <button
                key={phrase}
                type="button"
                onClick={() =>
                  onChange([...options.filter((o) => o.trim()), phrase])
                }
                className="rounded-full border border-line px-2.5 py-1 text-meta text-body hover:bg-canvas-soft"
              >
                {phrase}
              </button>
            ))}
          </div>
        </div>
      )}

      <Checkbox
        label="Also let them type their own answer, not just pick from the list"
        checked={allowCustom}
        onChange={(event) => onAllowCustomChange(event.target.checked)}
      />
    </div>
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
          own: editing them here changes nothing about the period they came
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
