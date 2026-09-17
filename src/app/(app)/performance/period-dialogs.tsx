"use client";

import { useMemo, useState } from "react";
import { Copy, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { weightLabel } from "@/lib/api/performance";
import {
  Badge,
  Button,
  Callout,
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
import { actionMessage } from "@/lib/use-action";
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
  open,
  cycleId,
  periodName,
  onClose,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
  onCopyFrom,
  onAddStandard,
}: {
  open: boolean;
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
  /**
   * The testing doc's six standard self/manager questions — Key
   * Achievements, Key Challenges, Reason for Rating; Achievements Observed,
   * Areas for Improvement, Overall Assessment — added in one call. Absent
   * once the period has started, same reason as `onCopyFrom`: the API
   * refuses it there, so the button is not offered rather than offered and
   * refused.
   */
  onAddStandard?: () => Promise<void>;
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
  /**
   * The section the subsection sits in.
   *
   * Held rather than derived from `competencyId`, because the two selects have
   * to survive the state in between: a section chosen with no subsection
   * picked yet. Deriving it would snap the section back to blank the instant
   * somebody chose one, which is the control undoing the click that set it.
   *
   * It is **not** saved. `CreateQuestionBody` carries `competencyId` and
   * nothing else — a question is filed under a subsection, and its section
   * follows from that. So a section with no subsection files the question
   * under nothing, and `FiledUnderPicker` says so at the moment it happens
   * rather than leaving somebody to find out from a mark.
   */
  const [sectionId, setSectionId] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [allowCustom, setAllowCustom] = useState(false);
  /**
   * Field errors and form errors, kept apart.
   *
   * One string carried both and was always rendered on **the question**, so
   * choosing "A file" without saying who is asked marked the question text
   * `aria-invalid` and printed the audience refusal under it — while the
   * same sentence was already showing, correctly, under the audience picker.
   * One refusal, two places, one of them accusing the wrong field.
   */
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const fail = (field: string, message: string) => {
    setErrors({ [field]: message });
    setFormError(null);
  };
  const clearErrors = () => {
    setErrors({});
    setFormError(null);
  };
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
    setSectionId(
      framework.competencies.find(
        (competency) => competency.id === question.competencyId,
      )?.sectionId ?? "",
    );
    setOptions(question.options.length > 0 ? question.options : ["", ""]);
    setAllowCustom(question.allowCustom);
    clearErrors();
  };

  const cancelEdit = () => {
    setEditing(null);
    setPrompt("");
    setKind("TEXT");
    setNarrowed(false);
    setAudiences([]);
    setRequired(true);
    setCompetencyId("");
    setSectionId("");
    setOptions(["", ""]);
    setAllowCustom(false);
    clearErrors();
  };

  const save = async () => {
    if (prompt.trim().length < 5) {
      fail("prompt", "Write the question out.");
      return;
    }
    const cleanOptions = options
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
    if (kind === "CHOICE" && cleanOptions.length < 2) {
      fail(
        "options",
        "A pick-from-a-list question needs at least two choices.",
      );
      return;
    }
    if (narrowed && audiences.length === 0) {
      fail(
        "audience",
        "Choose who is asked, or set it back to everyone on the form. " +
          "A question nobody is asked is never answered.",
      );
      return;
    }
    /* Refuses the save and says nothing new: the same sentence is already on
       screen under the audience picker, from the same function, and has been
       since the kind was set to a file. Repeating it on the question text
       would be the defect this split is about. */
    if (evidenceAudienceRefusal(kind, narrowed, audiences)) return;
    clearErrors();
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
      /* The whole form, so above the form rather than under the first field. */
      setFormError(actionMessage(caught, "the question"));
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
      setFormError(actionMessage(caught, "that question"));
    }
  };

  const copyFrom = async (sourceCycleId: string) => {
    if (!onCopyFrom) return;
    clearErrors();
    setSaving(true);
    try {
      await onCopyFrom(sourceCycleId);
      reload();
    } catch (caught) {
      setFormError(actionMessage(caught, "those questions"));
    } finally {
      setSaving(false);
    }
  };

  const addStandard = async () => {
    if (!onAddStandard) return;
    clearErrors();
    setSaving(true);
    try {
      await onAddStandard();
      reload();
    } catch (caught) {
      setFormError(actionMessage(caught, "the standard questions"));
    } finally {
      setSaving(false);
    }
  };

  const competencyName = (id: string) =>
    framework.competencies.find((c) => c.id === id)?.name ?? null;

  return (
    <Modal
      open={open}
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

        {onAddStandard && !editing && (
          /* The testing doc's six, offered whether or not HR has already
             typed questions of their own — unlike `onCopyFrom`, this is not
             confined to a blank form. Pressing it twice is refused by the
             API in words naming which of the six are already there, rather
             than hidden pre-emptively, so this needs no "already added"
             tracking of its own. */
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            loading={saving}
            onClick={() => void addStandard()}
          >
            Add the standard self/manager questions
          </Button>
        )}

        <div className="flex flex-col gap-4 border-t border-line pt-5">
          {/* Belongs to the whole form, so it sits above it rather than
              accusing the first field. */}
          {formError && (
            <Callout tone="danger" title="That did not go through">
              {formError}
            </Callout>
          )}

          {/* Where it goes, before what it says.

              This used to sit below the question, the answer kind and the
              audience, which put the one choice that decides whether an answer
              counts towards anything last — after the decision it qualifies.
              Leading with it also makes the section an explicit choice rather
              than something implied by which group an option happened to sit
              in. */}
          <FiledUnderPicker
            sectionId={sectionId}
            competencyId={competencyId}
            onChange={(next) => {
              setSectionId(next.sectionId);
              setCompetencyId(next.competencyId);
            }}
          />

          <Field
            label={editing ? "Edit the question" : "Add a question"}
            required
            {...(errors["prompt"] ? { error: errors["prompt"] } : {})}
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
            <>
              <AudiencePicker value={audiences} onChange={setAudiences} />
              {/* Under the control it is about. It used to appear under the
                  question text, which is a different field entirely. */}
              {errors["audience"] && (
                <p className="text-body-sm text-danger-text">
                  {errors["audience"]}
                </p>
              )}
            </>
          )}

          {/* The rule while somebody is choosing, not after they save.
              `evidenceAudienceRefusal` is the same function `save` calls, so
              the note and the refusal cannot come to say different things. */}
          {evidenceAudienceRefusal(kind, narrowed, audiences) && (
            <NoticeLine tone="warning">
              <span>{evidenceAudienceRefusal(kind, narrowed, audiences)}</span>
            </NoticeLine>
          )}

          {kind === "CHOICE" && (
            <>
              <ChoiceEditor
                options={options}
                onChange={setOptions}
                allowCustom={allowCustom}
                onAllowCustomChange={setAllowCustom}
                competencyId={competencyId}
              />
              {errors["options"] && (
                <p className="text-body-sm text-danger-text">
                  {errors["options"]}
                </p>
              )}
            </>
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
 * Where a question is filed: its section, then its subsection.
 *
 * ## Two controls, and only one of them is saved
 *
 * `CreateQuestionBody` carries `competencyId` and nothing else. A question is
 * filed under a **subsection**, and its section is whatever that subsection
 * sits in — so the control above is a narrowing of the list below it, not a
 * second field that gets written.
 *
 * Which means a section chosen with no subsection picked files the question
 * under **nothing**. That is a real intermediate state while somebody is
 * choosing, and it is also a saveable mistake, so it is named on screen the
 * moment it exists rather than left to be discovered when a mark comes out
 * lower than anybody expected.
 *
 * This was one control: a single select with the sections as its optgroup
 * headings. That made the section something you inherited from whichever
 * option you happened to land on rather than something you chose, and it put
 * the whole framework in one list on a company with four sections and thirty
 * subsections under them.
 *
 * ## The options come from the framework, not only from the sections list
 *
 * `useSections` answers from the API and returns nothing at all offline, while
 * `useFramework` has a demo framework. Reading the section list from
 * `framework.groups` when the API has not answered is what keeps this usable
 * in both modes; `useSections` is still preferred when it has rows, because it
 * carries the company's own order and what each section is worth.
 *
 * ## Quick-create stays
 *
 * The moment a question needs a subsection that does not exist yet is the
 * moment to make it. There is a whole sections panel now — that one is for
 * reading and correcting the framework, not for interrupting somebody
 * part-way through writing a question.
 */
function FiledUnderPicker({
  sectionId,
  competencyId,
  onChange,
}: {
  /** `""` is "not filed under a section". */
  sectionId: string;
  /** `""` is "no subsection", which is what actually gets saved as unfiled. */
  competencyId: string;
  onChange: (next: { sectionId: string; competencyId: string }) => void;
}) {
  const framework = useFramework();
  const { sections } = useSections();
  const actions = useFrameworkActions();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  /* The API's own list when it has answered — it carries the order the company
     chose and what each section is worth. The framework's groups otherwise, so
     this still works with no API. A group with no section id is the unfiled
     bucket, which is the empty option below rather than a section. */
  const options: {
    id: string;
    name: string;
    weightBp: number | null | undefined;
  }[] =
    sections.length > 0
      ? sections.map((section) => ({
          id: section.id,
          name: section.name,
          weightBp: section.weightBp,
        }))
      : framework.groups
          .filter((group) => group.sectionId)
          .map((group) => ({
            id: group.sectionId ?? "",
            name: group.sectionName,
            weightBp: undefined,
          }));

  const chosen = options.find((option) => option.id === sectionId);
  const inSection = framework.competencies.filter(
    (competency) => (competency.sectionId ?? "") === sectionId,
  );

  const label = (option: (typeof options)[number]) => {
    if (option.weightBp === undefined) return option.name;
    /* Null is "not weighted", never 0%. A section outside `ScoreComponent` has
       its ratings recorded and excluded, and 0% would read as a weight
       somebody chose. */
    return option.weightBp === null
      ? `${option.name} — not weighted`
      : `${option.name} — ${weightLabel(option.weightBp)} of the mark`;
  };

  const addSubsection = async () => {
    if (newName.trim().length < 2) {
      setAddError("Give it a name.");
      return;
    }
    setAddError(null);
    setBusy(true);
    try {
      const competency = await actions.createCompetency({
        name: newName.trim(),
        scaleMax: 5,
        ...(sectionId ? { sectionId } : {}),
      });
      onChange({ sectionId, competencyId: competency.id });
      setAdding(false);
      setNewName("");
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
          help={
            /* Says where it will land, using the section already chosen above
               rather than asking for it a second time. */
            chosen
              ? `It will be filed under ${chosen.name}.`
              : "It will not be filed under a section, so answers to it count towards no part of the mark."
          }
        >
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Communication"
          />
        </Field>
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
    <div className="flex flex-col gap-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Section">
          <Select
            value={sectionId}
            onChange={(event) =>
              /* The subsection goes with it. Keeping it would leave a question
                 filed under something the select above no longer lists, which
                 is a claim the screen cannot show. */
              onChange({ sectionId: event.target.value, competencyId: "" })
            }
          >
            <option value="">Not filed under a section</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {label(option)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Subsection">
          <div className="flex gap-2">
            <Select
              value={competencyId}
              className="flex-1"
              onChange={(event) =>
                onChange({ sectionId, competencyId: event.target.value })
              }
            >
              <option value="">None</option>
              {inSection.map((competency) => (
                <option key={competency.id} value={competency.id}>
                  {competency.name}
                </option>
              ))}
            </Select>
            <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" className="size-3.5" />
              New
            </Button>
          </div>
        </Field>
      </div>

      {/* One sentence under both controls, because it is one fact about the
          pair of them. Four states, and the middle one is the whole reason
          this is two selects rather than one. */}
      <NoticeLine
        tone={competencyId === "" && sectionId !== "" ? "warning" : "muted"}
      >
        <span>
          {competencyId !== ""
            ? chosen === undefined
              ? "This is not filed under a section, so answers to it count towards no part of the mark."
              : chosen.weightBp === null
                ? `${chosen.name} is not weighted, so answers to this count towards no part of the mark.`
                : chosen.weightBp === undefined
                  ? `Answers to this count towards ${chosen.name}.`
                  : `Answers to this count towards ${chosen.name}, which is ${weightLabel(chosen.weightBp)} of the mark.`
            : sectionId !== ""
              ? "Nothing is filed under a section on its own. Pick a subsection, or this question is asked, answered, and counts towards no part of the mark."
              : "Unfiled questions are asked and answered, and count towards no part of the mark."}
        </span>
      </NoticeLine>

      {sectionId !== "" && inSection.length === 0 && (
        <NoticeLine tone="muted">
          <span>
            Nothing is filed under {chosen?.name ?? "that section"} yet. Add a
            subsection to score answers against it.
          </span>
        </NoticeLine>
      )}
    </div>
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
