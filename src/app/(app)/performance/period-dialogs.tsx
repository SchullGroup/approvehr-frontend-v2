"use client";

import { useMemo, useState } from "react";
import { Copy, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { weightLabel } from "@/lib/api/performance";
import {
  Badge,
  Button,
  Checkbox,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
  Sortable,
  SortableHandle,
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
  useSections,
} from "@/lib/store/performance";
import { NoticeLine } from "@/components/portal/notice-line";
import { QUESTION_BANK } from "@/lib/performance/question-bank";

/** Who a question is put to. `REPORT` exists in the enum and nothing reaches it. */
const AUDIENCES: { value: ReviewAudience; label: string }[] = [
  { value: "SELF", label: "The person themselves" },
  { value: "MANAGER", label: "Their manager" },
  { value: "PEER", label: "Their colleagues (anonymous)" },
];

/**
 * Keep a chosen set in the order above rather than in click order.
 *
 * The list row renders `askedOf` joined with commas, so without this the same
 * two audiences read "Manager, Self" or "Self, Manager" depending on which box
 * somebody happened to tick first — two labels for one fact.
 *
 * Anything the picker does not offer (`REPORT` today) sorts last and is
 * **kept**. Dropping a value the form cannot display is the defect this whole
 * change is about, one level down.
 */
const audienceRank = new Map(AUDIENCES.map((a, index) => [a.value, index]));
const inAudienceOrder = (chosen: readonly ReviewAudience[]): ReviewAudience[] =>
  [...chosen].sort(
    (a, b) =>
      (audienceRank.get(a) ?? AUDIENCES.length) -
      (audienceRank.get(b) ?? AUDIENCES.length),
  );

const KINDS: { value: ReviewQuestionKind; label: string }[] = [
  { value: "TEXT", label: "In their own words" },
  { value: "RATING", label: "A rating on the company scale" },
  { value: "BOOLEAN", label: "Yes or no" },
  { value: "CHOICE", label: "Pick from a list" },
  { value: "FILE", label: "A file — a report, a dashboard, a screenshot" },
];

const AUDIENCE_LABEL: Record<ReviewAudience, string> = {
  SELF: "Self",
  MANAGER: "Manager",
  PEER: "Colleagues",
  REPORT: "Reports",
};

const KIND_LABEL: Record<ReviewQuestionKind, string> = {
  TEXT: "Own words",
  RATING: "Rating",
  BOOLEAN: "Yes or no",
  CHOICE: "Pick one",
  FILE: "A file",
};

/**
 * Why an evidence question cannot be asked of colleagues.
 *
 * Returns null when the set is fine, and the API's own rule otherwise, checked
 * here so the refusal arrives while somebody is still writing the question
 * rather than after they press save.
 *
 * The rule itself: a peer answer carries **no respondent** by design, and a
 * file carries its author in its metadata and usually in its name. Anonymity a
 * file quietly breaks is worse than none, because people answered believing
 * it. And "everyone on the form" includes colleagues, so an evidence question
 * has to say who it is for.
 */
function evidenceAudienceRefusal(
  kind: ReviewQuestionKind,
  narrowed: boolean,
  audiences: readonly ReviewAudience[],
): string | null {
  if (kind !== "FILE") return null;
  if (!narrowed) {
    return (
      "Say who is asked for a file. Left as everyone it would include " +
      "colleagues, and peer feedback is anonymous."
    );
  }
  if (audiences.includes("PEER")) {
    return (
      "A file cannot be asked of colleagues. Peer feedback is anonymous, and " +
      "a document carries its author's name in ways we cannot strip out."
    );
  }
  return null;
}

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
  onReorder,
  onCopyFrom,
}: {
  cycleId: string;
  periodName: string;
  onClose: () => void;
  onAdd: (body: CreateQuestionBody) => Promise<void>;
  onUpdate: (id: string, body: UpdateQuestionBody) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  /**
   * Rearrange the form. Absent once the period is published, where the API
   * refuses it — its form is a record by then. Every other stage may reorder,
   * so this is not the same gate as `onCopyFrom`.
   */
  onReorder?: (ids: string[]) => Promise<void>;
  /** Absent on a period that has started — copying is refused there anyway. */
  onCopyFrom?: (sourceCycleId: string) => Promise<{ copied: number }>;
}) {
  const { questions, loading, reload } = useCycleQuestions(cycleId);
  const framework = useFramework();

  /**
   * The arrangement somebody has just dragged, held until the server's own
   * order says the same thing.
   *
   * Without it the row snaps back to where it started for as long as the
   * request takes, which reads as the drag having failed — and then lands in
   * the new place a moment later, which reads as a second, unasked-for move.
   *
   * It is reconciled against the live list on every render rather than cleared
   * on success, so it needs no timing: a question added meanwhile appends
   * (which is where the API puts it too, at `last.order + 1`) and a removed one
   * drops out. On a refusal it is thrown away and the server's order stands.
   */
  const [dragged, setDragged] = useState<string[] | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  const ordered = useMemo(() => {
    if (!dragged) return questions;
    const byId = new Map(questions.map((q) => [q.id, q]));
    const known = new Set(dragged);
    return [
      ...dragged.flatMap((id) => byId.get(id) ?? []),
      ...questions.filter((q) => !known.has(q.id)),
    ];
  }, [questions, dragged]);

  const reorder = async (ids: string[]) => {
    if (!onReorder) return;
    const before = dragged;
    setDragged(ids);
    setOrderError(null);
    try {
      await onReorder(ids);
      reload();
    } catch (caught) {
      /* Put it back where it was. A list left in an order the server rejected
         is a screen claiming a change that did not happen. */
      setDragged(before);
      setOrderError(
        caught instanceof ApiError
          ? caught.message
          : "That new order was not saved. Try again.",
      );
    }
  };

  /** The question being changed, or `null` while the form is adding a new one. */
  const [editing, setEditing] = useState<ApiQuestion | null>(null);
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<ReviewQuestionKind>("TEXT");
  /**
   * Whether the question is narrowed to particular audiences.
   *
   * Separate from `audiences` because an empty list is otherwise ambiguous:
   * "everybody" and "narrowed, nothing ticked yet" are opposite intentions and
   * only one of them is a question worth saving.
   */
  const [narrowed, setNarrowed] = useState(false);
  const [audiences, setAudiences] = useState<ReviewAudience[]>([]);
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
    /* The whole list, not `[0]`. Reading only the first is what let an edit
       silently narrow a question asked of two people to one. */
    setNarrowed(question.askedOf.length > 0);
    setAudiences(inAudienceOrder(question.askedOf));
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
    setNarrowed(false);
    setAudiences([]);
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
    if (narrowed && audiences.length === 0) {
      setError(
        "Choose who is asked, or set it back to everyone on the form. " +
          "A question nobody is asked is never answered.",
      );
      return;
    }
    const evidenceRefusal = evidenceAudienceRefusal(kind, narrowed, audiences);
    if (evidenceRefusal) {
      setError(evidenceRefusal);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const askedOf = narrowed ? inAudienceOrder(audiences) : [];
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
          <>
            {orderError && (
              <p className="text-body-sm text-danger-text">{orderError}</p>
            )}
            {onReorder ? (
              <Sortable
                items={ordered}
                keyOf={(question) => question.id}
                labelOf={(question) => question.prompt}
                onReorder={(ids) => void reorder(ids)}
                gap={8}
              >
                {(question, args) => (
                  <div
                    className={cn(
                      "flex flex-wrap items-start gap-3 rounded-md border p-3",
                      editing?.id === question.id
                        ? "border-accent-line bg-accent-soft"
                        : "border-line",
                    )}
                  >
                    <SortableHandle handleProps={args.handleProps} />
                    <QuestionSummary
                      question={question}
                      competencyName={competencyName}
                    />
                    <QuestionRowActions
                      question={question}
                      disabled={saving}
                      onEdit={() => startEdit(question)}
                      onRemove={() => void remove(question.id)}
                    />
                  </div>
                )}
              </Sortable>
            ) : (
              <ul className="flex flex-col gap-2">
                {ordered.map((question) => (
                  <li
                    key={question.id}
                    className={cn(
                      "flex flex-wrap items-start justify-between gap-3 rounded-md border p-3",
                      editing?.id === question.id
                        ? "border-accent-line bg-accent-soft"
                        : "border-line",
                    )}
                  >
                    <QuestionSummary
                      question={question}
                      competencyName={competencyName}
                    />
                    <QuestionRowActions
                      question={question}
                      disabled={saving}
                      onEdit={() => startEdit(question)}
                      onRemove={() => void remove(question.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
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
                value={narrowed ? "SOME" : "ALL"}
                onChange={(event) => setNarrowed(event.target.value === "SOME")}
              >
                <option value="ALL">Everyone on the form</option>
                <option value="SOME">Only certain people</option>
              </Select>
            </Field>
          </div>

          {narrowed && (
            <AudiencePicker value={audiences} onChange={setAudiences} />
          )}

          {/* The rule while somebody is choosing, not after they save.
              `evidenceAudienceRefusal` is the same function `save` calls, so
              the note and the refusal cannot come to say different things. */}
          {evidenceAudienceRefusal(kind, narrowed, audiences) && (
            <NoticeLine tone="warning">
              <span>{evidenceAudienceRefusal(kind, narrowed, audiences)}</span>
            </NoticeLine>
          )}

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
  const { sections } = useSections();
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

  /* What each section is worth, so the filing decision is made with the one
     fact that gives it meaning. The feedback's complaint is that the sections
     configured in Settings do not reach appraisal creation: they do reach it,
     as these headings, and they used to reach it stripped of their weight. */
  const weightOf = new Map(
    sections.map((section) => [section.name, section.weightBp]),
  );
  const sectionLabel = (name: string) => {
    const bp = weightOf.get(name);
    if (bp === undefined) return name;
    /* Null is "not weighted", never 0%. A section outside `ScoreComponent` has
       its ratings recorded and excluded, and saying 0% would read as a weight
       somebody chose. */
    return bp === null
      ? `${name} — not weighted`
      : `${name} — ${weightLabel(bp)} of the mark`;
  };

  const chosen = framework.competencies.find(
    (competency) => competency.id === value,
  );
  const chosenSection = chosen?.sectionName ?? null;
  const chosenWeight = chosenSection ? weightOf.get(chosenSection) : undefined;

  return (
    <Field
      label="Filed under"
      help={
        /* Says what the choice does to the score, at the moment it is made.
           An unfiled question is answerable and unscored, which is a real
           thing to want for a free-text prompt and a surprise for a rating. */
        value === ""
          ? "Unfiled questions are asked and answered, and count towards no part of the mark."
          : chosenWeight === null
            ? `That section is not weighted, so answers to this count towards no part of the mark.`
            : chosenWeight !== undefined
              ? `Answers to this count towards ${chosenSection}, which is ${weightLabel(chosenWeight)} of the mark.`
              : undefined
      }
    >
      <div className="flex gap-2">
        <Select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="flex-1"
        >
          <option value="">Not filed under a subsection</option>
          {framework.groups.map((group) => (
            <optgroup
              key={group.sectionName}
              label={sectionLabel(group.sectionName)}
            >
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
/**
 * One question as the list shows it: the prompt, and its settings as badges.
 *
 * Extracted because the list renders twice — dragging when the period is still
 * open, plain when it is published and the API refuses a rearrangement. Two
 * copies of sixty lines is how one of them quietly stops showing a badge.
 */
function QuestionSummary({
  question,
  competencyName,
}: {
  question: ApiQuestion;
  competencyName: (id: string) => string | null;
}) {
  return (
    <span className="min-w-0 flex-1">
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
            : question.askedOf.map((who) => AUDIENCE_LABEL[who]).join(", ")}
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
  );
}

/** Edit and remove, labelled with the prompt so the two rows never sound alike. */
function QuestionRowActions({
  question,
  disabled,
  onEdit,
  onRemove,
}: {
  question: ApiQuestion;
  disabled: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <span className="flex shrink-0 gap-1">
      <IconButton
        label={`Edit "${question.prompt}"`}
        disabled={disabled}
        onClick={onEdit}
      >
        <Pencil aria-hidden="true" />
      </IconButton>
      <IconButton
        label={`Remove "${question.prompt}"`}
        disabled={disabled}
        onClick={onRemove}
      >
        <Trash2 aria-hidden="true" />
      </IconButton>
    </span>
  );
}

/**
 * Which audiences a question is put to, when it is not put to everybody.
 *
 * Checkboxes rather than a second dropdown because the answer is a set: a
 * question can be asked of the person and their manager but not their
 * colleagues, and until this existed the form could only ever write one
 * audience or none. A question created through the API with two would open
 * here showing the first and save back having dropped the second.
 *
 * A value the list does not offer is left alone by the toggle rather than
 * filtered out, so `REPORT` — in the enum, reached by nothing — survives an
 * edit instead of being quietly discarded by a screen that cannot show it.
 */
function AudiencePicker({
  value,
  onChange,
}: {
  value: ReviewAudience[];
  onChange: (next: ReviewAudience[]) => void;
}) {
  const toggle = (who: ReviewAudience, on: boolean) => {
    onChange(
      on ? inAudienceOrder([...value, who]) : value.filter((v) => v !== who),
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-canvas p-3">
      <span className="text-body-sm font-medium text-ink">
        Who is asked this one
      </span>
      {AUDIENCES.map((option) => (
        <Checkbox
          key={option.value}
          label={option.label}
          checked={value.includes(option.value)}
          onChange={(event) => toggle(option.value, event.target.checked)}
        />
      ))}
      <span className="text-meta text-muted">
        A colleague only sees this if somebody has asked them for a peer review
        on this period. Nobody is asked one by default.
      </span>
    </div>
  );
}

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
          <span className="text-meta text-muted">
            Suggested phrasing (click to add)
          </span>
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
