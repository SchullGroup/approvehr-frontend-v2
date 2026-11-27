"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import {
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
  ReviewAudience,
  ReviewQuestionKind,
  UpdateQuestionBody,
} from "@/lib/api/performance";
import { useCycleQuestions, useFramework } from "@/lib/store/performance";
import { NoticeLine } from "@/components/portal/notice-line";
import { QUESTION_BANK } from "@/lib/performance/question-bank";
import { whoIsAsked } from "@/lib/performance/who-is-asked";
import {
  MAX_CHOICES,
  MAX_CHOICE_LENGTH,
  questionCounter,
  questionWordingProblem,
} from "@/lib/performance/question-limits";

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
 * Changing the questions of a period that has started.
 *
 * A plain list: each question, who it is asked of as words, a pencil and a bin.
 * A question can be changed or removed until somebody has answered it, and the
 * API refuses after, with a sentence that is shown on the row. Nothing is added
 * here: a period gets its questions in the step-by-step form while it is a
 * draft, and the competencies the form asks are chosen on the Questions tab.
 * Dragging a question's handle rearranges the form until the period is
 * published.
 */
export function QuestionsDialog({
  open,
  cycleId,
  onClose,
  onUpdate,
  onRemove,
  onReorder,
}: {
  open: boolean;
  cycleId: string;
  onClose: () => void;
  onUpdate: (id: string, body: UpdateQuestionBody) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  /**
   * Rearrange the form. Absent once the period is published, where the API
   * refuses it: its form is a record by then.
   */
  onReorder?: (ids: string[]) => Promise<void>;
}) {
  const { questions, loading, reload } = useCycleQuestions(cycleId);
  /* Only the period's own questions. The competencies it asks are rated on
     their own and are changed from the Questions tab. */
  const own = useMemo(
    () => questions.filter((question) => question.answersSubsection !== true),
    [questions],
  );

  /**
   * The arrangement somebody has just dragged, held until the server's own
   * order says the same thing.
   *
   * Without it the row snaps back to where it started for as long as the
   * request takes, which reads as the drag having failed. It is reconciled
   * against the live list on every render rather than cleared on success, so it
   * needs no timing; on a refusal it is thrown away and the server's order
   * stands.
   */
  const [dragged, setDragged] = useState<string[] | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  const ordered = useMemo(() => {
    if (!dragged) return own;
    const byId = new Map(own.map((q) => [q.id, q]));
    const known = new Set(dragged);
    return [
      ...dragged.flatMap((id) => byId.get(id) ?? []),
      ...own.filter((q) => !known.has(q.id)),
    ];
  }, [own, dragged]);

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

  /** The question being changed, or `null` while none is. */
  const [editing, setEditing] = useState<ApiQuestion | null>(null);
  /** The cursor, put in the question box when the form opens. */
  const promptRef = useRef<HTMLInputElement>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  useEffect(() => {
    if (focusRequest === 0) return;
    const input = promptRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    /* Not in every environment, and the focus is the part that matters. */
    input.scrollIntoView?.({ block: "center" });
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
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [allowCustom, setAllowCustom] = useState(false);
  /**
   * Field errors and form errors, kept apart: a refusal about the audience is
   * shown under the audience, not on the question.
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
   * Why a question could not be removed, on the row it is about. A removal that
   * failed (somebody has answered it) was reported at the bottom of the list,
   * off screen from the bin that was pressed, so the question simply seemed not
   * to go.
   */
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const startEdit = (question: ApiQuestion) => {
    setRowErrors({});
    setFocusRequest((count) => count + 1);
    setEditing(question);
    setPrompt(question.prompt);
    setKind(question.kind);
    /* The whole list, not `[0]`. Reading only the first is what let an edit
       silently narrow a question asked of two people to one. */
    setNarrowed(question.askedOf.length > 0);
    setAudiences(inAudienceOrder(question.askedOf));
    setRequired(question.required);
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
    setOptions(["", ""]);
    setAllowCustom(false);
    clearErrors();
  };

  /**
   * Save the question being changed.
   *
   * Resolves to whether it was kept, so closing the dialog on an unsaved change
   * can close only when it was: a refusal leaves the form open with the reason
   * on it, and a dialog that closed anyway would have thrown the change away.
   */
  const save = async (): Promise<boolean> => {
    /* Enter in the question box reaches here as well as the button, and the
       button is only disabled once a save is under way. */
    if (saving || !editing) return false;
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
      fail("audience", "Choose who is asked, or set it back to everyone.");
      return false;
    }
    /* Refuses the save and says nothing new: the same sentence is already on
       screen under the audience picker, from the same function. */
    if (evidenceAudienceRefusal(kind, narrowed, audiences)) return false;
    clearErrors();
    setSaving(true);
    try {
      await onUpdate(editing.id, {
        prompt: prompt.trim(),
        kind,
        askedOf: narrowed ? inAudienceOrder(audiences) : [],
        required,
        ...(kind === "CHOICE"
          ? { options: cleanOptions, allowCustom }
          : { options: [], allowCustom: false }),
      });
      cancelEdit();
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

  const remove = async (question: ApiQuestion) => {
    const { id } = question;
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

  /** The form that changes a question, and nothing else. */
  const renderForm = () => {
    if (!editing) return null;
    const counter = questionCounter(prompt);
    return (
      <div className="flex flex-col gap-4">
        {/* Belongs to the whole form, so it sits above it rather than
            accusing the first field. */}
        {formError && (
          <Callout tone="danger" title="That did not go through">
            {formError}
          </Callout>
        )}

        <Field
          label="Question"
          required
          {...(errors["prompt"] ? { error: errors["prompt"] } : {})}
          {...(counter ? { help: counter } : {})}
        >
          <Input
            ref={promptRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            /* Enter saves, as the button does. Not while an input method is
               composing a character: Enter is how that is confirmed. */
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing)
                return;
              event.preventDefault();
              void save();
            }}
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
            {errors["audience"] && (
              <p className="text-body-sm text-danger-text">
                {errors["audience"]}
              </p>
            )}
          </>
        )}

        {/* The rule while somebody is choosing, not after they save.
            `evidenceAudienceRefusal` is the same function `save` calls, so the
            note and the refusal cannot come to say different things. */}
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
              competencyId={editing.competencyId ?? ""}
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
            Save
          </Button>
          <Button variant="ghost" disabled={saving} onClick={cancelEdit}>
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  /**
   * One row of the list: the question as it reads, or, when it is the one being
   * changed, the form, in its place. The change lands where the eye already is,
   * and the list closes up around it again when it is saved or cancelled.
   */
  const renderRow = (question: ApiQuestion, handle?: React.ReactNode) =>
    editing?.id === question.id ? (
      <div className="rounded-md border border-accent-line bg-accent-soft p-3">
        {renderForm()}
      </div>
    ) : (
      <QuestionRow
        question={question}
        {...(handle ? { handle } : {})}
        disabled={saving}
        error={rowErrors[question.id] ?? null}
        onEdit={() => startEdit(question)}
        onRemove={() => void remove(question)}
      />
    );

  /**
   * Whether a change has been made and not kept. Closing with one used to throw
   * it away without a word, and a person who edited a question and pressed Done
   * saw nothing change.
   */
  const unsaved = (() => {
    if (!editing) return false;
    const sameList = (a: readonly string[], b: readonly string[]) =>
      a.length === b.length && a.every((one, at) => one === b[at]);
    const written = options.map((o) => o.trim()).filter((o) => o.length > 0);
    return (
      prompt.trim() !== editing.prompt.trim() ||
      kind !== editing.kind ||
      required !== editing.required ||
      !sameList(
        narrowed ? inAudienceOrder(audiences) : [],
        inAudienceOrder(editing.askedOf),
      ) ||
      (kind === "CHOICE" &&
        (allowCustom !== editing.allowCustom ||
          !sameList(written, editing.options)))
    );
  })();

  /** Asked, once, what to do with the change that has not been kept. */
  const [askingToClose, setAskingToClose] = useState(false);
  const asking = askingToClose && unsaved;

  /** Done, the cross and Escape all come here. */
  const requestClose = () => {
    if (unsaved) {
      setAskingToClose(true);
      return;
    }
    cancelEdit();
    onClose();
  };
  const keepEditing = () => setAskingToClose(false);
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
      size="lg"
      footer={
        asking ? (
          <>
            <span
              role="alert"
              className="min-w-0 flex-1 basis-56 text-body-sm text-ink"
            >
              You changed this question and have not saved it.
            </span>
            <Button variant="ghost" onClick={keepEditing}>
              Keep editing
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
              Save and close
            </Button>
          </>
        ) : (
          <Button onClick={requestClose}>Done</Button>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {loading ? (
          <span className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading the form
          </span>
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
                    <SortableHandle handleProps={args.handleProps} />,
                  )
                }
              </Sortable>
            ) : (
              <ul className="flex flex-col gap-2">
                {ordered.map((question) => (
                  <li key={question.id}>{renderRow(question)}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/**
 * One question as the list shows it: the prompt, and who it is put to as words.
 * Nothing else: how it is answered and whether it is required are in the form
 * behind the pencil.
 */
function QuestionSummary({ question }: { question: ApiQuestion }) {
  return (
    /* A basis of its own, so on a phone the pencil and the bin drop under the
       question instead of squeezing it into a strip a few words wide. */
    <span className="min-w-0 flex-1 basis-56">
      <span className="block text-body-sm font-medium text-ink">
        {question.prompt}
      </span>
      <span className="mt-0.5 block text-meta text-muted">
        {whoIsAsked(question.askedOf)}
      </span>
    </span>
  );
}

/**
 * One question as the list draws it: what it says, who is asked, the pencil and
 * the bin, and, if the last removal failed, why, under the row it is about.
 * Changing it is the pencil: the form replaces the row (see `renderRow` in
 * `QuestionsDialog`) and this is not drawn at all while that is so.
 */
function QuestionRow({
  question,
  handle,
  disabled,
  error,
  onEdit,
  onRemove,
}: {
  question: ApiQuestion;
  /** The drag handle, while the period can still be rearranged. */
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
        <QuestionSummary question={question} />
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
 * How long a press on Remove is ignored after it appears. See `QuestionRowActions`.
 */
const REMOVE_GUARD_MS = 500;

/**
 * Edit and remove, labelled with the prompt so the two rows never sound alike.
 *
 * Removing asks first, on the row, and not in a second dialog over this one. It
 * deletes the question for good, and it sat one click from the pencil with nothing
 * between a slip and a gone question. So the bin turns into a red **Remove**, with
 * the same bin on it, in the same place, and one more press is what removes it.
 *
 * There is no Keep. Leaving a question alone needs no button: pressing anywhere
 * else, tabbing away or Escape puts the bin back. The first Escape does only that,
 * and the dialog stays open, as the help hints do (`InfoTooltip`).
 *
 * Two things stand in for what a Keep button gave:
 *
 * - A double tap on the bin would land its second tap on Remove, in the very spot
 *   the bin was. A press in the first half second (`REMOVE_GUARD_MS`) is ignored.
 *   The button is not greyed for it, because a button that looks off for half a
 *   second reads as broken.
 * - Focus goes to Remove when it appears, the bin it came from being gone, and back
 *   to the bin when Escape drops the ask, so somebody on a keyboard keeps their place.
 *
 * Its hover title says what Remove does. A touch screen has no hover, so its name,
 * the bin and the word, carries the meaning and the title only adds to it.
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
  const [armed, setArmed] = useState(false);
  const bin = useRef<HTMLButtonElement>(null);
  const remove = useRef<HTMLButtonElement>(null);
  const pressable = useRef(false);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (!armed) {
      if (returnFocus.current) {
        returnFocus.current = false;
        bin.current?.focus();
      }
      return;
    }
    remove.current?.focus();
    pressable.current = false;
    const timer = window.setTimeout(() => {
      pressable.current = true;
    }, REMOVE_GUARD_MS);

    const dropOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      returnFocus.current = true;
      setArmed(false);
    };
    const dropOnPressElsewhere = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && remove.current?.contains(target)) return;
      setArmed(false);
    };
    window.addEventListener("keydown", dropOnEscape, true);
    document.addEventListener("pointerdown", dropOnPressElsewhere, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", dropOnEscape, true);
      document.removeEventListener("pointerdown", dropOnPressElsewhere, true);
    };
  }, [armed]);

  return (
    <span className="ml-auto flex shrink-0 items-center gap-1">
      <IconButton
        label={`Edit "${question.prompt}"`}
        disabled={disabled}
        onClick={onEdit}
      >
        <Pencil aria-hidden="true" />
      </IconButton>
      {armed ? (
        <Button
          ref={remove}
          type="button"
          variant="danger"
          size="sm"
          aria-label={`Remove "${question.prompt}" for good`}
          title="Remove this question from this period for good. It is no longer asked on anybody's form, and this cannot be undone."
          disabled={disabled}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setArmed(false);
            }
          }}
          onClick={() => {
            if (!pressable.current) return;
            setArmed(false);
            onRemove();
          }}
        >
          <Trash2 aria-hidden="true" className="size-3.5" />
          Remove
        </Button>
      ) : (
        <IconButton
          ref={bin}
          /* A very light red behind it, so the one control that deletes is the
             one that looks like it. The red at 10% reads the same in both themes. */
          className="bg-danger/10 hover:bg-danger/20"
          label={`Remove "${question.prompt}"`}
          disabled={disabled}
          onClick={() => setArmed(true)}
        >
          <Trash2 aria-hidden="true" />
        </IconButton>
      )}
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
    </div>
  );
}

/**
 * The choices for a CHOICE question, and whether a typed answer is also
 * accepted.
 *
 * Suggested phrasings from `QUESTION_BANK` are offered as one-click adds, a
 * starting point: every one is editable and removable like a hand-typed choice.
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
