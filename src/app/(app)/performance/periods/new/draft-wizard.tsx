"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Sparkles, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Disclosure,
  EmptyState,
  Field,
  Input,
  Spinner,
  Textarea,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import type { ApiGrounding, ApiSuggestion } from "@/lib/api/ai";
import { useCan } from "@/lib/permissions";
import {
  useAssistantAvailable,
  usePeriodGoalDraft,
  usePeriodQuestionDraft,
} from "@/lib/store/ai";
import { useCycleMutations, useKpiMutations } from "@/lib/store/performance";

/**
 * A whole appraisal period, from a paragraph.
 *
 * ## What this is for
 *
 * `StartPeriodDialog` creates a period from a name and a date, which is the
 * right shape for somebody who already knows what the period is asking of
 * everybody. Most companies do not: setting a period up means writing company
 * goals, writing the review questions, and choosing what each part is worth,
 * and the honest reason appraisals run late is that nobody wants to start that
 * on a Monday. This is the other door — describe the half in a sentence or two
 * and edit what comes back.
 *
 * The dialog is not replaced and must not be. Somebody who knows their own
 * period should not have to explain it to a model first.
 *
 * ## Nothing is written until the last screen
 *
 * Every step before **Review** holds its state in this component. A wizard
 * abandoned halfway leaves no half-built period, no orphaned goals and no cycle
 * with nothing in it — which is what a create-as-you-go wizard would leave, and
 * what somebody would then have to find and delete.
 *
 * The last screen calls the ordinary endpoints in order: `createCycle`, then
 * `createGoal` per kept goal, then `addKeyResult` for each measure that has a
 * target typed, then `addQuestion` per kept question. There is no
 * "accept draft" endpoint and there must not be one — a suggestion somebody
 * kept and a sentence somebody typed are the same row, and the difference is
 * only who did the typing.
 *
 * ## Targets are the person's, and the API agrees
 *
 * The model is told twice not to invent a target and the prompt says so in as
 * many words. It is not relied on: `CreateKeyResultBody.targetValue` is
 * **required**, so a measure with no figure cannot be created at all. A
 * suggested measure with an empty target box is simply not written, and the
 * review screen says how many were left out rather than dropping them quietly.
 *
 * That is the difference between a rule in a prompt and a rule in a type.
 *
 * ## Steps are chosen by id, never by index
 *
 * `people/new` records why: the step list can change under somebody mid-form,
 * and by index that moves them to whatever happens to sit at 2. Here the
 * questions step is skipped when the draft came back empty, so the list really
 * does change.
 */

type StepId = "describe" | "goals" | "questions" | "review";

/** A goal on screen: what was suggested, as the person has edited it. */
type DraftGoal = {
  id: string;
  title: string;
  detail: string;
  measures: { label: string; unit: string; target: string }[];
};

type DraftQuestion = { id: string; prompt: string };

/**
 * What somebody changed, as a diff over what was drafted.
 *
 * The obvious shape is one `useState` holding the edited list, seeded from the
 * draft when it arrives. That seeding has to happen *somewhere*, and both
 * places are wrong: during render it is a `setState` in the render phase, and
 * in an effect it is the cascading render `lib/store/my-record.ts` was
 * restructured to remove.
 *
 * So the draft stays the source of truth and is derived during render, and this
 * holds only what was typed over it — the same reasoning as
 * `store/employees.ts`'s overrides: *a diff, not a copy*. Nothing has to be
 * seeded, so nothing has to decide when to seed it.
 */
type GoalEdit = {
  title?: string;
  detail?: string;
  /** By position in the drafted measure list. */
  targets?: Record<number, string>;
};

/** The measures a suggestion carried, if it carried any that parse. */
function measuresOf(
  suggestion: ApiSuggestion,
): { label: string; unit: string; target: string }[] {
  const raw = suggestion.fields?.["measures"];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const row = entry as Record<string, unknown>;
    const label = typeof row["label"] === "string" ? row["label"].trim() : "";
    if (!label) return [];
    return [
      {
        label,
        unit: typeof row["unit"] === "string" ? row["unit"].trim() : "",
        /* Always empty. Whatever the model may have put here is not read —
           see the header. The person types it or the measure is not created. */
        target: "",
      },
    ];
  });
}

/** What the draft was built from, shown on request and never paraphrased. */
function Grounded({ grounding }: { grounding: ApiGrounding }) {
  return (
    <Disclosure
      title="What this was drafted from"
      level={3}
      hint={`Drafted from ${grounding.summary}.`}
    >
      <ul className="flex list-disc flex-col gap-1 pl-5 text-body-sm text-body">
        {grounding.facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
    </Disclosure>
  );
}

export function DraftPeriodWizard() {
  const router = useRouter();
  const toast = useToast();
  const canManage = useCan("MANAGE_SETTINGS");
  const assistant = useAssistantAvailable();
  const goalDraft = usePeriodGoalDraft();
  const questionDraft = usePeriodQuestionDraft();
  const cycles = useCycleMutations();
  const kpis = useKpiMutations();

  const [step, setStep] = useState<StepId>("describe");
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  /* The edits, over the draft. Nothing seeds these — see `GoalEdit`. */
  const [goalEdits, setGoalEdits] = useState<Record<string, GoalEdit>>({});
  const [goalsDropped, setGoalsDropped] = useState<string[]>([]);
  const [questionEdits, setQuestionEdits] = useState<Record<string, string>>({});
  const [questionsDropped, setQuestionsDropped] = useState<string[]>([]);

  const drafting = goalDraft.loading || questionDraft.loading;

  const goalOutcome = goalDraft.outcome;
  const questionOutcome = questionDraft.outcome;

  const goals: DraftGoal[] = useMemo(() => {
    if (!goalOutcome?.available) return [];
    return goalOutcome.suggestions
      .map((suggestion, index) => {
        const id = `g${String(index)}`;
        const edit = goalEdits[id] ?? {};
        return {
          id,
          title: edit.title ?? suggestion.title,
          detail: edit.detail ?? suggestion.detail,
          measures: measuresOf(suggestion).map((measure, at) => ({
            ...measure,
            target: edit.targets?.[at] ?? "",
          })),
        };
      })
      .filter((goal) => !goalsDropped.includes(goal.id));
  }, [goalOutcome, goalEdits, goalsDropped]);

  const questions: DraftQuestion[] = useMemo(() => {
    if (!questionOutcome?.available) return [];
    return questionOutcome.suggestions
      .map((suggestion, index) => {
        const id = `q${String(index)}`;
        return { id, prompt: questionEdits[id] ?? suggestion.title };
      })
      .filter((question) => !questionsDropped.includes(question.id));
  }, [questionOutcome, questionEdits, questionsDropped]);

  const editGoal = (id: string, patch: GoalEdit) =>
    setGoalEdits((rows) => ({ ...rows, [id]: { ...rows[id], ...patch } }));

  const setTarget = (id: string, at: number, value: string) =>
    setGoalEdits((rows) => ({
      ...rows,
      [id]: { ...rows[id], targets: { ...rows[id]?.targets, [at]: value } },
    }));

  /* The form must not render before the answer arrives.
     ---------------------------------------------------
     `useAssistantAvailable`'s own header makes this argument the other way
     round — a Suggest button that appears a moment after the form is worse than
     one that was never there. Here it is the whole screen, so the same mistake
     is louder: the form rendered, then vanished under somebody who might
     already have typed the period's name into it. */
  if (assistant.loading) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ href: "/performance", label: "Performance" }]}
          title="Draft a period"
        />
        <PageBody className="flex items-center justify-center py-24">
          <Spinner />
          <span className="sr-only">Loading</span>
        </PageBody>
      </>
    );
  }

  /* Absent, not disabled. With no assistant there is nothing this screen can
     do, and the dialog on `/performance` is the path that still works. */
  if (!assistant.available) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ href: "/performance", label: "Performance" }]}
          title="Draft a period"
        />
        <PageBody>
          <EmptyState
            icon={<Sparkles aria-hidden="true" />}
            title="No assistant is connected"
            description={
              assistant.reason ??
              "This screen drafts a period from a description, which needs an assistant. Starting one by hand works exactly as it did."
            }
            action={
              <div className="flex flex-wrap gap-2">
                <ButtonLink href="/performance" variant="accent">
                  Start one by hand
                </ButtonLink>
                {canManage && (
                  <ButtonLink href="/settings/ai" variant="secondary">
                    About the assistant
                  </ButtonLink>
                )}
              </div>
            }
          />
        </PageBody>
      </>
    );
  }

  const draft = async () => {
    /* Both at once. They are independent calls and the wizard keeps whichever
       arrives — see the header on why questions are a separate request. */
    await Promise.all([
      goalDraft.ask({ text }),
      questionDraft.ask({ text }),
    ]);
    setStep("goals");
  };

  const measuresWithTargets = goals.flatMap((goal) =>
    goal.measures.filter((measure) => measure.target.trim() !== ""),
  );
  const measuresWithout = goals.flatMap((goal) =>
    goal.measures.filter((measure) => measure.target.trim() === ""),
  );

  /**
   * The only screen that writes.
   *
   * Order matters: the cycle first, because a goal names it; then the goals,
   * because a measure hangs off one. A failure part-way leaves what was already
   * created — deliberately, because the alternative is deleting a period
   * somebody may have wanted — and the toast names where it stopped so nobody
   * has to guess whether to start again or carry on from the period screen.
   */
  const create = async () => {
    setSaving(true);
    let cycleId: string | null = null;
    try {
      const cycle = await cycles.createCycle(
        name.trim(),
        dueDate === "" ? undefined : dueDate,
      );
      cycleId = cycle.id;

      for (const goal of goals) {
        const created = await kpis.createGoal({
          title: goal.title.trim(),
          ...(goal.detail.trim() ? { description: goal.detail.trim() } : {}),
          /* A company goal: explicitly ownerless rather than mine. The API
             gates that on EDIT_RECORDS, because everybody can then read it. */
          ownerId: null,
          reviewCycleId: cycle.id,
        });

        for (const measure of goal.measures) {
          const target = measure.target.trim();
          /* No target, no measure. The API would refuse it anyway. */
          if (target === "") continue;
          await kpis.addKeyResult(created.id, {
            label: measure.label.trim(),
            ...(measure.unit.trim() ? { unit: measure.unit.trim() } : {}),
            targetValue: target,
          });
        }
      }

      for (const question of questions) {
        if (question.prompt.trim() === "") continue;
        await cycles.addQuestion(cycle.id, { prompt: question.prompt.trim() });
      }

      toast.push({
        title: `${name.trim()} is ready to set up`,
        tone: "success",
        detail:
          "Nobody has been asked anything yet — starting it is the next screen.",
      });
      router.push(`/performance/periods/${cycle.id}`);
    } catch (caught) {
      toast.push({
        title: cycleId
          ? "The period was created, but not everything on it was"
          : "The period could not be created",
        tone: "danger",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
      /* It exists, so send them to it rather than leaving them on a form whose
         first action would create a second one. */
      if (cycleId) router.push(`/performance/periods/${cycleId}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/performance", label: "Performance" }]}
        title="Draft a period"
        action={
          <Badge tone="accent" size="sm" icon={<Sparkles aria-hidden="true" />}>
            {step === "describe"
              ? "Step 1 of 4"
              : step === "goals"
                ? "Step 2 of 4"
                : step === "questions"
                  ? "Step 3 of 4"
                  : "Step 4 of 4"}
          </Badge>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {/* ------------------------------------------------------- describe */}
        {step === "describe" && (
          <Card>
            <CardHeader
              title="Describe the period"
              description="A sentence or two about what this half is asking of everybody. What comes back is a draft you edit — nothing is created until the last screen."
            />
            <CardBody className="flex flex-col gap-4">
              <Field label="What to call it" required>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="H1 2027 appraisal"
                />
              </Field>

              <Field
                label="Answers due"
                help="Optional. It is what the reminders count back from."
              >
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </Field>

              <Field
                label="What the period is about"
                required
                help="Your own words. It is sent as something the assistant is told, never as an instruction it follows."
              >
                <Textarea
                  rows={4}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Half-year review for the Lagos sales team. Recurring revenue up, churn down, and I care about response time."
                />
              </Field>

              {goalDraft.error && (
                <Callout tone="danger" title="That did not work">
                  {goalDraft.error}
                </Callout>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="accent"
                  onClick={() => void draft()}
                  disabled={
                    drafting || name.trim() === "" || text.trim().length < 20
                  }
                >
                  {drafting ? <Spinner size="sm" /> : null}
                  {drafting ? "Drafting" : "Draft it"}
                  {!drafting && <ArrowRight aria-hidden="true" className="size-3.5" />}
                </Button>
                <ButtonLink href="/performance" variant="ghost">
                  Cancel
                </ButtonLink>
              </div>

              {text.trim() !== "" && text.trim().length < 20 && (
                <p className="text-meta text-muted">
                  Say a little more about the period — a sentence or two.
                </p>
              )}
            </CardBody>
          </Card>
        )}

        {/* ---------------------------------------------------------- goals */}
        {step === "goals" && (
          <Card>
              <CardHeader
                title="The company goals"
                description="Edit anything. Delete what you would not have written. Each measure needs a target from you — one without a figure is not created, because a target nobody set is not a target."
              />
              <CardBody className="flex flex-col gap-4">
                {goalDraft.outcome?.available === false ? (
                  <Callout tone="warning" title="Nothing was drafted">
                    {goalDraft.outcome.reason}
                  </Callout>
                ) : goals.length === 0 ? (
                  <EmptyState
                    compact
                    title="No goals came back"
                    description="Write them on the period itself instead."
                  />
                ) : (
                  goals.map((goal, index) => (
                    <div
                      key={goal.id}
                      className="flex flex-col gap-3 rounded-md border border-line p-4"
                    >
                      <div className="flex items-start gap-2">
                        <span className="min-w-0 flex-1">
                          <Field label={`Goal ${String(index + 1)}`}>
                            <Input
                              value={goal.title}
                              onChange={(event) =>
                                editGoal(goal.id, { title: event.target.value })
                              }
                            />
                          </Field>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-6"
                          onClick={() =>
                            setGoalsDropped((ids) => [...ids, goal.id])
                          }
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                          <span className="sr-only">Delete this goal</span>
                        </Button>
                      </div>

                      <Field label="What delivering it looks like">
                        <Textarea
                          rows={2}
                          value={goal.detail}
                          onChange={(event) =>
                            editGoal(goal.id, { detail: event.target.value })
                          }
                        />
                      </Field>

                      {goal.measures.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <p className="text-meta font-semibold text-muted">
                            Measures
                          </p>
                          {goal.measures.map((measure, at) => (
                            <div
                              key={`${goal.id}-${String(at)}`}
                              className="flex flex-wrap items-end gap-2"
                            >
                              <span className="min-w-40 flex-1 text-body-sm text-body">
                                {measure.label}
                                {measure.unit && (
                                  <span className="text-muted">
                                    {" "}
                                    ({measure.unit})
                                  </span>
                                )}
                              </span>
                              <span className="w-36">
                                <Field label="Target">
                                  <Input
                                    inputMode="decimal"
                                    value={measure.target}
                                    placeholder="You set this"
                                    onChange={(event) =>
                                      setTarget(goal.id, at, event.target.value)
                                    }
                                  />
                                </Field>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}

                {goalDraft.outcome && (
                  <Grounded grounding={goalDraft.outcome.groundedIn} />
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setStep("describe")}
                  >
                    <ArrowLeft aria-hidden="true" className="size-3.5" />
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="accent"
                    onClick={() => setStep("questions")}
                  >
                    Next: the questions
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Button>
                </div>
              </CardBody>
          </Card>
        )}

        {/* ------------------------------------------------------ questions */}
        {step === "questions" && (
          <Card>
              <CardHeader
                title="What the form asks"
                description="Everybody answers these about their own work, and their manager answers the same ones about it. More can be added on the period itself."
              />
              <CardBody className="flex flex-col gap-4">
                {questionDraft.outcome?.available === false ? (
                  <Callout tone="warning" title="No questions were drafted">
                    {questionDraft.outcome.reason} You can write them on the
                    period itself.
                  </Callout>
                ) : questions.length === 0 ? (
                  <EmptyState
                    compact
                    title="No questions came back"
                    description="Write them on the period itself instead. A period cannot start without at least one."
                  />
                ) : (
                  questions.map((question, index) => (
                    <div key={question.id} className="flex items-start gap-2">
                      <span className="min-w-0 flex-1">
                        <Field label={`Question ${String(index + 1)}`}>
                          <Textarea
                            rows={2}
                            value={question.prompt}
                            onChange={(event) =>
                              setQuestionEdits((rows) => ({
                                ...rows,
                                [question.id]: event.target.value,
                              }))
                            }
                          />
                        </Field>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-6"
                        onClick={() =>
                          setQuestionsDropped((ids) => [...ids, question.id])
                        }
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                        <span className="sr-only">Delete this question</span>
                      </Button>
                    </div>
                  ))
                )}

                {questionDraft.outcome && (
                  <Grounded grounding={questionDraft.outcome.groundedIn} />
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setStep("goals")}
                  >
                    <ArrowLeft aria-hidden="true" className="size-3.5" />
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="accent"
                    onClick={() => setStep("review")}
                  >
                    Next: review it
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Button>
                </div>
              </CardBody>
          </Card>
        )}

        {/* --------------------------------------------------------- review */}
        {step === "review" && (
          <Card>
            <CardHeader
              title="Review it"
              description="This is the only screen that writes anything. Nothing has been created yet."
            />
            <CardBody className="flex flex-col gap-4">
              <dl className="flex flex-col gap-2 text-body-sm">
                <div className="flex flex-wrap gap-2">
                  <dt className="text-muted">Period</dt>
                  <dd className="font-medium text-ink">{name.trim()}</dd>
                </div>
                <div className="flex flex-wrap gap-2">
                  <dt className="text-muted">Answers due</dt>
                  <dd className="text-ink">
                    {dueDate === "" ? "Not set" : dueDate}
                  </dd>
                </div>
                <div className="flex flex-wrap gap-2">
                  <dt className="text-muted">Company goals</dt>
                  <dd className="text-ink">{goals.length}</dd>
                </div>
                <div className="flex flex-wrap gap-2">
                  <dt className="text-muted">Measures with a target</dt>
                  <dd className="text-ink">{measuresWithTargets.length}</dd>
                </div>
                <div className="flex flex-wrap gap-2">
                  <dt className="text-muted">Questions</dt>
                  <dd className="text-ink">{questions.length}</dd>
                </div>
              </dl>

              {/* Named rather than dropped. A measure that silently did not
                  appear is one somebody discovers is missing at the appraisal. */}
              {measuresWithout.length > 0 && (
                <Callout tone="warning" title="Some measures have no target">
                  {measuresWithout.length === 1
                    ? "1 measure has no target typed, so it will not be created: "
                    : `${measuresWithout.length} measures have no target typed, so they will not be created: `}
                  {measuresWithout.map((measure) => measure.label).join(", ")}.
                  You can add them on the goal once you know the figures.
                </Callout>
              )}

              {questions.length === 0 && (
                <Callout tone="warning" title="No questions yet">
                  A period cannot start without at least one question. The
                  period will be created as a draft and you can write them on it.
                </Callout>
              )}

              <Callout tone="info" title="Nobody is asked anything yet">
                This creates the period as a **draft**. Starting it is a
                separate press on the period&rsquo;s own screen, which is where
                you set the weights and check who appraises whom.
              </Callout>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStep("questions")}
                  disabled={saving}
                >
                  <ArrowLeft aria-hidden="true" className="size-3.5" />
                  Back
                </Button>
                <Button
                  type="button"
                  variant="accent"
                  onClick={() => void create()}
                  disabled={saving || name.trim() === ""}
                >
                  {saving ? <Spinner size="sm" /> : null}
                  {saving
                    ? "Creating"
                    : `Create ${name.trim() === "" ? "the period" : name.trim()}`}
                </Button>
              </div>
            </CardBody>
          </Card>
        )}
      </PageBody>
    </>
  );
}
