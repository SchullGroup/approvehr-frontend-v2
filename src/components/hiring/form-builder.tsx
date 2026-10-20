"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, Undo2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Field,
  IconButton,
  Input,
  SegmentedControl,
  Select,
  Switch,
} from "@/components/ui";
import {
  FILE_QUESTIONS_MAX,
  OPTIONS_MAX,
  QUESTIONS_MAX,
  QUESTION_KINDS,
  QUESTION_KIND_INFO,
  WORD_LIMIT_MAX,
  WORD_LIMIT_MIN,
  addQuestion,
  blankOption,
  blankQuestion,
  fileQuestions,
  changeKind,
  defaultWordLimit,
  moveQuestion,
  removeQuestion,
  updateQuestion,
  type FormDefinition,
  type FormQuestion,
  type KnockoutAnswer,
  type Presence,
  type QuestionKind,
} from "@/lib/marketing/apply-form";

/**
 * The editor for an advert's application form.
 *
 * Controlled: it holds no form of its own, only what is needed to undo a removal.
 * The page above it owns the value, the saving and the unsaved-changes guard, so
 * the same editor sits on the advert's own screen and inside the requisition
 * wizard without either having to know about the other.
 *
 * ## Why every move has a button
 *
 * Reordering is up and down buttons, not dragging. A drag handle is no use to
 * somebody on a keyboard or a phone, and the order of questions is exactly the
 * thing people fix on a train. The buttons name the question they move
 * ("Move question 2 up"), and one at the end of the list is disabled rather than
 * hidden, so the controls do not jump about under the pointer.
 *
 * ## What a knockout is, said where the switch is
 *
 * It flags the application for a person to look at. It does not reject anybody,
 * and the sentence says so beside the switch rather than in a help page, because
 * somebody turning it on is deciding what a machine does to a stranger.
 */

const PRESENCE_OPTIONS: { value: Presence; label: string }[] = [
  { value: "OFF", label: "Off" },
  { value: "OPTIONAL", label: "Optional" },
  { value: "REQUIRED", label: "Required" },
];

export const KNOCKOUT_STATEMENT =
  "A knockout flags the application for a person to review. It never rejects anyone.";

export function FormBuilder({
  value,
  onChange,
  problems = {},
  formProblem = null,
  readOnly = false,
  filesAvailable = true,
}: {
  value: FormDefinition;
  onChange: (next: FormDefinition) => void;
  /** One sentence per question id, shown under the question. */
  problems?: Record<string, string>;
  formProblem?: string | null;
  readOnly?: boolean;
  /** False when no bucket is set up, so a file box would not work yet. */
  filesAvailable?: boolean;
}) {
  const [removed, setRemoved] = useState<{
    question: FormQuestion;
    index: number;
  } | null>(null);

  const setStandard = (key: keyof FormDefinition["standard"], next: Presence) =>
    onChange({ ...value, standard: { ...value.standard, [key]: next } });

  const setQuestions = (questions: FormQuestion[]) =>
    onChange({ ...value, questions });

  const atLimit = value.questions.length >= QUESTIONS_MAX;
  const fileLimit = fileQuestions(value.questions).length >= FILE_QUESTIONS_MAX;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="What everyone is asked"
          description="First name, surname and email are always asked. Switch the rest on or off for this advert."
        />
        <CardBody className="flex flex-col gap-5">
          <StandardRow
            label="Phone number"
            value={value.standard.phone}
            onChange={(next) => setStandard("phone", next)}
            readOnly={readOnly}
          />
          <StandardRow
            label="CV upload"
            value={value.standard.cv}
            onChange={(next) => setStandard("cv", next)}
            readOnly={readOnly}
            note={
              filesAvailable
                ? undefined
                : "File storage is not set up yet, so applicants cannot attach a file."
            }
          />
          <StandardRow
            label="A note"
            value={value.standard.coverNote}
            onChange={(next) => setStandard("coverNote", next)}
            readOnly={readOnly}
          />
        </CardBody>
      </Card>

      <p
        data-testid="consent-state"
        className="rounded-lg border border-line bg-canvas px-4 py-3 text-body-sm text-body"
      >
        {value.consent.enabled
          ? "Applicants tick a privacy notice before they send. That is a company setting, kept under Careers page settings."
          : "Applicants are not asked to accept a privacy notice. Switch it on under Careers page settings."}
      </p>

      <section
        aria-labelledby="form-questions-title"
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3
              id="form-questions-title"
              className="text-body-md font-semibold text-ink"
            >
              Your questions
            </h3>
            <p className="mt-0.5 text-body-sm text-muted">
              Asked after the boxes above, in this order.
            </p>
          </div>
          <span className="tabular text-body-sm text-muted">
            {value.questions.length} of {QUESTIONS_MAX}
          </span>
        </div>

        {formProblem && (
          <Callout tone="danger" title="Fix this first">
            {formProblem}
          </Callout>
        )}

        {value.questions.length === 0 && (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-body-sm text-muted">
            No questions yet. Applicants will give their details and nothing
            else.
          </p>
        )}

        <ol className="flex list-none flex-col gap-3 p-0">
          {value.questions.map((question, index) => (
            <li key={question.id}>
              <QuestionCard
                question={question}
                index={index}
                total={value.questions.length}
                problem={problems[question.id]}
                readOnly={readOnly}
                filesAvailable={filesAvailable}
                onChange={(change) =>
                  setQuestions(
                    updateQuestion(value.questions, question.id, change),
                  )
                }
                onReplace={(next) =>
                  setQuestions(
                    value.questions.map((entry) =>
                      entry.id === question.id ? next : entry,
                    ),
                  )
                }
                onMove={(direction) =>
                  setQuestions(
                    moveQuestion(value.questions, question.id, direction),
                  )
                }
                onRemove={() => {
                  setRemoved({ question, index });
                  setQuestions(removeQuestion(value.questions, question.id));
                }}
              />
            </li>
          ))}
        </ol>

        {removed && (
          <p
            role="status"
            className="flex flex-wrap items-center gap-2 rounded-lg bg-canvas px-4 py-2.5 text-body-sm text-body"
          >
            <span className="min-w-0">
              Removed{" "}
              <strong className="font-medium text-ink">
                {removed.question.label.trim() || "an empty question"}
              </strong>
              .
              {(removed.question.answered ?? 0) > 0 &&
                " People already answered it, so their answers are kept; it just stops being asked."}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = [...value.questions];
                next.splice(
                  Math.min(removed.index, next.length),
                  0,
                  removed.question,
                );
                setQuestions(next);
                setRemoved(null);
              }}
            >
              <Undo2 aria-hidden="true" className="size-3.5" />
              Undo
            </Button>
          </p>
        )}

        {!readOnly && (
          <fieldset
            className="min-w-0 rounded-lg border border-line p-4"
            disabled={atLimit}
          >
            <legend className="px-1 text-body-sm font-medium text-ink">
              Add a question
            </legend>
            <div className="mt-1 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {QUESTION_KINDS.map((kind) => {
                const unavailable =
                  kind === "FILE" && (!filesAvailable || fileLimit);
                return (
                  <button
                    key={kind}
                    type="button"
                    disabled={unavailable}
                    onClick={() => {
                      setRemoved(null);
                      setQuestions(addQuestion(value.questions, kind));
                    }}
                    className={cn(
                      "flex min-h-14 flex-col items-start gap-0.5 rounded-md border border-line bg-surface px-3 py-2 text-left transition-colors",
                      "hover:border-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-body-sm font-medium text-ink">
                      <Plus aria-hidden="true" className="size-3.5" />
                      {QUESTION_KIND_INFO[kind].label}
                    </span>
                    <span className="text-meta text-muted">
                      {unavailable
                        ? filesAvailable
                          ? `A form can ask for ${FILE_QUESTIONS_MAX} files.`
                          : "Needs file storage."
                        : QUESTION_KIND_INFO[kind].hint}
                    </span>
                  </button>
                );
              })}
            </div>
            {filesAvailable && !fileLimit && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setRemoved(null);
                  setQuestions([
                    ...value.questions,
                    {
                      ...blankQuestion("FILE"),
                      label: "Your covering letter",
                    },
                  ]);
                }}
              >
                <Plus aria-hidden="true" className="size-4" />
                Covering letter upload
              </Button>
            )}
            {atLimit && (
              <p className="mt-2 text-body-sm text-muted">
                That is the most a form can hold.
              </p>
            )}
          </fieldset>
        )}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function StandardRow({
  label,
  value,
  onChange,
  readOnly,
  note,
}: {
  label: string;
  value: Presence;
  onChange: (next: Presence) => void;
  readOnly: boolean;
  note?: string | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <p className="text-body-sm font-medium text-ink">{label}</p>
        {note && <p className="mt-0.5 text-body-sm text-muted">{note}</p>}
      </div>
      {readOnly ? (
        <Badge tone="neutral">
          {PRESENCE_OPTIONS.find((option) => option.value === value)?.label}
        </Badge>
      ) : (
        <SegmentedControl
          label={label}
          options={PRESENCE_OPTIONS}
          value={value}
          onChange={onChange}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function QuestionCard({
  question,
  index,
  total,
  problem,
  readOnly,
  filesAvailable,
  onChange,
  onReplace,
  onMove,
  onRemove,
}: {
  question: FormQuestion;
  index: number;
  total: number;
  problem: string | undefined;
  readOnly: boolean;
  filesAvailable: boolean;
  onChange: (change: Partial<FormQuestion>) => void;
  onReplace: (next: FormQuestion) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const position = index + 1;
  const answered = question.answered ?? 0;
  const kindLabel = QUESTION_KIND_INFO[question.kind].label;
  const isChoice =
    question.kind === "SINGLE_CHOICE" || question.kind === "MULTI_CHOICE";

  return (
    <section
      aria-label={`Question ${position}: ${kindLabel}`}
      data-testid="form-question"
      className={cn(
        "rounded-lg border bg-surface",
        problem ? "border-danger-text" : "border-line",
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="tabular flex size-6 items-center justify-center rounded-full bg-sunken text-meta font-semibold text-muted">
            {position}
          </span>
          <Badge tone="neutral" size="sm">
            {kindLabel}
          </Badge>
          {question.knockout && (
            <Badge tone="warning" size="sm">
              Knockout
            </Badge>
          )}
        </div>
        {!readOnly && (
          <div className="flex items-center gap-0.5">
            <IconButton
              label={`Move question ${position} up`}
              size="sm"
              disabled={index === 0}
              onClick={() => onMove(-1)}
            >
              <ArrowUp aria-hidden="true" className="size-4" />
            </IconButton>
            <IconButton
              label={`Move question ${position} down`}
              size="sm"
              disabled={index === total - 1}
              onClick={() => onMove(1)}
            >
              <ArrowDown aria-hidden="true" className="size-4" />
            </IconButton>
            <IconButton
              label={`Delete question ${position}`}
              size="sm"
              onClick={onRemove}
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </IconButton>
          </div>
        )}
      </header>

      <div className="flex flex-col gap-4 p-4">
        <Field label="Question" required error={problem}>
          <Input
            value={question.label}
            readOnly={readOnly}
            maxLength={220}
            placeholder={placeholderFor(question.kind)}
            onChange={(event) => onChange({ label: event.target.value })}
          />
        </Field>

        <Field label="Helper text" optional help="A line under the question.">
          <Input
            value={question.helper}
            readOnly={readOnly}
            maxLength={320}
            onChange={(event) => onChange({ helper: event.target.value })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Kind of answer"
            {...(answered > 0
              ? {
                  help: `${answered} ${answered === 1 ? "application has" : "applications have"} answered this, so its kind cannot change. Remove it and add a new question instead.`,
                }
              : {})}
          >
            <Select
              value={question.kind}
              disabled={readOnly || answered > 0}
              onChange={(event) =>
                onReplace(
                  changeKind(question, event.target.value as QuestionKind),
                )
              }
            >
              {QUESTION_KINDS.map((kind) => (
                <option
                  key={kind}
                  value={kind}
                  disabled={kind === "FILE" && !filesAvailable}
                >
                  {QUESTION_KIND_INFO[kind].label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex items-end pb-1.5">
            <Switch
              label="Required"
              description="They cannot send without it."
              checked={question.required}
              disabled={readOnly}
              onChange={(event) => onChange({ required: event.target.checked })}
              className="w-full"
            />
          </div>
        </div>

        {question.kind === "LONG_TEXT" && (
          <WordLimitControl
            wordLimit={question.wordLimit}
            readOnly={readOnly}
            onChange={(wordLimit) => onChange({ wordLimit })}
          />
        )}

        {question.kind === "NUMBER" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Smallest allowed" optional>
              <Input
                type="number"
                value={question.min ?? ""}
                readOnly={readOnly}
                onChange={(event) =>
                  onChange({
                    min:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  })
                }
              />
            </Field>
            <Field label="Largest allowed" optional>
              <Input
                type="number"
                value={question.max ?? ""}
                readOnly={readOnly}
                onChange={(event) =>
                  onChange({
                    max:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  })
                }
              />
            </Field>
          </div>
        )}

        {isChoice && (
          <OptionsEditor
            question={question}
            readOnly={readOnly}
            onChange={(options) => onChange({ options })}
          />
        )}

        {question.kind === "YES_NO" && (
          <div className="flex flex-col gap-3 rounded-md bg-canvas p-3.5">
            <Switch
              label="Knockout question"
              description={KNOCKOUT_STATEMENT}
              checked={question.knockout}
              disabled={readOnly}
              onChange={(event) => onChange({ knockout: event.target.checked })}
            />
            {question.knockout && !question.required && (
              <p className="text-body-sm text-warning-text">
                This one is not required, so somebody can skip it and nothing is
                flagged. Switch on Required above if every applicant should
                answer.
              </p>
            )}
            {question.knockout && (
              <Field label="Flag it when the answer is">
                <Select
                  value={question.knockoutWhen}
                  disabled={readOnly}
                  onChange={(event) =>
                    onChange({
                      knockoutWhen: event.target.value as KnockoutAnswer,
                    })
                  }
                >
                  <option value="NO">No</option>
                  <option value="YES">Yes</option>
                </Select>
              </Field>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function placeholderFor(kind: QuestionKind): string {
  switch (kind) {
    case "YES_NO":
      return "Do you have the right to work in Nigeria?";
    case "NUMBER":
      return "How many years have you run payroll?";
    case "URL":
      return "Link to your portfolio";
    case "FILE":
      return "Attach a work sample";
    case "LONG_TEXT":
      return "Why do you want this job?";
    case "SINGLE_CHOICE":
    case "MULTI_CHOICE":
      return "Which of these have you used?";
    default:
      return "What is your current job title?";
  }
}

function WordLimitControl({
  wordLimit,
  readOnly,
  onChange,
}: {
  wordLimit: number | null;
  readOnly: boolean;
  onChange: (next: number | null) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md bg-canvas p-3.5">
      <Switch
        label="Word limit"
        description="A live count shows under the box, and an answer over the limit is refused."
        checked={wordLimit !== null}
        disabled={readOnly}
        onChange={(event) =>
          onChange(event.target.checked ? defaultWordLimit : null)
        }
      />
      {wordLimit !== null && (
        <Field
          label="Most words"
          help={`From ${WORD_LIMIT_MIN} to ${WORD_LIMIT_MAX}.`}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={WORD_LIMIT_MIN}
            max={WORD_LIMIT_MAX}
            value={wordLimit === 0 ? "" : wordLimit}
            readOnly={readOnly}
            onChange={(event) =>
              onChange(
                event.target.value === ""
                  ? 0
                  : Math.trunc(Number(event.target.value)),
              )
            }
          />
        </Field>
      )}
    </div>
  );
}

function OptionsEditor({
  question,
  readOnly,
  onChange,
}: {
  question: FormQuestion;
  readOnly: boolean;
  onChange: (options: FormQuestion["options"]) => void;
}) {
  const { options } = question;
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-body-sm font-medium text-ink">
        Options
      </legend>
      {options.map((option, index) => (
        <div key={option.id} className="flex items-center gap-2">
          <Input
            aria-label={`Option ${index + 1}`}
            value={option.label}
            readOnly={readOnly}
            maxLength={130}
            placeholder={`Option ${index + 1}`}
            onChange={(event) =>
              onChange(
                options.map((entry) =>
                  entry.id === option.id
                    ? { ...entry, label: event.target.value }
                    : entry,
                ),
              )
            }
          />
          {!readOnly && (
            <IconButton
              label={`Remove option ${index + 1}`}
              size="sm"
              disabled={options.length <= 2}
              onClick={() =>
                onChange(options.filter((entry) => entry.id !== option.id))
              }
            >
              <X aria-hidden="true" className="size-4" />
            </IconButton>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          disabled={options.length >= OPTIONS_MAX}
          onClick={() => onChange([...options, blankOption()])}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add option
        </Button>
      )}
    </fieldset>
  );
}
