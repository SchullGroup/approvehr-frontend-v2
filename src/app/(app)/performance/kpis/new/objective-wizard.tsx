"use client";

import { useCallback, useMemo, useState } from "react";
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
import { WizardLink, WizardShell } from "@/components/performance/wizard-shell";
import {
  SuggestButton,
  SuggestionPanel,
} from "@/components/performance/suggestions";
import type { ApiGoal, ApiObjectiveSubmitted } from "@/lib/api/performance";
import { performanceApi, quarterLabel } from "@/lib/api/performance";
import {
  BLANK_OBJECTIVE,
  OBJECTIVE_STEPS,
  STEP_TITLES,
  draftFromGoal,
  draftIsBlank,
  goalBodyOf,
  goalChangesOf,
  hasProblems,
  keyResultBodyOf,
  levelFromWhose,
  levelsOffered,
  needsPeriod,
  periodsTakingObjectives,
  stepProblems,
  targetChangesOf,
  type ObjectiveDraft,
  type ObjectiveLevel,
  type ObjectiveStep,
  type StepProblems,
  type TargetChoice,
  type TargetEdit,
} from "@/lib/performance/objective-wizard";
import { agreesLine, sentLine } from "@/lib/performance/objective-wizard";
import {
  approvalWords,
  whoseWords as goalWhose,
} from "@/lib/performance/objective-queue";
import { useFetched } from "@/lib/use-fetched";
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
  mayEditGoal,
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

/* Objectives after the first in one flow share its period, level and owner, so
   they are asked the aim and the target and nothing else. */
const LATER_STEPS = ["aim", "target", "review"] as const;

type Written = { goal: ApiGoal | null; target: boolean };

type Finished =
  | { kind: "sent"; goal: ApiGoal; sentTo: string[] | undefined }
  | { kind: "draft"; goal: ApiGoal }
  | { kind: "saved"; goal: ApiGoal }
  | {
      kind: "many";
      goals: ApiGoal[];
      sent: boolean;
      sentTo: string[] | undefined;
    };

export function ObjectiveWizard({
  parent,
  edit = null,
  period: askedPeriod = null,
  back,
  department: askedDepartment = null,
}: {
  /** The objective it goes under, from "Add an objective under this". */
  parent: string | null;
  /**
   * An objective to change and send again, from "Edit and resend" on one that
   * was declined. Null for a new one.
   */
  edit?: string | null;
  /**
   * An appraisal period to set objectives for, from the notification asking
   * people to (`?period=`). Used only if it still takes objectives.
   */
  period?: string | null;
  /** Where Cancel and the X go: the Objectives address it was opened from. */
  back: string;
  /** A department to start the objective for, from its own page. */
  department?: string | null;
}) {
  const router = useRouter();
  const { employeeId, user, actingId, isConnected } = useSession();
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

  /* The objective being changed, read once. Its own answers seed the
     questions, and what is sent back is only what differs from it. */
  const editing = edit !== null;
  const loadGoal = useCallback(
    (signal: AbortSignal) => performanceApi.goal(edit ?? "", signal),
    [edit],
  );
  const original = useFetched<ApiGoal>(
    `objective-edit:${edit ?? ""}`,
    editing && isConnected,
    loadGoal,
  );
  const goal = editing ? original.data : null;

  const { kept, keep, discard } = useObjectiveDraft(
    owner,
    edit ? `edit:${edit}` : "new",
  );
  const [draft, setDraft] = useState<ObjectiveDraft>(() => ({
    ...BLANK_OBJECTIVE,
    parentId: parent ?? "",
  }));
  const [step, setStep] = useState(0);
  /* Objectives finished earlier in this flow, waiting to be sent with the one
     being written. They share the first one's period, level and owner. */
  const [batch, setBatch] = useState<ObjectiveDraft[]>([]);
  const later = batch.length > 0;
  const steps: readonly ObjectiveStep[] = later ? LATER_STEPS : OBJECTIVE_STEPS;
  const SCREENS = steps.length;
  /* Whether anything has been answered here yet: a draft kept from last time
     arrives a moment after the first render (storage is read after
     hydration), and is carried on from only if nothing has been typed. */
  const [touched, setTouched] = useState(false);
  const [resumed, setResumed] = useState(false);
  if (!touched && kept && !resumed) {
    setResumed(true);
    setTouched(true);
    setDraft({
      ...BLANK_OBJECTIVE,
      ...kept.draft,
      parentId: editing ? kept.draft.parentId : (parent ?? kept.draft.parentId),
    });
    setBatch(kept.batch ?? []);
    setStep(
      Math.min(
        kept.step,
        (kept.batch && kept.batch.length > 0 ? LATER_STEPS : OBJECTIVE_STEPS)
          .length - 1,
      ),
    );
  }
  /* An objective being changed starts on what it says now, unless a draft of
     the change was carried on first. */
  const [seeded, setSeeded] = useState(false);
  if (goal && !seeded) {
    setSeeded(true);
    if (!touched) {
      setTouched(true);
      setDraft(draftFromGoal(goal, employeeId));
    }
  }

  const [problems, setProblems] = useState<StepProblems>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"send" | "draft" | null>(null);
  const [written, setWritten] = useState<Written>({
    goal: null,
    target: false,
  });
  /* New objectives write one at a time; this is how far each got. */
  const [writtenList, setWrittenList] = useState<Written[]>([]);
  const saved = written.goal !== null || writtenList.some((w) => w.goal);
  const [finished, setFinished] = useState<Finished | null>(null);

  /* The starting answers follow what has loaded, until somebody chooses. */
  const start = askedDepartment
    ? ({ level: "department", departmentId: askedDepartment } as const)
    : levelFromWhose(whose.fallback);
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
  const askedOpen =
    askedPeriod !== null && openPeriods.some((one) => one.id === askedPeriod)
      ? askedPeriod
      : null;
  const reviewCycleId =
    draft.periodId ??
    (level === "person" ? (askedOpen ?? defaultPeriodId(openPeriods)) : "");
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
    if (draftIsBlank(next) && !later) discard();
    else keep(next, step, batch);
  };

  const go = (to: number) => {
    setResumed(false);
    setStep(to);
    setProblems({});
    setError(null);
    if (!draftIsBlank(draft) || later) keep(draft, to, batch);
  };

  const leave = () => {
    /* What was typed is kept already; leaving changes nothing but the page. */
    router.push(back);
  };

  const screen = steps[step] ?? "aim";

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
    if (!saved) {
      for (const [index, name] of steps.entries()) {
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
    if (editing) {
      if (goal) await finishChange(goal, how);
      setBusy(null);
      return;
    }
    /* One at a time, in order. Each write can be repeated, so a press after a
       failure carries on from where it stopped and makes nothing twice. */
    const items: ObjectiveDraft[] = [
      ...batch,
      { ...effective, quarter, periodId: reviewCycleId },
    ];
    const list: Written[] = items.map(
      (_, index) => writtenList[index] ?? { goal: null, target: false },
    );
    const answers: ApiObjectiveSubmitted[] = [];
    const who = (index: number) =>
      items.length === 1
        ? "The objective"
        : `"${items[index]?.title.trim() ?? ""}"`;
    try {
      for (const [index, item] of items.entries()) {
        let w = list[index] as Written;
        if (!w.goal) {
          const made = await mutations.createGoal(
            goalBodyOf(item, {
              reviewCycleId: item.periodId ?? "",
              quarter: item.quarter,
            }),
          );
          w = { goal: made, target: false };
          list[index] = w;
          setWrittenList([...list]);
          /* It exists now: a draft kept after this would make it twice. */
          discard();
        }
        const targetBody = keyResultBodyOf(item);
        if (targetBody && !w.target && w.goal) {
          try {
            await mutations.addKeyResult(w.goal.id, targetBody);
          } catch (caught) {
            setError(
              `${who(index)} is saved as a draft, but its target is not: ${actionMessage(caught, "the target")} Press again to add the target.`,
            );
            return;
          }
          w = { ...w, target: true };
          list[index] = w;
          setWrittenList([...list]);
        }
        if (how === "send" && w.goal) {
          try {
            const answer = await objectives.submit(w.goal.id);
            if (answer) answers.push(answer);
          } catch (caught) {
            setError(
              `${who(index)} is saved as a draft, but it was not sent to be agreed: ${actionMessage(caught, "the objective")}`,
            );
            return;
          }
        }
      }
      discard();
      const goals = list.map((w) => w.goal as ApiGoal);
      if (items.length > 1) {
        const last = answers[answers.length - 1];
        setFinished({
          kind: "many",
          goals,
          sent: how === "send",
          sentTo: Array.isArray(last?.sentTo) ? last.sentTo : undefined,
        });
      } else if (how === "draft") {
        setFinished({ kind: "draft", goal: goals[0] as ApiGoal });
      } else {
        const answer = answers[0];
        setFinished({
          kind: "sent",
          goal: answer ?? (goals[0] as ApiGoal),
          sentTo: Array.isArray(answer?.sentTo) ? answer.sentTo : undefined,
        });
      }
    } catch (caught) {
      setError(
        `${items.length > 1 ? "Not everything is saved. " : ""}${actionMessage(caught, "the objective")}`,
      );
    } finally {
      setBusy(null);
    }
  };

  /** Keeps this one, and starts the next on the same period, level and owner. */
  const addAnother = () => {
    for (const [index, name] of steps.entries()) {
      const found = stepProblems(name, effective, context);
      if (hasProblems(found)) {
        setStep(index);
        setProblems(found);
        return;
      }
    }
    const done = { ...effective, quarter, periodId: reviewCycleId };
    const nextBatch = [...batch, done];
    const fresh: ObjectiveDraft = {
      ...BLANK_OBJECTIVE,
      level: effective.level,
      departmentId: effective.departmentId,
      personId: effective.personId,
      quarter,
      periodId: reviewCycleId,
      parentId: parent ?? "",
    };
    setBatch(nextBatch);
    setDraft(fresh);
    setStep(0);
    setProblems({});
    setError(null);
    keep(fresh, 0, nextBatch);
  };

  const removeFromBatch = (index: number) => {
    const nextBatch = batch.filter((_, at) => at !== index);
    setBatch(nextBatch);
    keep(
      draft,
      Math.min(
        step,
        (nextBatch.length > 0 ? LATER_STEPS : OBJECTIVE_STEPS).length - 1,
      ),
      nextBatch,
    );
  };

  /**
   * Changing an objective that exists: only what differs, then the send.
   *
   * Every write here can be repeated, so a press after a failure sends the
   * same changes again rather than anything twice; a target added to one that
   * had none is remembered, since that one is a new row.
   */
  const finishChange = async (goal: ApiGoal, how: "send" | "draft") => {
    try {
      const changes = goalChangesOf(goal, effective, {
        reviewCycleId,
        quarter,
      });
      if (Object.keys(changes).length > 0) {
        await mutations.updateGoal(goal.id, changes);
      }
      for (const [id, body] of targetChangesOf(goal, effective)) {
        await mutations.updateKeyResult(id, body);
      }
      const targetBody =
        goal.keyResults.length === 0 ? keyResultBodyOf(effective) : null;
      if (targetBody && !written.target) {
        await mutations.addKeyResult(goal.id, targetBody);
        setWritten({ goal: null, target: true });
      }
      discard();
      if (how === "draft") {
        setFinished({ kind: "saved", goal });
        return;
      }
      let answer: ApiObjectiveSubmitted | undefined;
      try {
        answer = await objectives.submit(goal.id);
      } catch (caught) {
        setError(
          `The changes are saved, but it was not sent to be agreed: ${actionMessage(caught, "the objective")}`,
        );
        return;
      }
      setFinished({
        kind: "sent",
        goal: answer ?? goal,
        sentTo: Array.isArray(answer?.sentTo) ? answer.sentTo : undefined,
      });
    } catch (caught) {
      setError(actionMessage(caught, "the objective"));
    }
  };

  /* -------------------------------------------------------------- the words */

  const parentGoal = parents.find((goal) => goal.id === effective.parentId);
  const whoseWords = (() => {
    if (goal) {
      return goal.ownerId !== null && goal.ownerId === employeeId
        ? "Yours"
        : goalWhose(goal);
    }
    if (level === "company") return "The whole company";
    if (level === "department") {
      const named = departments.find((one) => one.id === departmentId)?.name;
      return named ? `${named}, the whole department` : "A department";
    }
    if (personId === "me" || personId === employeeId) return "Yours";
    const person = led.find((one) => one.id === personId);
    return person ? person.fullName : "Somebody you lead";
  })();
  const existingTargets = Object.entries(draft.targets);
  const targetWords = (() => {
    if (existingTargets.length > 0) {
      return existingTargets
        .map(([, one]) =>
          one.kind === "DONE"
            ? `Done or not done: ${one.label}`
            : `${one.label}: from ${one.start || "0"}${one.unit.trim() ? ` ${one.unit.trim()}` : ""} to ${one.value}${one.unit.trim() ? ` ${one.unit.trim()}` : ""}${one.countDown ? ", counting down" : ""}`,
        )
        .join("; ");
    }
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

  if (finished?.kind === "many") {
    const count = finished.goals.length;
    return (
      <WizardShell
        open
        onClose={leave}
        step={SCREENS - 1}
        total={SCREENS}
        title="Objectives saved"
        done={
          <SuccessMoment
            headingLevel={1}
            align="center"
            art={<Illustration name="welcome" height={144} />}
            focusHeading
            title={
              finished.sent
                ? `${String(count)} objectives sent to be agreed`
                : `${String(count)} objectives saved as drafts`
            }
            lead={
              finished.sent
                ? (sentLine(finished.sentTo, people) ??
                  "They have gone to be agreed.")
                : "Nobody is asked to agree them until they are sent. Send each from its card on Objectives."
            }
            actions={
              <Button variant="accent" onClick={leave}>
                Back to objectives
              </Button>
            }
          />
        }
      >
        {null}
      </WizardShell>
    );
  }
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
                  : finished.kind === "saved"
                    ? `Changes to "${finished.goal.title}" are saved`
                    : `"${finished.goal.title}" is saved as a draft`
              }
              lead={
                copy?.kind === "moment"
                  ? copy.copy.lead
                  : finished.kind === "saved" &&
                      finished.goal.approval === "NEEDS_REVISION"
                    ? "It stays declined until it is sent to be agreed again. Send it from its card on Objectives."
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

  /* Changing one: nothing to ask until it has been read, and nothing to ask
     at all once it is agreed or finished. */
  if (editing && !goal) {
    const failed =
      original.error !== null || (!isConnected && !original.loading);
    return (
      <WizardShell
        open
        onClose={leave}
        step={0}
        total={SCREENS}
        title={failed ? "That objective did not open" : "Opening the objective"}
        done={
          failed ? (
            <div className="flex flex-col items-start gap-4">
              <h1 className="text-h2 font-semibold text-ink">
                That objective did not open
              </h1>
              <p className="text-body-sm text-body">
                {original.error
                  ? actionMessage(original.error, "the objective")
                  : "Changing an objective needs the API."}
              </p>
              <Button variant="accent" onClick={leave}>
                Back to objectives
              </Button>
            </div>
          ) : (
            <p role="status" className="text-body-sm text-muted">
              Opening the objective…
            </p>
          )
        }
      >
        {null}
      </WizardShell>
    );
  }
  if (goal && !mayEditGoal(goal)) {
    return (
      <WizardShell
        open
        onClose={leave}
        step={0}
        total={SCREENS}
        title="This objective cannot be changed here"
        done={
          <div className="flex flex-col items-start gap-4">
            <h1 className="text-h2 font-semibold text-ink">
              This objective cannot be changed here
            </h1>
            <p className="text-body-sm text-body">
              {goal.targetFrozen
                ? "It is agreed, so it is fixed. To change it, reopen it from its card on Objectives."
                : `It is ${approvalWords(goal).toLowerCase()}, so there is nothing left to change.`}
            </p>
            <Button variant="accent" onClick={leave}>
              Back to objectives
            </Button>
          </div>
        }
      >
        {null}
      </WizardShell>
    );
  }

  const feedback =
    goal?.approval === "NEEDS_REVISION" && goal.approvalNote
      ? goal.approvalNote
      : null;

  return (
    <WizardShell
      open
      onClose={leave}
      step={step}
      total={SCREENS}
      title={STEP_TITLES[screen]}
      /* Once the objective exists, going back to change it would change a
         form and not the objective; the message says what is saved. */
      {...(saved || screen === "review" ? {} : { onBack: () => go(step - 1) })}
      onNext={next}
      nextLabel={
        screen === "review"
          ? batch.length > 0
            ? `Send ${String(batch.length + 1)} to be agreed`
            : "Send to be agreed"
          : "Continue"
      }
      canNext={
        !((screen === "period" || screen === "review") && periodsPending)
      }
      busy={busy === "send"}
      error={error}
      links={
        screen === "review" && !editing && !saved ? (
          <WizardLink
            disabled={busy !== null || periodsPending}
            onClick={addAnother}
          >
            Add another
          </WizardLink>
        ) : undefined
      }
      extra={
        screen === "review" ? (
          <>
            <Button
              type="button"
              variant="secondary"
              loading={busy === "draft"}
              disabled={busy !== null || periodsPending}
              onClick={() => void finish("draft")}
            >
              {editing
                ? "Save without sending"
                : batch.length > 0
                  ? "Save as drafts"
                  : "Save as a draft"}
            </Button>
          </>
        ) : undefined
      }
    >
      {/* Arrived from "set your objectives": say which period, once. */}
      {askedOpen && !editing && screen === "aim" && !later && (
        <p className="text-body-sm text-muted">
          Setting objectives for{" "}
          {openPeriods.find((one) => one.id === askedOpen)?.name}
        </p>
      )}
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
              setDraft(
                goal
                  ? draftFromGoal(goal, employeeId)
                  : { ...BLANK_OBJECTIVE, parentId: parent ?? "" },
              );
              setResumed(false);
              setProblems({});
              setStep(0);
            }}
          >
            Start again
          </button>
        </p>
      )}

      {/* What the person who declined it said, quietly, on every screen:
          it is what the change is answering. */}
      {feedback && (
        <div className="border-l-2 border-line-strong pl-3 text-body-sm">
          <p className="text-meta text-muted">Feedback when it was declined</p>
          <p className="mt-0.5 whitespace-pre-line leading-relaxed text-body">
            {feedback}
          </p>
        </div>
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

          {editing || later ? (
            <p className="text-body-sm text-body">
              <span className="text-muted">Whose: </span>
              {whoseWords}
            </p>
          ) : levels.length > 1 ? (
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

          {!editing && !later && level === "department" && (
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

          {!editing &&
            !later &&
            level === "person" &&
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

      {screen === "target" && existingTargets.length > 0 && (
        <>
          <p className="text-body-sm text-muted">
            {existingTargets.length === 1
              ? "Its target. Change it here; another can be added from its card once this is sent."
              : "Its targets. Change them here; another can be added from its card once this is sent."}
          </p>
          {existingTargets.map(([id, target]) => (
            <TargetEditor
              key={id}
              target={target}
              problems={problems.targets?.[id]}
              onChange={(patch) =>
                update({
                  targets: {
                    ...draft.targets,
                    [id]: { ...target, ...patch },
                  },
                })
              }
            />
          ))}
        </>
      )}

      {screen === "target" && existingTargets.length === 0 && (
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
          {batch.length > 0 && (
            <ul
              aria-label="Objectives already added"
              className="divide-y divide-line rounded-lg border border-line bg-surface"
            >
              {batch.map((item, index) => (
                <li
                  key={`${String(index)}-${item.title}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-body-sm"
                >
                  <span className="min-w-0 break-words text-ink">
                    {item.title.trim()}
                  </span>
                  {!saved && (
                    <button
                      type="button"
                      className="shrink-0 text-accent-text underline-offset-2 hover:underline"
                      onClick={() => removeFromBatch(index)}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <dl className="divide-y divide-line rounded-lg border border-line bg-surface">
            <ReviewRow
              label="Objective"
              value={draft.title.trim()}
              onChange={() => go(0)}
              locked={saved}
            />
            <ReviewRow
              label="Whose"
              value={whoseWords}
              onChange={() => go(0)}
              locked={saved}
            />
            {draft.description.trim() && (
              <ReviewRow
                label="More detail"
                value={draft.description.trim()}
                onChange={() => go(0)}
                locked={saved}
              />
            )}
            <ReviewRow
              label="Target"
              value={targetWords}
              onChange={() => go(1)}
              locked={saved}
            />
            <ReviewRow
              label="Due"
              value={quarterLabel(quarter)}
              onChange={() => go(2)}
              locked={saved}
            />
            <ReviewRow
              label="Appraisal period"
              value={periodsPending ? "Still loading" : (periodName ?? "None")}
              onChange={() => go(2)}
              locked={saved}
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
              locked={saved}
            />
          </dl>
          {!editing && (
            <p className="text-body-sm text-body">
              {agreesLine({
                level,
                ownerId: effective.personId || null,
                meId: employeeId ?? null,
                people,
                departments: allDepartments,
              })}
            </p>
          )}
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

/** One target the objective already has, its kind fixed and its fields open. */
function TargetEditor({
  target,
  problems,
  onChange,
}: {
  target: TargetEdit;
  problems: { label?: string; target?: string } | undefined;
  onChange: (patch: Partial<TargetEdit>) => void;
}) {
  if (target.kind === "DONE") {
    return (
      <Field
        label="What does done mean?"
        required
        {...(problems?.label ? { error: problems.label } : {})}
      >
        <Input
          value={target.label}
          onChange={(event) => onChange({ label: event.target.value })}
        />
      </Field>
    );
  }
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line p-4">
      <Field
        label="What is counted"
        required
        {...(problems?.label ? { error: problems.label } : {})}
      >
        <Input
          value={target.label}
          onChange={(event) => onChange({ label: event.target.value })}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Starting value" required>
          <Input
            inputMode="decimal"
            value={target.start}
            onChange={(event) => onChange({ start: event.target.value })}
          />
        </Field>
        <Field
          label="Target value"
          required
          {...(problems?.target ? { error: problems.target } : {})}
        >
          <Input
            inputMode="decimal"
            value={target.value}
            onChange={(event) => onChange({ value: event.target.value })}
          />
        </Field>
        <Field label="Unit" optional>
          <Input
            value={target.unit}
            onChange={(event) => onChange({ unit: event.target.value })}
          />
        </Field>
      </div>
      <Checkbox
        label="This number should go down"
        checked={target.countDown}
        onChange={(event) => onChange({ countDown: event.target.checked })}
      />
    </div>
  );
}
