"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  LoadFailure,
  Modal,
  SegmentedControl,
  Select,
  Sortable,
  SortableHandle,
  Spinner,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { actionMessage } from "@/lib/use-action";
import type {
  ApiCompetency,
  ApiQuestion,
  ApiSection,
  CreateQuestionBody,
  ReviewAudience,
  ReviewQuestionKind,
  UpdateQuestionBody,
} from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import {
  useAppraisals,
  useCycleQuestions,
  useFramework,
  useFrameworkActions,
  useSections,
} from "@/lib/store/performance";
import type { FrameworkGroup } from "@/lib/store/performance";
import { useHeld } from "@/lib/use-held";
import { NoticeLine } from "@/components/portal/notice-line";
import {
  answerKindOf,
  subsectionOptionLabel,
} from "@/lib/performance/answer-kind";
import { QUESTION_BANK } from "@/lib/performance/question-bank";
import {
  MAX_CHOICES,
  MAX_CHOICE_LENGTH,
  questionCounter,
  questionWordingProblem,
} from "@/lib/performance/question-limits";
import { filingNote } from "./question-filing";
import {
  SubsectionTree,
  newSubsectionBody,
  sectionOptionsOf,
  subsectionNameProblem,
} from "./subsection-tree";
import type { SectionOption } from "./subsection-tree";

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
  { value: "FILE", label: "A file, a report, a dashboard, a screenshot" },
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
 *
 * ## Two views of the same form
 *
 * **All questions** is the form as it was: every question in this period, in the
 * order they are asked, and one form to add or change one, with the section and
 * the subsection to file it under chosen in the form itself.
 *
 * **By section** is the same questions laid out under the framework they belong
 * to: the company's sections, the subsections in each, and for each subsection
 * two tabs, one for how it is answered when somebody records an answer on it
 * directly and one for this period's questions filed under it. It exists so that
 * deciding how a subsection is answered, and writing its questions, are one trip
 * rather than two screens. The two tabs are a view switch and never a choice: a
 * subsection can be answered directly and also carry questions, and neither
 * affects the other.
 *
 * The form is the same form in both. In the section view it sits under the
 * subsection that is open and files its question there, so the picker is not
 * shown; which subsection a question is filed under is whichever is open, read
 * at the moment it is saved, so saving or cancelling an edit cannot leave the
 * next question filed under nothing.
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
  const { editable: apiConnected } = useFrameworkActions();
  const canManage = useCan("MANAGE_SETTINGS");

  /** Which of the two views of the form is showing. Never persisted. */
  const [view, setView] = useState<"all" | "sections">("all");
  /** The subsection open in the section view, or `null` while none is. */
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
  /**
   * The cursor, put in the question box when something asks for it.
   *
   * The form is drawn in one of several places (under the list, under an open
   * subsection, in place of the row being edited) and only ever one at a time, so
   * there is one box to point at. A counter and not a flag: asking twice has to
   * work, and the form has to have rendered before the focus lands, which an
   * effect that runs after the commit guarantees and a direct call does not.
   * Pressing Add leaves the page with nothing focused, because the button is
   * disabled while it saves, so without this the next question of ten has to be
   * clicked into every time.
   */
  const promptRef = useRef<HTMLInputElement>(null);
  const [focusRequest, setFocusRequest] = useState<{
    count: number;
    block: ScrollLogicalPosition;
  }>({ count: 0, block: "nearest" });
  /**
   * `nearest` moves the dialog as little as it can, which is right when somebody is
   * adding the next of several and the box is already in view. `center` is for
   * arriving at a form: pressing Add question or the pencil should show the form
   * with its neighbours, not leave the box on the bottom edge with the rest of it
   * below the fold.
   */
  const askForFocus = (block: ScrollLogicalPosition = "nearest") =>
    setFocusRequest((current) => ({ count: current.count + 1, block }));
  useEffect(() => {
    if (focusRequest.count === 0) return;
    const input = promptRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    /* Not in every environment, and the focus is the part that matters. */
    input.scrollIntoView?.({ block: focusRequest.block });
  }, [focusRequest]);
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
   * rather than leaving somebody to find it in the list afterwards.
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
  /**
   * Why a question could not be removed, on the row it is about.
   *
   * This used to be the form's error, which is drawn above the form: a removal
   * that failed (the period has started, or somebody has answered it) was
   * reported at the bottom of the list, off screen from the bin that was pressed,
   * so the question simply seemed not to go.
   */
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const startEdit = (question: ApiQuestion) => {
    setRowErrors({});
    askForFocus("center");
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

  /**
   * The subsection the question being written is filed under.
   *
   * In the full list that is what the picker holds. In the section view it is the
   * subsection that is open, read here and not copied into the picker's state:
   * `cancelEdit` clears the picker's, and a copy would leave the next question
   * after a saved edit filed under nothing while the screen still showed it under
   * the open subsection.
   */
  const filedUnder = view === "sections" ? (selectedId ?? "") : competencyId;

  /**
   * Move between the two views.
   *
   * An edit in progress is dropped, because the question being edited may not be
   * on the other view at all, and so is what was chosen to file under. What
   * somebody has typed into a new question is kept: it does not belong to either
   * view, and losing a sentence to a toggle is worse than carrying it across.
   */
  const switchView = (next: "all" | "sections") => {
    if (next === view) return;
    if (editing) cancelEdit();
    clearErrors();
    setSelectedId(null);
    setSectionId("");
    setCompetencyId("");
    setView(next);
  };

  /** Open a subsection in the section view, or close the open one with `null`. */
  const selectSubsection = (subsection: ApiCompetency | null) => {
    if (editing) cancelEdit();
    clearErrors();
    setSelectedId(subsection?.id ?? null);
  };

  /** Questions in this period by the subsection they are filed under. */
  const questionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const question of questions) {
      if (!question.competencyId) continue;
      counts.set(
        question.competencyId,
        (counts.get(question.competencyId) ?? 0) + 1,
      );
    }
    return counts;
  }, [questions]);
  const unfiledQuestionCount = questions.filter(
    (question) => !question.competencyId,
  ).length;

  /**
   * Add the question being written, or save the one being changed.
   *
   * Resolves to whether it was kept, so closing the dialog on an unsent question
   * can close only when it was: a refusal leaves the form open with the reason on
   * it, and a dialog that closed anyway would have thrown the question away.
   */
  const save = async (): Promise<boolean> => {
    /* Enter in the question box reaches here as well as the button, and the
       button is only disabled once a save is under way. */
    if (saving) return false;
    /* The server's own limits and sentences, said before the round trip rather
       than as a banner after it. */
    const wording = questionWordingProblem(prompt);
    if (wording) {
      fail("prompt", wording);
      return false;
    }
    const cleanOptions = options
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
    if (kind === "CHOICE" && cleanOptions.length < 2) {
      fail(
        "options",
        "A pick-from-a-list question needs at least two choices.",
      );
      return false;
    }
    if (narrowed && audiences.length === 0) {
      fail(
        "audience",
        "Choose who is asked, or set it back to everyone on the form. " +
          "A question nobody is asked is never answered.",
      );
      return false;
    }
    /* Refuses the save and says nothing new: the same sentence is already on
       screen under the audience picker, from the same function, and has been
       since the kind was set to a file. Repeating it on the question text
       would be the defect this split is about. */
    if (evidenceAudienceRefusal(kind, narrowed, audiences)) return false;
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
        ...(filedUnder ? { competencyId: filedUnder } : {}),
      };
      if (editing) {
        await onUpdate(editing.id, {
          ...shared,
          competencyId: filedUnder || null,
        });
        cancelEdit();
      } else {
        await onAdd(shared);
        setPrompt("");
        setOptions(["", ""]);
        setAllowCustom(false);
        /* Back in the box for the next one. Several at a time is the point of
           the form staying open. */
        askForFocus();
      }
      reload();
      return true;
    } catch (caught) {
      /* The whole form, so above the form rather than under the first field. */
      setFormError(actionMessage(caught, "the question"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setRowErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)),
    );
    try {
      await onRemove(id);
      if (editing?.id === id) cancelEdit();
      reload();
    } catch (caught) {
      setRowErrors((current) => ({
        ...current,
        [id]: actionMessage(caught, "that question"),
      }));
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

  /** The section view can change the framework only when it can reach it. */
  const treeEditable = apiConnected === true && canManage;
  const whyNot =
    apiConnected !== true
      ? "Changing sections, subsections and how they are answered needs the API: the demo framework is fixed."
      : !canManage
        ? "Only somebody who can manage settings can change sections, subsections and how they are answered."
        : null;

  /**
   * The form that adds and changes a question.
   *
   * One form, rendered in one of two places, and never in both: under the list in
   * the full view, and under the open subsection in the section view. A function
   * returning markup and not a component, on purpose: a component declared in
   * here would be a new type on every render and would throw away what somebody
   * was typing each time anything changed.
   */
  /* `how`, not `options`: that is the choices of the question being written,
     which the form below reads. */
  const renderForm = (place: FormPlace, how: { inline?: boolean } = {}) => {
    const filingLine =
      place.where === "subsection"
        ? filingNote({
            sectionId: place.section?.id ?? "",
            competencyId: place.subsection.id,
            ...(place.section
              ? {
                  section: {
                    name: place.section.name,
                    weightBp: place.section.weightBp,
                  },
                }
              : {}),
            subsectionName: place.subsection.name,
            answerKind: answerKindOf(place.subsection),
          })
        : null;
    const counter = questionCounter(prompt);
    return (
      <div
        className={cn(
          "flex flex-col gap-4",
          /* A divider above the form that closes the list, and none above one
             that has taken a row's place. */
          place.where === "all" && !how.inline && "border-t border-line pt-5",
        )}
      >
        {/* Belongs to the whole form, so it sits above it rather than
            accusing the first field. */}
        {formError && (
          <Callout tone="danger" title="That did not go through">
            {formError}
          </Callout>
        )}

        {/* Where it goes, before what it says.

            This used to sit below the question, the answer kind and the
            audience, which put the choice of where the question is grouped
            last, after the decisions it qualifies. Leading with it also
            makes the section an explicit choice rather than something
            implied by which group an option happened to sit in. */}
        {place.where === "all" ? (
          <FiledUnderPicker
            sectionId={sectionId}
            competencyId={competencyId}
            onChange={(next) => {
              setSectionId(next.sectionId);
              setCompetencyId(next.competencyId);
            }}
            /* The picker reads the framework through its own hook, so a
               subsection made there has to be announced to this one, or the
               list this dialog keeps is the one that never heard of it. */
            onSubsectionAdded={() => framework.reload()}
          />
        ) : (
          /* Nothing to choose: the question goes under the subsection that is
             open, and this says what that means for the mark. */
          filingLine && (
            <NoticeLine tone={filingLine.tone}>
              <span>{filingLine.text}</span>
            </NoticeLine>
          )
        )}

        <Field
          label={editing ? "Edit the question" : "Add a question"}
          required
          {...(errors["prompt"] ? { error: errors["prompt"] } : {})}
          {...(counter ? { help: counter } : {})}
        >
          <Input
            ref={promptRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            /* Enter adds it, as the button does. Not while an input method is
               composing a character: Enter is how that is confirmed. */
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing)
                return;
              event.preventDefault();
              void save();
            }}
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
              competencyId={filedUnder}
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
    );
  };

  /**
   * One row of a list: the question as it reads, or, when it is the one being
   * changed, the form, in its place.
   *
   * The form used to be drawn once, under the list, whichever row the pencil was
   * on. With a few questions that is a short scroll; with a dozen it opens out of
   * sight and the pencil seems to have done nothing. Taking the row's place puts
   * the change where the eye already is, and the list closes up around it again
   * when it is saved or cancelled.
   */
  const renderRow = (
    question: ApiQuestion,
    place: FormPlace,
    row: { handle?: React.ReactNode; showFiling: boolean },
  ) =>
    editing?.id === question.id ? (
      <div className="rounded-md border border-accent-line bg-accent-soft p-3">
        {renderForm(place, { inline: true })}
      </div>
    ) : (
      <QuestionRow
        question={question}
        competencyName={competencyName}
        showFiling={row.showFiling}
        {...(row.handle ? { handle: row.handle } : {})}
        disabled={saving}
        error={rowErrors[question.id] ?? null}
        onEdit={() => startEdit(question)}
        onRemove={() => void remove(question.id)}
      />
    );

  /**
   * What the Questions tab of a subsection holds: this period's questions filed
   * under it, and the form to add another.
   *
   * In the order the full list has them, and plain: rearranging is done in the
   * full list, where every question is in view at once. The form is under the
   * list, so each question added lands directly above the box it was typed in, and
   * stays open for the next. It gives way only to the form of a row being changed,
   * which has taken that row's place.
   */
  const renderSubsectionQuestions = (
    subsection: ApiCompetency,
    section: SectionOption | null,
  ) => {
    const place: FormPlace = { where: "subsection", subsection, section };
    const own = ordered.filter(
      (question) => question.competencyId === subsection.id,
    );
    const changingOne =
      editing !== null && own.some((q) => q.id === editing.id);
    return (
      <div className="flex flex-col gap-4">
        {loading ? (
          <span className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading the form
          </span>
        ) : own.length === 0 ? (
          <p className="text-body-sm text-muted">
            Nothing in {periodName} is filed under {subsection.name} yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {own.map((question) => (
              <li key={question.id}>
                {renderRow(question, place, { showFiling: false })}
              </li>
            ))}
          </ul>
        )}
        {!changingOne && renderForm(place)}
      </div>
    );
  };

  /**
   * Somebody pressed Add question on a subsection's row. The tree has opened it on
   * its questions; this puts the cursor in the box. An edit in progress is dropped
   * first: they have said they want a new question, and the box would otherwise
   * land in the middle of changing another.
   */
  const addQuestionTo = () => {
    if (editing) cancelEdit();
    askForFocus("center");
  };

  /** A question in the full list is being changed, so its form is in the list. */
  const changingOneInList =
    editing !== null && ordered.some((question) => question.id === editing.id);

  /**
   * Whether there is a question that has been written and not kept.
   *
   * A new question with any words in it, or a changed one that no longer reads as
   * saved. Closing with either used to throw it away without a word, and a person
   * who typed a question and pressed Done saw nothing made. Only what a person
   * would call a question counts: a kind picked on an empty box is not worth
   * stopping anyone for.
   */
  const unsentQuestion = (() => {
    if (!editing) return prompt.trim().length > 0;
    const sameList = (a: readonly string[], b: readonly string[]) =>
      a.length === b.length && a.every((one, at) => one === b[at]);
    const written = options.map((o) => o.trim()).filter((o) => o.length > 0);
    return (
      prompt.trim() !== editing.prompt.trim() ||
      kind !== editing.kind ||
      required !== editing.required ||
      filedUnder !== (editing.competencyId ?? "") ||
      !sameList(
        narrowed ? inAudienceOrder(audiences) : [],
        inAudienceOrder(editing.askedOf),
      ) ||
      (kind === "CHOICE" &&
        (allowCustom !== editing.allowCustom ||
          !sameList(written, editing.options)))
    );
  })();

  /** Asked, once, what to do with the question that has not been kept. */
  const [askingToClose, setAskingToClose] = useState(false);
  const asking = askingToClose && unsentQuestion;

  /** Done, the cross and Escape all come here. */
  const requestClose = () => {
    if (unsentQuestion) {
      setAskingToClose(true);
      return;
    }
    onClose();
  };
  const keepWriting = () => setAskingToClose(false);
  const discardAndClose = () => {
    cancelEdit();
    setAskingToClose(false);
    onClose();
  };
  const keepAndClose = async () => {
    const kept = await save();
    /* A refusal leaves the dialog open on the form, which now says why. */
    setAskingToClose(false);
    if (kept) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={requestClose}
      title="Questions"
      description={periodName}
      size="lg"
      footer={
        asking ? (
          <>
            <span
              role="alert"
              className="min-w-0 flex-1 basis-56 text-body-sm text-ink"
            >
              {editing
                ? "You changed this question and have not saved it."
                : "You wrote a question and have not added it."}
            </span>
            <Button variant="ghost" onClick={keepWriting}>
              Keep writing
            </Button>
            <Button
              variant="secondary"
              disabled={saving}
              onClick={discardAndClose}
            >
              Discard
            </Button>
            <Button
              variant="accent"
              loading={saving}
              onClick={() => void keepAndClose()}
            >
              {editing ? "Save and close" : "Add it and close"}
            </Button>
          </>
        ) : (
          <Button onClick={requestClose}>Done</Button>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <SegmentedControl
          label="View"
          value={view}
          onChange={switchView}
          options={[
            { value: "all", label: "All questions" },
            { value: "sections", label: "By section" },
          ]}
        />

        {view === "sections" ? (
          <SectionsView
            periodName={periodName}
            framework={framework}
            questionCounts={questionCounts}
            unfiledQuestionCount={unfiledQuestionCount}
            editable={treeEditable}
            whyNot={whyNot}
            selectedId={selectedId}
            onSelect={selectSubsection}
            onAddQuestion={addQuestionTo}
            renderQuestions={renderSubsectionQuestions}
          />
        ) : (
          <>
            {loading ? (
              <span className="flex items-center gap-2 text-body-sm text-muted">
                <Spinner size="sm" />
                Loading the form
              </span>
            ) : questions.length === 0 ? (
              /* The blank page this whole feature exists for. Offered **only**
                 while the form is empty: the API refuses a copy onto a period
                 that already has questions, and a button that returns "that is
                 refused" was a design failure two clicks earlier.

                 Nothing is shared — the questions arrive as this period's own
                 rows, so editing one here does not touch the period it came
                 from. */
              onCopyFrom && (
                <CopyFromPeriod
                  cycleId={cycleId}
                  busy={saving}
                  onCopy={copyFrom}
                />
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
                    {(question, args) =>
                      renderRow(
                        question,
                        { where: "all" },
                        {
                          handle: (
                            <SortableHandle handleProps={args.handleProps} />
                          ),
                          showFiling: true,
                        },
                      )
                    }
                  </Sortable>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {ordered.map((question) => (
                      <li key={question.id}>
                        {renderRow(
                          question,
                          { where: "all" },
                          { showFiling: true },
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {onAddStandard && !changingOneInList && (
              /* The testing doc's six, offered whether or not HR has already
                 typed questions of their own — unlike `onCopyFrom`, this is
                 not confined to a blank form. Pressing it twice is refused by
                 the API in words naming which of the six are already there,
                 rather than hidden pre-emptively, so this needs no "already
                 added" tracking of its own. */
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

            {!changingOneInList && renderForm({ where: "all" })}
          </>
        )}
      </div>
    </Modal>
  );
}

/** Where the question form is drawn. See `renderForm`. */
type FormPlace =
  | { where: "all" }
  | {
      where: "subsection";
      subsection: ApiCompetency;
      /** The section the subsection is filed under, or `null` when it is under none. */
      section: SectionOption | null;
    };

/** What the section view is drawn from. */
type FrameworkSnapshot = {
  competencies: ApiCompetency[];
  groups: FrameworkGroup[];
  sections: ApiSection[];
};

/**
 * Whether two answers are the same one.
 *
 * Identity first, because the hooks hand back the same array until the data
 * changes and that is the case worth being cheap. Then by value, so that
 * something which rebuilds its arrays on every render, as a test double does,
 * still settles and does not render for ever.
 */
const sameData = (a: unknown, b: unknown) =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

const sameSnapshot = (a: FrameworkSnapshot, b: FrameworkSnapshot) =>
  sameData(a.competencies, b.competencies) &&
  sameData(a.groups, b.groups) &&
  sameData(a.sections, b.sections);

/**
 * The section view: the company's sections and subsections, drawn by
 * `SubsectionTree`.
 *
 * ## Its own component, so the sections are only read when somebody asks
 *
 * `QuestionsDialog` is mounted whenever the period screen is, closed or not, and
 * its hooks fetch on mount. The sections read belongs to this view alone, so it is
 * made here, and a company that never opens the view never pays for it.
 *
 * ## The list is held while it is re-read
 *
 * Every write in the tree ends by asking the framework again, and a re-read
 * blanks what it returns until it answers. The add forms are inside that list, so
 * letting it blank would unmount the form somebody is typing the next subsection
 * into, and take their cursor with it. `useHeld` keeps the last complete answer
 * on screen until the next one lands. The very first read has nothing to hold and
 * shows the loading line.
 *
 * ## A failed read is not an empty company
 *
 * With nothing loaded the tree would say there are no sections yet, which is a
 * claim about the company and not about the request.
 */
function SectionsView({
  periodName,
  framework,
  questionCounts,
  unfiledQuestionCount,
  editable,
  whyNot,
  selectedId,
  onSelect,
  onAddQuestion,
  renderQuestions,
}: {
  periodName: string;
  framework: ReturnType<typeof useFramework>;
  questionCounts: ReadonlyMap<string, number>;
  unfiledQuestionCount: number;
  editable: boolean;
  whyNot: string | null;
  selectedId: string | null;
  onSelect: (competency: ApiCompetency | null) => void;
  onAddQuestion: (competency: ApiCompetency) => void;
  renderQuestions: (
    competency: ApiCompetency,
    section: SectionOption | null,
  ) => React.ReactNode;
}) {
  const {
    sections,
    loading: sectionsLoading,
    reload: reloadSections,
  } = useSections();
  const ready = !framework.loading && !sectionsLoading;
  const shown = useHeld<FrameworkSnapshot>(
    {
      competencies: framework.competencies,
      groups: framework.groups,
      sections,
    },
    ready,
    sameSnapshot,
  );
  const options = sectionOptionsOf(shown.sections, shown.groups);

  if (framework.error) {
    return (
      <LoadFailure
        subject="the sections and subsections"
        error={framework.error}
        onRetry={framework.reload}
      />
    );
  }

  return (
    <SubsectionTree
      periodName={periodName}
      sections={options}
      competencies={shown.competencies}
      loading={
        !ready && shown.competencies.length === 0 && options.length === 0
      }
      questionCounts={questionCounts}
      unfiledQuestionCount={unfiledQuestionCount}
      editable={editable}
      whyNot={whyNot}
      selectedId={selectedId}
      onSelect={onSelect}
      onAddQuestion={onAddQuestion}
      onChanged={() => {
        framework.reload();
        reloadSections();
      }}
      renderQuestions={renderQuestions}
    />
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
 * moment it exists rather than left to be discovered afterwards, when the
 * question is not where anybody looked for it.
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
  onSubsectionAdded,
}: {
  /** `""` is "not filed under a section". */
  sectionId: string;
  /** `""` is "no subsection", which is what actually gets saved as unfiled. */
  competencyId: string;
  onChange: (next: { sectionId: string; competencyId: string }) => void;
  /**
   * Called once a subsection has been made here, after this picker has re-read
   * the framework itself. The dialog holds its own copy of the framework, read
   * through its own hook, and this is how it is told its copy is out of date.
   */
  onSubsectionAdded?: () => void;
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
  const options = sectionOptionsOf(sections, framework.groups);

  const chosen = options.find((option) => option.id === sectionId);
  const inSection = framework.competencies.filter(
    (competency) => (competency.sectionId ?? "") === sectionId,
  );
  const subsection = framework.competencies.find(
    (competency) => competency.id === competencyId,
  );
  const note = filingNote({
    sectionId,
    competencyId,
    ...(chosen
      ? { section: { name: chosen.name, weightBp: chosen.weightBp } }
      : {}),
    ...(subsection
      ? {
          subsectionName: subsection.name,
          answerKind: answerKindOf(subsection),
        }
      : {}),
  });

  const label = (option: (typeof options)[number]) => {
    if (option.weightBp === undefined) return option.name;
    /* Null is "not weighted", never 0%. A section outside `ScoreComponent` has
       its ratings recorded and excluded, and 0% would read as a weight
       somebody chose. */
    return option.weightBp === null
      ? `${option.name}, not weighted`
      : `${option.name}, ${weightLabel(option.weightBp)} of the mark`;
  };

  const addSubsection = async () => {
    const problem = subsectionNameProblem(newName);
    if (problem) {
      setAddError(problem);
      return;
    }
    setAddError(null);
    setBusy(true);
    try {
      const competency = await actions.createCompetency(
        newSubsectionBody({ name: newName, sectionId }),
      );
      onChange({ sectionId, competencyId: competency.id });
      /* Without this the list below never hears of what was just made: the new
         subsection is chosen and has no option in the select, so the picker
         shows "None" beside a note about a subsection it cannot name. */
      framework.reload();
      onSubsectionAdded?.();
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
              : "It will not be filed under a section, so a level recorded on it counts towards no part of the mark."
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
                  {subsectionOptionLabel(
                    competency.name,
                    answerKindOf(competency),
                  )}
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
          pair of them. `filingNote` is where its states are written, and why
          it no longer says an answer counts towards the mark. */}
      <NoticeLine tone={note.tone}>
        <span>{note.text}</span>
      </NoticeLine>

      {sectionId !== "" && inSection.length === 0 && (
        <NoticeLine tone="muted">
          <span>
            {chosen?.name ?? "That section"} has no subsections yet. Add one to
            file this question under it.
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
  showFiling = true,
}: {
  question: ApiQuestion;
  competencyName: (id: string) => string | null;
  /**
   * Whether to say which subsection the question is filed under. The section
   * view lists a subsection's own questions under its name, where saying so on
   * every row is the same word repeated.
   */
  showFiling?: boolean;
}) {
  return (
    /* A basis of its own, so on a phone the pencil and the bin drop under the
       question instead of squeezing it into a strip a few words wide. */
    <span className="min-w-0 flex-1 basis-56">
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
        {showFiling && question.competencyId && (
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

/**
 * One question as a list draws it, read only: what it says and how it is set, the
 * pencil and the bin, and, if the last removal failed, why, under the row it is
 * about.
 *
 * Every list that shows questions draws them through this, so a question looks and
 * behaves the same under a subsection as in the full list. The full list adds a
 * drag handle in front; nothing else differs. Changing it is the pencil: the form
 * replaces the row (see `renderRow` in `QuestionsDialog`) and this is not drawn at
 * all while that is so.
 */
function QuestionRow({
  question,
  competencyName,
  showFiling,
  handle,
  disabled,
  error,
  onEdit,
  onRemove,
}: {
  question: ApiQuestion;
  competencyName: (id: string) => string | null;
  showFiling: boolean;
  /** The drag handle, in the full list while the period can still be rearranged. */
  handle?: React.ReactNode;
  disabled: boolean;
  error: string | null;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line p-3">
      <div className="flex flex-wrap items-start gap-3">
        {handle}
        <QuestionSummary
          question={question}
          competencyName={competencyName}
          showFiling={showFiling}
        />
        <QuestionRowActions
          question={question}
          disabled={disabled}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      </div>
      {error && (
        <p role="alert" className="text-body-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Edit and remove, labelled with the prompt so the two rows never sound alike.
 *
 * Removing asks first, on the row, and not in a second dialog over this one. It
 * deletes the question for good, and it sat one click from the pencil with nothing
 * between a slip and a gone question. The question is part of what this period's
 * people are asked, so being sure costs one more press. Focus lands on **Keep**:
 * the safe answer is the one Enter gives.
 */
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
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span
        role="group"
        aria-label={`Remove "${question.prompt}"?`}
        className="flex w-full flex-wrap items-center justify-end gap-2"
      >
        <span className="text-body-sm text-ink">Remove this question?</span>
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={disabled}
          onClick={() => {
            setConfirming(false);
            onRemove();
          }}
        >
          Remove
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          autoFocus
          onClick={() => setConfirming(false)}
        >
          Keep
        </Button>
      </span>
    );
  }

  return (
    <span className="ml-auto flex shrink-0 gap-1">
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
        onClick={() => setConfirming(true)}
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

  /* The server takes ten. Past that the form would only be able to say so after
     the request, as a refusal naming a limit nobody was shown. */
  const full = options.length >= MAX_CHOICES;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-canvas p-3">
      <span className="text-body-sm font-medium text-ink">Choices</span>
      {options.map((option, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            value={option}
            maxLength={MAX_CHOICE_LENGTH}
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
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={full}
          onClick={() => onChange([...options, ""])}
        >
          <Plus aria-hidden="true" className="size-3.5" />
          Add a choice
        </Button>
        {full && (
          <span className="text-meta text-muted">
            Ten is the most a question can have.
          </span>
        )}
      </span>

      {suggestions.length > 0 && !full && (
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

  /* Shorter than it was: the field label above the picker is gone (the picker is
     named for assistive technology by what it is, and the heading above it is the
     visible label), and the picker and its button share a line. On a blank period
     this sits above the form for the first question, so every line of it is a line
     the form is pushed down by. */
  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-line bg-canvas p-3">
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
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 max-w-sm flex-1 basis-48">
          <Select
            aria-label="Copy from"
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
        </div>
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
