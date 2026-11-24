"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import {
  Button,
  Checkbox,
  Field,
  IconButton,
  Input,
  Select,
} from "@/components/ui";

import { LoadState } from "@/components/ui/load-state";
import { WizardShell } from "@/components/performance/wizard-shell";
import { actionMessage } from "@/lib/use-action";
import type { ApiQuestion } from "@/lib/api/performance";
import {
  ANSWER_LABEL,
  DEFAULT_WHO,
  GROUP_TITLE,
  WHO_LABEL,
  answerOf,
  audienceOf,
  countWords,
  createBody,
  groupForComponent,
  groupsOf,
  whoOf,
  type Answer,
  type QuestionGroup,
  type Who,
} from "@/lib/performance/question-groups";
import {
  QUESTION_MAX_LENGTH,
  questionCounter,
  questionWordingProblem,
} from "@/lib/performance/question-limits";
import {
  useAppraisals,
  useCycleMutations,
  useCycleQuestions,
  useFramework,
  useSections,
} from "@/lib/store/performance";

/** The five questions before this (period, due date, scope, reminder, managers). */
const BEFORE = 5;

/**
 * Add questions: the step after a period is created (owner request, 24 Nov
 * 2026), on its own full page like the steps before it.
 *
 * The usual questions are already in, so nothing has to be added: the first
 * time a draft period with none opens here, the standard self and manager
 * questions are put in. Each group is one screen, in the order the review flow
 * asks them; add, edit, reorder or remove on it; the last screen counts each
 * group and Finish lands on the period. A period that has started is read
 * only, and says so in one line.
 */
export function QuestionsWizard({ cycleId }: { cycleId: string }) {
  const router = useRouter();
  const { cycles } = useAppraisals();
  const period = cycles.find((one) => one.id === cycleId) ?? null;
  const editable = period !== null && period.stage === "DRAFT";
  const mutations = useCycleMutations();
  const { questions, loading, error, reload } = useCycleQuestions(cycleId);
  const { competencies } = useFramework();
  const { sections } = useSections();

  const [step, setStep] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);

  /* The standard set, once, for a draft that has no questions at all. */
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !editable || loading || error || questions.length > 0)
      return;
    seeded.current = true;
    void mutations
      .addStandardQuestions(cycleId)
      .then(reload)
      .catch((caught: unknown) =>
        setFailed(actionMessage(caught, "the standard questions")),
      );
  }, [editable, loading, error, questions.length, cycleId, mutations, reload]);

  const sectionGroup = new Map(
    sections.map((section) => [
      section.id,
      groupForComponent(section.component),
    ]),
  );
  const groupOfCompetency = new Map(
    competencies.map((one) => [
      one.id,
      one.sectionId ? (sectionGroup.get(one.sectionId) ?? null) : null,
    ]),
  );
  const hasLeadership = sections.some(
    (section) => groupForComponent(section.component) === "leadership",
  );
  const groups: QuestionGroup[] = [
    "self",
    "manager",
    "core",
    "behavioural",
    ...(hasLeadership ? (["leadership"] as const) : []),
  ];
  const total = BEFORE + groups.length + 1;
  const group = groups[step] ?? null;
  const inGroup = (which: QuestionGroup) =>
    questions.filter((q) => groupsOf(q, groupOfCompetency).includes(which));

  const finish = () => router.push(`/performance/periods/${cycleId}`);
  const last = step === groups.length;

  return (
    <WizardShell
      open
      onClose={finish}
      step={BEFORE + step}
      total={total}
      title={group ? GROUP_TITLE[group] : "Review and finish"}
      onBack={step > 0 ? () => setStep(step - 1) : undefined}
      onNext={last ? finish : () => setStep(step + 1)}
      nextLabel={last ? "Finish" : "Continue"}
      extra={
        !last ? (
          <Button type="button" variant="secondary" onClick={finish}>
            Use the defaults and finish
          </Button>
        ) : undefined
      }
      error={failed}
    >
      <LoadState
        loading={loading || period === null}
        error={error}
        subject="the questions"
        onRetry={reload}
        hasData={questions.length > 0}
        skeleton="list"
      >
        {!editable && (
          <p className="text-body-sm text-muted">
            This period has started, so its questions can no longer change.
          </p>
        )}
        {group ? (
          <GroupStep
            key={group}
            group={group}
            editable={editable}
            questions={inGroup(group)}
            all={questions}
            cycleId={cycleId}
            competencies={competencies.filter(
              (one) =>
                !one.archived &&
                one.active &&
                groupOfCompetency.get(one.id) === group,
            )}
            reload={reload}
            onError={setFailed}
          />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {groups.map((which) => (
              <li
                key={which}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-body-sm"
              >
                <span className="text-ink">{GROUP_TITLE[which]}</span>
                <span className="text-muted">
                  {countWords(inGroup(which).length)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </LoadState>
    </WizardShell>
  );
}

function GroupStep({
  group,
  editable,
  questions,
  all,
  cycleId,
  competencies,
  reload,
  onError,
}: {
  group: QuestionGroup;
  editable: boolean;
  questions: ApiQuestion[];
  all: ApiQuestion[];
  cycleId: string;
  competencies: { id: string; name: string }[];
  reload: () => void;
  onError: (message: string | null) => void;
}) {
  const mutations = useCycleMutations();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ApiQuestion | null>(null);
  const filed =
    group === "core" || group === "behavioural" || group === "leadership";

  const run = async (act: () => Promise<unknown>, what: string) => {
    onError(null);
    try {
      await act();
      reload();
    } catch (caught) {
      onError(actionMessage(caught, what));
    }
  };

  const move = (question: ApiQuestion, by: -1 | 1) => {
    const order = all.map((q) => q.id);
    const from = order.indexOf(question.id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    next.splice(to, 0, ...next.splice(from, 1));
    void run(() => mutations.reorderQuestions(cycleId, next), "the order");
  };

  return (
    <div className="flex flex-col gap-4">
      {questions.length === 0 ? (
        <p className="text-body-sm text-muted">No questions here yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {questions.map((question) => (
            <li
              key={question.id}
              className="flex items-start justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="break-words text-body-sm text-ink">
                  {question.prompt}
                </p>
                <p className="mt-0.5 text-meta text-muted">
                  {[
                    ANSWER_LABEL[answerOf(question.kind)],
                    WHO_LABEL[whoOf(question.askedOf)],
                    question.required ? "Must be answered" : "Optional",
                    question.competencyName ?? null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {editable && !question.answersSubsection && (
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    label="Move up"
                    variant="ghost"
                    onClick={() => move(question, -1)}
                  >
                    <ArrowUp aria-hidden="true" className="size-4" />
                  </IconButton>
                  <IconButton
                    label="Move down"
                    variant="ghost"
                    onClick={() => move(question, 1)}
                  >
                    <ArrowDown aria-hidden="true" className="size-4" />
                  </IconButton>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAdding(false);
                      setEditing(question);
                    }}
                  >
                    Edit
                  </Button>
                  <IconButton
                    label={`Remove: ${question.prompt}`}
                    variant="ghost"
                    onClick={() =>
                      void run(
                        () => mutations.removeQuestion(question.id),
                        "the question",
                      )
                    }
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </IconButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && editing && (
        <QuestionForm
          key={editing.id}
          group={group}
          filed={filed}
          competencies={competencies}
          initial={editing}
          submitLabel="Save question"
          onCancel={() => setEditing(null)}
          onSubmit={async (value) => {
            await mutations.updateQuestion(editing.id, {
              prompt: value.prompt.trim(),
              required: value.required,
              askedOf: audienceOf(value.who),
            });
            setEditing(null);
            reload();
          }}
        />
      )}
      {editable && adding && !editing && (
        <QuestionForm
          group={group}
          filed={filed}
          competencies={competencies}
          submitLabel="Add question"
          onCancel={() => setAdding(false)}
          onSubmit={async (value) => {
            await mutations.addQuestion(
              cycleId,
              createBody({
                prompt: value.prompt,
                answer: value.answer,
                who: value.who,
                required: value.required,
                competencyId: value.competencyId,
              }),
            );
            setAdding(false);
            reload();
          }}
        />
      )}
      {editable && !adding && !editing && (
        <Button
          type="button"
          variant="secondary"
          className="self-start"
          onClick={() => setAdding(true)}
        >
          Add a question
        </Button>
      )}
    </div>
  );
}

type FormValue = {
  prompt: string;
  answer: Answer;
  who: Who;
  required: boolean;
  competencyId: string;
};

function QuestionForm({
  group,
  filed,
  competencies,
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  group: QuestionGroup;
  filed: boolean;
  competencies: { id: string; name: string }[];
  initial?: ApiQuestion;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (value: FormValue) => Promise<void>;
}) {
  const [value, setValue] = useState<FormValue>({
    prompt: initial?.prompt ?? "",
    answer: initial ? answerOf(initial.kind) : "TEXT",
    who: initial ? whoOf(initial.askedOf) : DEFAULT_WHO[group],
    required: initial?.required ?? true,
    competencyId: initial?.competencyId ?? competencies[0]?.id ?? "",
  });
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const counter = questionCounter(value.prompt);

  const submit = async () => {
    const wording = questionWordingProblem(value.prompt);
    if (wording) return setProblem(wording);
    if (filed && !initial && value.competencyId === "")
      return setProblem("Choose the subsection it belongs to.");
    setSaving(true);
    setProblem(null);
    try {
      await onSubmit(value);
    } catch (caught) {
      setProblem(actionMessage(caught, "the question"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <Field
        label="Question"
        {...(counter ? { help: counter } : {})}
        {...(problem ? { error: problem } : {})}
      >
        <Input
          value={value.prompt}
          onChange={(event) =>
            setValue({ ...value, prompt: event.target.value })
          }
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.stopPropagation();
              void submit();
            }
          }}
          autoFocus
        />
      </Field>
      {!initial && (
        <Field label="Answer type">
          <Select
            value={value.answer}
            onChange={(event) =>
              setValue({ ...value, answer: event.target.value as Answer })
            }
          >
            {(Object.keys(ANSWER_LABEL) as Answer[]).map((key) => (
              <option key={key} value={key}>
                {ANSWER_LABEL[key]}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Who answers">
        <Select
          value={value.who}
          onChange={(event) =>
            setValue({ ...value, who: event.target.value as Who })
          }
        >
          {(Object.keys(WHO_LABEL) as Who[]).map((key) => (
            <option key={key} value={key}>
              {WHO_LABEL[key]}
            </option>
          ))}
        </Select>
      </Field>
      {filed && !initial && (
        <Field label="Subsection">
          {competencies.length > 0 ? (
            <Select
              value={value.competencyId}
              onChange={(event) =>
                setValue({ ...value, competencyId: event.target.value })
              }
            >
              {competencies.map((one) => (
                <option key={one.id} value={one.id}>
                  {one.name}
                </option>
              ))}
            </Select>
          ) : (
            <p className="text-body-sm text-muted">
              There is no subsection here yet.{" "}
              <Link
                href="/settings/performance"
                className="text-accent-text underline-offset-2 hover:underline"
              >
                Add one first
              </Link>
              .
            </p>
          )}
        </Field>
      )}
      <Checkbox
        label="Must be answered"
        checked={value.required}
        onChange={(event) =>
          setValue({ ...value, required: event.target.checked })
        }
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="accent"
          loading={saving}
          onClick={() => void submit()}
        >
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p className="sr-only">{QUESTION_MAX_LENGTH} characters at most</p>
    </div>
  );
}
