"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  Clock,
  Target,
  User,
  Users,
} from "lucide-react";
import {
  Button,
  Checkbox,
  Field,
  FieldSet,
  Illustration,
  Input,
  RadioCard,
  Select,
  SuccessMoment,
  Textarea,
} from "@/components/ui";
import { WizardShell } from "@/components/performance/wizard-shell";
import {
  SuggestButton,
  SuggestionPanel,
} from "@/components/performance/suggestions";
import type { ApiGoal, ApiObjectiveSubmitted } from "@/lib/api/performance";
import { quarterLabel } from "@/lib/api/performance";
import {
  BLANK_OBJECTIVE,
  OBJECTIVE_STEPS,
  STEP_TITLES,
  draftIsBlank,
  goalBodyOf,
  hasProblems,
  keyResultBodyOf,
  levelFromWhose,
  levelsOffered,
  needsPeriod,
  periodsTakingObjectives,
  stepProblems,
  type ObjectiveDraft,
  type ObjectiveLevel,
  type StepProblems,
  type TargetChoice,
} from "@/lib/performance/objective-wizard";
import { useCan } from "@/lib/permissions";
import { useObjectiveSuggestions } from "@/lib/store/ai";
import { useDepartments } from "@/lib/store/departments";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useObjectiveDraft } from "@/lib/store/objective-draft";
import {
  useAppraisals,
  useKpiMutations,
  useKpis,
  useObjectiveMutations,
  type KpiScope,
} from "@/lib/store/performance";
import { useSession } from "@/lib/store/session";
import { actionMessage } from "@/lib/use-action";
import {
  quarterOptions,
  quarterText,
  useLeadReach,
  useQuarterToday,
} from "../../goal-dialogs";
import {
  defaultPeriodId,
  objectiveWhoseChoices,
  peopleILead,
} from "../../goal-facts";
import { sentToAgreeCopy } from "../../objective-copy";

/**
 * New objective, one question to a screen (owner request, 24 Nov 2026).
 *
 * It was a dialog of seven fields with no target in it: an objective was made,
 * and its target was a second dialog somebody had to know to open. Here the
 * target is the second question, and the last screen sends it to be agreed or
 * keeps it as a draft.
 *
 * ## What is written, and when
 *
 * Nothing until the last screen. Then, in order: the objective, its target,
 * and (for "Send to be agreed") the send. Each later step can fail on its own,
 * so what has already been written is remembered and a second press carries
 * on from there rather than making the objective twice. The message says what
 * is saved and what is not.
 *
 * ## A draft kept if they leave
 *
 * `lib/store/objective-draft.ts`: kept in this browser on every change, for
 * this account, and carried on from the next time the wizard opens. Writing the
 * objective throws it away.
 */

const SCREENS = OBJECTIVE_STEPS.length;

type Written = { goal: ApiGoal | null; target: boolean };

type Finished =
  | { kind: "sent"; goal: ApiGoal; sentTo: string[] | undefined }
  | { kind: "draft"; goal: ApiGoal };

export function ObjectiveWizard({
  parent,
  back,
}: {
  /** The objective it goes under, from "Add an objective under this". */
  parent: string | null;
  /** Where Cancel and the X go: the Objectives address it was opened from. */
  back: string;
}) {
  const router = useRouter();
  const { employeeId, user, actingId } = useSession();
  const owner = user?.id ?? (actingId || null);
  const canSetCompanyWide = useCan("EDIT_RECORDS");
  const mutations = useKpiMutations();
  const objectives = useObjectiveMutations();
  const suggestions = useObjectiveSuggestions();

  /* ---------------------------------------------------------- what to offer */

  const reach = useLeadReach();
  const { flat: allDepartments } = useDepartments();
  const departments = allDepartments.filter(
    (department) =>
      !department.archived &&
      (canSetCompanyWide ||
        (employeeId !== null && department.headId === employeeId)),
  );
  const { people } = useEmployeeDirectory({ pageSize: 200 });
  const led = peopleILead(people, reach).filter(
    (person) => person.id !== employeeId,
  );
  const levels = levelsOffered({
    canSetCompanyWide,
    departments,
    hasStaffRecord: employeeId !== null,
    leadsAnybody: led.length > 0,
  });
  const whose = objectiveWhoseChoices({
    departments: allDepartments,
    employeeId,
    canSetCompanyWide,
  });

  const { cycles, loading: periodsLoading } = useAppraisals();
  const openPeriods = periodsTakingObjectives(cycles);
  const quarters = quarterOptions(useQuarterToday());

  /* What it can support: the objectives this person can see, at the widest
     reading they have. A finished one is not something new work supports. */
  const scope: KpiScope = canSetCompanyWide
    ? "company"
    : reach.headedDepartmentIds.size > 0 || led.length > 0
      ? "team"
      : "mine";
  const visible = useKpis(scope);
  const parents = useMemo(
    () =>
      visible.goals
        .filter(
          (goal) => goal.status !== "DONE" && goal.approval !== "REJECTED",
        )
        .sort((a, b) => a.title.localeCompare(b.title)),
    [visible.goals],
  );

  /* ------------------------------------------------------------ the answers */

  const { kept, keep, discard } = useObjectiveDraft(owner);
  const [draft, setDraft] = useState<ObjectiveDraft>(() => ({
    ...BLANK_OBJECTIVE,
    parentId: parent ?? "",
  }));
  const [step, setStep] = useState(0);
  /* Whether anything has been answered here yet: a draft kept from last time
     arrives a moment after the first render (storage is read after
     hydration), and is carried on from only if nothing has been typed. */
  const [touched, setTouched] = useState(false);
  const [resumed, setResumed] = useState(false);
  if (!touched && kept && !resumed) {
    setResumed(true);
    setTouched(true);
    setDraft({ ...kept.draft, parentId: parent ?? kept.draft.parentId });
    setStep(Math.min(kept.step, SCREENS - 1));
  }

  const [problems, setProblems] = useState<StepProblems>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"send" | "draft" | null>(null);
  const [written, setWritten] = useState<Written>({
    goal: null,
    target: false,
  });
  const [finished, setFinished] = useState<Finished | null>(null);

  /* The starting answers follow what has loaded, until somebody chooses. */
  const start = levelFromWhose(whose.fallback);
  const level: ObjectiveLevel =
    draft.level ??
    (levels.includes(start.level) ? start.level : (levels[0] ?? "person"));
  const departmentId =
    draft.departmentId ||
    (level === "department" && start.level === "department"
      ? start.departmentId
      : level === "department" && departments.length === 1
        ? (departments[0]?.id ?? "")
        : "");
  const personId =
    employeeId === null && draft.personId === "me"
      ? (led[0]?.id ?? "")
      : draft.personId;
  const effective: ObjectiveDraft = {
    ...draft,
    level,
    departmentId,
    personId,
  };
  const quarter = draft.quarter || quarters[1] || quarters[0] || "";
  const reviewCycleId =
    draft.periodId ?? (level === "person" ? defaultPeriodId(openPeriods) : "");
  const context = { reviewCycleId, openPeriods: openPeriods.length };
  /* Until the company's periods arrive there is no knowing whether this has
     one to be filed in, and one written in that moment would be filed in
     none. A draft carried on lands on the last screen at once, so the wait
     is on the last screen as well as the period's. */
  const periodsPending = periodsLoading === true && cycles.length === 0;

  const update = (patch: Partial<ObjectiveDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setTouched(true);
    setProblems({});
    if (draftIsBlank(next)) discard();
    else keep(next, step);
  };

  const go = (to: number) => {
    setResumed(false);
    setStep(to);
    setProblems({});
    setError(null);
    if (!draftIsBlank(draft)) keep(draft, to);
  };

  const leave = () => {
    /* What was typed is kept already; leaving changes nothing but the page. */
    router.push(back);
  };

  const screen = OBJECTIVE_STEPS[step] ?? "aim";

  const next = () => {
    const found = stepProblems(screen, effective, context);
    if (hasProblems(found)) {
      setProblems(found);
      return;
    }
    if (screen === "review") {
      void finish("send");
      return;
    }
    go(step + 1);
  };

  /* -------------------------------------------------------------- writing */

  const finish = async (how: "send" | "draft") => {
    /* Every answer is checked again before anything is written: a draft
       carried on from another day may no longer hold (its period closed). */
    if (!written.goal) {
      for (const [index, name] of OBJECTIVE_STEPS.entries()) {
        const found = stepProblems(name, effective, context);
        if (hasProblems(found)) {
          setStep(index);
          setProblems(found);
          return;
        }
      }
    }
    setBusy(how);
    setError(null);
    let progress = written;
    try {
      if (!progress.goal) {
        const goal = await mutations.createGoal(
          goalBodyOf(effective, { reviewCycleId, quarter }),
        );
        progress = { goal, target: false };
        setWritten(progress);
        /* It exists now: a draft kept after this would make it twice. */
        discard();
      }
      const targetBody = keyResultBodyOf(effective);
      if (targetBody && !progress.target && progress.goal) {
        try {
          await mutations.addKeyResult(progress.goal.id, targetBody);
        } catch (caught) {
          setError(
            `The objective is saved as a draft, but its target is not: ${actionMessage(caught, "the target")} Press again to add the target.`,
          );
          return;
        }
        progress = { ...progress, target: true };
        setWritten(progress);
      }
      const goal = progress.goal as ApiGoal;
      if (how === "draft") {
        discard();
        setFinished({ kind: "draft", goal });
        return;
      }
      let answer: ApiObjectiveSubmitted | undefined;
      try {
        answer = await objectives.submit(goal.id);
      } catch (caught) {
        setError(
          `The objective is saved as a draft, but it was not sent to be agreed: ${actionMessage(caught, "the objective")}`,
        );
        return;
      }
      discard();
      setFinished({
        kind: "sent",
        goal: answer ?? goal,
        sentTo: Array.isArray(answer?.sentTo) ? answer.sentTo : undefined,
      });
    } catch (caught) {
      setError(actionMessage(caught, "the objective"));
    } finally {
      setBusy(null);
    }
  };

  /* -------------------------------------------------------------- the words */

  const parentGoal = parents.find((goal) => goal.id === effective.parentId);
  const whoseWords = (() => {
    if (level === "company") return "The whole company";
    if (level === "department") {
      const named = departments.find((one) => one.id === departmentId)?.name;
      return named ? `${named}, the whole department` : "A department";
    }
    if (personId === "me" || personId === employeeId) return "Yours";
    const person = led.find((one) => one.id === personId);
    return person ? person.fullName : "Somebody you lead";
  })();
  const targetWords = (() => {
    if (draft.target === "LATER" || draft.target === null) {
      return "None yet";
    }
    if (draft.target === "DONE") return `Done or not done: ${draft.label}`;
    const unit = draft.unit.trim() ? ` ${draft.unit.trim()}` : "";
    return `${draft.label}: from ${draft.start || "0"}${unit} to ${draft.value}${unit}${draft.countDown ? ", counting down" : ""}`;
  })();
  const periodName =
    openPeriods.find((period) => period.id === reviewCycleId)?.name ?? null;

  /* ------------------------------------------------------------ the screen */

  if (finished) {
    const copy =
      finished.kind === "sent"
        ? sentToAgreeCopy({
            goal: finished.goal,
            sentTo: finished.sentTo,
            viewerId: actingId,
          })
        : null;
    return (
      <WizardShell
        open
        onClose={leave}
        step={SCREENS - 1}
        total={SCREENS}
        title="Objective saved"
        done={
          copy?.kind === "notice" ? (
            <SuccessMoment
              headingLevel={1}
              align="center"
              focusHeading
              title={copy.said.title}
              lead={copy.said.detail}
              actions={
                <Button variant="accent" onClick={leave}>
                  Back to objectives
                </Button>
              }
            />
          ) : (
            <SuccessMoment
              headingLevel={1}
              align="center"
              art={<Illustration name="welcome" height={144} />}
              focusHeading
              title={
                copy?.kind === "moment"
                  ? copy.copy.title
                  : `"${finished.goal.title}" is saved as a draft`
              }
              lead={
                copy?.kind === "moment"
                  ? copy.copy.lead
                  : "Nobody is asked to agree it until it is sent. Send it from its card on Objectives."
              }
              {...(copy?.kind === "moment"
                ? { details: copy.copy.details }
                : {})}
              actions={
                <Button variant="accent" onClick={leave}>
                  Back to objectives
                </Button>
              }
            />
          )
        }
      >
        {null}
      </WizardShell>
    );
  }

  return (
    <WizardShell
      open
      onClose={leave}
      step={step}
      total={SCREENS}
      title={STEP_TITLES[screen]}
      /* Once the objective exists, going back to change it would change a
         form and not the objective; the message says what is saved. */
      {...(written.goal ? {} : { onBack: () => go(step - 1) })}
      onNext={next}
      nextLabel={screen === "review" ? "Send to be agreed" : "Continue"}
      canNext={
        !((screen === "period" || screen === "review") && periodsPending)
      }
      busy={busy === "send"}
      error={error}
      extra={
        screen === "review" ? (
          <Button
            type="button"
            variant="secondary"
            loading={busy === "draft"}
            disabled={busy !== null || periodsPending}
            onClick={() => void finish("draft")}
          >
            Save as a draft
          </Button>
        ) : undefined
      }
    >
      {/* On whichever screen they left from, until they move on. */}
      {resumed && (
        <p className="text-body-sm text-muted">
          Carried on from where you left it. Kept in this browser, not on your
          account.{" "}
          <button
            type="button"
            className="font-medium text-accent-text underline-offset-2 hover:underline"
            onClick={() => {
              discard();
              setDraft({ ...BLANK_OBJECTIVE, parentId: parent ?? "" });
              setResumed(false);
              setProblems({});
              setStep(0);
            }}
          >
            Start again
          </button>
        </p>
      )}

      {screen === "aim" && (
        <>
          <Field
            label="Objective title"
            required
            {...(problems.title ? { error: problems.title } : {})}
            help="Say it the way you would to the person doing it."
          >
            <Input
              value={draft.title}
              onChange={(event) => update({ title: event.target.value })}
              placeholder="Fill the two Lagos engineering roles"
            />
          </Field>

          {effective.parentId && (
            <div className="flex flex-col gap-3">
              <SuggestButton
                loading={suggestions.loading}
                label="Suggest objectives under this one"
                onClick={() =>
                  void suggestions.ask({ goalId: effective.parentId })
                }
              />
              <SuggestionPanel
                state={suggestions}
                onDismiss={suggestions.clear}
                useLabel="Use this"
                emptyHint="Edit it before you save."
                onUse={(suggestion) =>
                  update({
                    title: suggestion.title,
                    ...(suggestion.detail
                      ? { description: suggestion.detail }
                      : {}),
                  })
                }
              />
            </div>
          )}

          {levels.length > 1 ? (
            <FieldSet legend="Who is it for?">
              <div
                className={
                  "grid gap-3 " +
                  (levels.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")
                }
              >
                {levels.includes("company") && (
                  <RadioCard
                    name="objective-level"
                    value="company"
                    checked={level === "company"}
                    onChange={() => update({ level: "company" })}
                    icon={<Building2 aria-hidden="true" />}
                    label="The whole company"
                    description="Everyone sees it. Nobody owns it."
                  />
                )}
                {levels.includes("department") && (
                  <RadioCard
                    name="objective-level"
                    value="department"
                    checked={level === "department"}
                    onChange={() => update({ level: "department" })}
                    icon={<Users aria-hidden="true" />}
                    label="A department"
                    description="A target the whole department shares."
                  />
                )}
                {levels.includes("person") && (
                  <RadioCard
                    name="objective-level"
                    value="person"
                    checked={level === "person"}
                    onChange={() => update({ level: "person" })}
                    icon={<User aria-hidden="true" />}
                    label="One person"
                    description="Their own, scored in their appraisal."
                  />
                )}
              </div>
            </FieldSet>
          ) : null}

          {level === "department" && (
            <Field
              label="Department"
              required
              {...(problems.department ? { error: problems.department } : {})}
            >
              <Select
                value={departmentId}
                onChange={(event) =>
                  update({ level, departmentId: event.target.value })
                }
              >
                {departmentId === "" && (
                  <option value="">Choose a department</option>
                )}
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {level === "person" &&
            (led.length > 0 ? (
              <Field
                label="Whose objective"
                required
                {...(problems.person ? { error: problems.person } : {})}
              >
                <Select
                  value={personId}
                  onChange={(event) =>
                    update({ level, personId: event.target.value })
                  }
                >
                  {employeeId !== null && <option value="me">Mine</option>}
                  {led.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.fullName} · {person.jobTitle}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <p className="text-body-sm text-muted">
                It is your own objective.
              </p>
            ))}

          <Field optional label="More detail">
            <Textarea
              rows={3}
              value={draft.description}
              onChange={(event) => update({ description: event.target.value })}
            />
          </Field>
        </>
      )}

      {screen === "target" && (
        <>
          <FieldSet
            legend="What kind of target is this?"
            {...(problems.target ? { error: problems.target } : {})}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <TargetCard
                value="NUMBER"
                chosen={draft.target}
                onChoose={(target) => update({ target })}
                icon={<Target aria-hidden="true" />}
                label="A number to reach"
                description="Revenue of ₦40m, 12 hires, cost down to ₦300k."
              />
              <TargetCard
                value="DONE"
                chosen={draft.target}
                onChoose={(target) => update({ target })}
                icon={<CheckCircle2 aria-hidden="true" />}
                label="Done or not done"
                description="Finished or not. A manager confirms it when it is done."
              />
              <TargetCard
                value="LATER"
                chosen={draft.target}
                onChoose={(target) => update({ target })}
                icon={<Clock aria-hidden="true" />}
                label="Add it later"
                description="Until there is one, it is scored on a figure somebody states by hand."
              />
            </div>
          </FieldSet>

          {draft.target === "DONE" && (
            <Field
              label="What does done mean?"
              required
              help="Say it so a manager can tell whether it happened."
              {...(problems.label ? { error: problems.label } : {})}
            >
              <Input
                value={draft.label}
                onChange={(event) => update({ label: event.target.value })}
                placeholder="Both engineers hired"
              />
            </Field>
          )}

          {draft.target === "NUMBER" && (
            <>
              <Field
                label="What is counted"
                required
                {...(problems.label ? { error: problems.label } : {})}
              >
                <Input
                  value={draft.label}
                  onChange={(event) => update({ label: event.target.value })}
                  placeholder="Offers accepted"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Starting value" required>
                  <Input
                    inputMode="decimal"
                    value={draft.start}
                    onChange={(event) => update({ start: event.target.value })}
                  />
                </Field>
                <Field
                  label="Target value"
                  required
                  {...(problems.value ? { error: problems.value } : {})}
                >
                  <Input
                    inputMode="decimal"
                    value={draft.value}
                    onChange={(event) => update({ value: event.target.value })}
                  />
                </Field>
                <Field label="Unit" optional>
                  <Input
                    value={draft.unit}
                    onChange={(event) => update({ unit: event.target.value })}
                    placeholder="₦, %, days"
                  />
                </Field>
              </div>
              <Checkbox
                label="This number should go down"
                description="Cost, days to hire, complaints. Progress is how far it has fallen."
                checked={draft.countDown}
                onChange={(event) =>
                  update({ countDown: event.target.checked })
                }
              />
            </>
          )}
        </>
      )}

      {screen === "period" && (
        <>
          <Field label="Due quarter" required>
            <Select
              value={quarter}
              onChange={(event) => update({ quarter: event.target.value })}
            >
              {quarters.map((option) => (
                <option key={option} value={option}>
                  {quarterText(option)}
                </option>
              ))}
            </Select>
          </Field>

          {openPeriods.length > 0 && (
            <Field
              {...(needsPeriod(effective, openPeriods.length)
                ? { required: true }
                : { optional: true })}
              label="Appraisal period"
              {...(problems.period ? { error: problems.period } : {})}
              help={
                reviewCycleId
                  ? "It counts towards the score for that period, once somebody agrees it."
                  : needsPeriod(effective, openPeriods.length)
                    ? "Pick the period this is scored in."
                    : "Without an appraisal period, this objective will not count towards anyone's score, even once it is agreed."
              }
            >
              <Select
                value={reviewCycleId}
                onChange={(event) => update({ periodId: event.target.value })}
              >
                {needsPeriod(effective, openPeriods.length) ? (
                  reviewCycleId === "" && (
                    <option value="">Choose an appraisal period</option>
                  )
                ) : (
                  <option value="">Not part of an appraisal period</option>
                )}
                {openPeriods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {level === "person" &&
            openPeriods.length === 0 &&
            periodsLoading !== true && (
              <p className="text-body-sm text-warning-text">
                No appraisal period is open, so this objective will count
                towards nobody&apos;s score. Start a period first, then edit the
                objective to file it in that period.
              </p>
            )}

          <Field
            optional
            label="What does it support?"
            help="The objective above it, if there is one."
          >
            <Select
              value={effective.parentId}
              onChange={(event) => update({ parentId: event.target.value })}
              disabled={visible.loading && parents.length === 0}
            >
              <option value="">Nothing above it</option>
              {effective.parentId !== "" && !parentGoal && (
                <option value={effective.parentId}>
                  {visible.loading
                    ? "Loading the objectives…"
                    : "The objective it was started from"}
                </option>
              )}
              {parents.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                  {goal.ownerName
                    ? ` · ${goal.ownerName}`
                    : goal.departmentName
                      ? ` · ${goal.departmentName}`
                      : ""}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}

      {screen === "review" && (
        <>
          <dl className="divide-y divide-line rounded-lg border border-line bg-surface">
            <ReviewRow
              label="Objective"
              value={draft.title.trim()}
              onChange={() => go(0)}
              locked={written.goal !== null}
            />
            <ReviewRow
              label="Whose"
              value={whoseWords}
              onChange={() => go(0)}
              locked={written.goal !== null}
            />
            {draft.description.trim() && (
              <ReviewRow
                label="More detail"
                value={draft.description.trim()}
                onChange={() => go(0)}
                locked={written.goal !== null}
              />
            )}
            <ReviewRow
              label="Target"
              value={targetWords}
              onChange={() => go(1)}
              locked={written.goal !== null}
            />
            <ReviewRow
              label="Due"
              value={quarterLabel(quarter)}
              onChange={() => go(2)}
              locked={written.goal !== null}
            />
            <ReviewRow
              label="Appraisal period"
              value={periodsPending ? "Still loading" : (periodName ?? "None")}
              onChange={() => go(2)}
              locked={written.goal !== null}
            />
            <ReviewRow
              label="Supports"
              value={
                parentGoal?.title ??
                (effective.parentId
                  ? "The objective it was started from"
                  : "Nothing above it")
              }
              onChange={() => go(2)}
              locked={written.goal !== null}
            />
          </dl>
          <p className="text-body-sm text-muted">
            Sending it asks somebody else to agree it; nobody agrees their own.
            Once it is agreed the title, the period and the target are fixed.
            Progress still moves.
          </p>
          {reviewCycleId === "" && (
            <p className="text-body-sm text-warning-text">
              It is not in an appraisal period, so agreeing it counts towards
              nobody&rsquo;s score.
            </p>
          )}
        </>
      )}
    </WizardShell>
  );
}

function TargetCard({
  value,
  chosen,
  onChoose,
  icon,
  label,
  description,
}: {
  value: TargetChoice;
  chosen: TargetChoice | null;
  onChoose: (value: TargetChoice) => void;
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  return (
    <RadioCard
      name="objective-target"
      value={value}
      checked={chosen === value}
      onChange={() => onChoose(value)}
      icon={icon}
      label={label}
      description={description}
    />
  );
}

function ReviewRow({
  label,
  value,
  onChange,
  locked,
}: {
  label: string;
  value: string;
  onChange: () => void;
  /** Written already, so there is nothing left to change here. */
  locked: boolean;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <dt className="text-meta text-muted">{label}</dt>
        <dd className="mt-0.5 break-words text-body-sm text-ink">{value}</dd>
      </div>
      {!locked && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onChange}
          aria-label={`Change, ${label.toLowerCase()}`}
        >
          Change
        </Button>
      )}
    </div>
  );
}
