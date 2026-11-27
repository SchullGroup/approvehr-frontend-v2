"use client";

import { CheckCircle2, Target } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  Field,
  FieldSet,
  Input,
  Modal,
  RadioCard,
  Select,
  Textarea,
} from "@/components/ui";
import {
  currentQuarter,
  type ApiGoal,
  type CreateKeyResultBody,
  type MeasureKind,
  type UpdateGoalBody,
} from "@/lib/api/performance";
import { ApiError } from "@/lib/api/client";
import { useCan } from "@/lib/permissions";
import {
  useDepartments,
  useHeadedDepartmentIds,
} from "@/lib/store/departments";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useAppraisals } from "@/lib/store/performance";
import { WizardLink } from "@/components/performance/wizard-shell";
import type { DirectoryPerson } from "@/lib/types";
import { useOrgTimezone, useSession } from "@/lib/store/session";
import { goesDown, measureProblems } from "@/lib/performance/measure-problems";
import { todayIn } from "@/lib/time";
import { TODAY } from "@/lib/today";
import { defaultPeriodId, peopleILead, type LeadReach } from "./goal-facts";

/**
 * Whose work this caller leads, as the two dialogs below ask it.
 *
 * The rule itself is `peopleILead` in `goal-facts.ts`, a mirror of the API's
 * `leadsWorkOf`; this only gathers what it needs to know about the caller. One
 * rule, because two dialogs asked it and had drifted in **opposite**
 * directions, which is what two copies of a rule do:
 *
 * - the owner select offered `managerId === employeeId` only, so a department
 *   head could not pick somebody in their own department even though
 *   `createGoal` accepts exactly that. It under-offered.
 * - the bulk assign dialog narrowed by the parent objective's department and
 *   not by the caller at all, so an employee was shown ten colleagues and the
 *   API refused every one. It over-offered.
 *
 * The people come from `useEmployeeDirectory().people`, which is what *every*
 * caller can read — not `employees`, the full rows only HR is sent. A
 * department head holds no `EDIT_RECORDS`, so the full list was empty for
 * exactly the people these dialogs are for.
 */
export function useLeadReach(): LeadReach {
  const { employeeId } = useSession();
  const leadsEveryone = useCan("EDIT_RECORDS");
  const headedDepartmentIds = useHeadedDepartmentIds();
  const { flat: departments } = useDepartments();
  return useMemo(
    () => ({
      employeeId,
      leadsEveryone,
      headedDepartmentIds,
      headedDepartmentNames: new Set(
        departments
          .filter((department) => headedDepartmentIds.has(department.id))
          .map((department) => department.name),
      ),
    }),
    [employeeId, leadsEveryone, headedDepartmentIds, departments],
  );
}

/**
 * The three KPI forms.
 *
 * Every label here is what a shop owner would say out loud. "Key result" is the
 * word the schema uses and it does not appear on screen — the thing is a
 * *measure*, and it is a number with a target.
 */

/**
 * The day the quarter list is built around.
 *
 * `TODAY` is the demo seed's fixed date (August 2026), so using it for a real
 * company left "Due quarter" on Q3 2026 in October: an ended quarter. A
 * connected workspace asks the real clock, in the company's zone (a company in
 * Lagos is already in tomorrow's quarter at 23:30 UTC on the last day); the
 * demo keeps its fixed day so its seeded KPIs still line up.
 */
export function useQuarterToday(): string {
  const { isConnected } = useSession();
  const timeZone = useOrgTimezone();
  return isConnected ? todayIn(timeZone) : TODAY;
}

/** The current quarter and the three after it, plus the one just gone. */
export function quarterOptions(today: string = TODAY): string[] {
  const now = currentQuarter(today);
  const [yearPart = "2026", quarterPart = "Q1"] = now.split("-");
  let year = Number(yearPart);
  let quarter = Number(quarterPart.replace("Q", ""));

  /* Start one quarter back: a KPI is often written up after the period opened. */
  quarter -= 1;
  if (quarter === 0) {
    quarter = 4;
    year -= 1;
  }

  const out: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    out.push(`${year}-Q${quarter}`);
    quarter += 1;
    if (quarter === 5) {
      quarter = 1;
      year += 1;
    }
  }
  return out;
}

export const quarterText = (quarter: string) => {
  const [year, part] = quarter.split("-");
  return `${part} ${year}`;
};

/**
 * The quarter an appraisal period stands for: the one it starts in, or, for a
 * period written before it had dates, the one it is due in, and otherwise
 * `fallback`. An objective's quarter is what lets it be agreed before the work
 * starts, and nobody should have to type it beside the period it already names.
 */
export function quarterOfPeriod(
  period: { periodStart?: string | null; dueDate?: string | null },
  fallback: string,
): string {
  const day = period.periodStart ?? period.dueDate ?? null;
  return day ? currentQuarter(day.slice(0, 10)) : fallback;
}

/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */

/**
 * Adding a measure.
 *
 * The direction check is done here as well as on the server, with the same
 * wording. Not because the server cannot be trusted, but because "the target is
 * below where you started — tick the box if it is meant to come down" is worth
 * saying while somebody is still looking at the two fields.
 */
/**
 * Who a shared objective could be given to, by the caller's own reach.
 *
 * Everybody when the objective is the company's; the department's own people
 * when it is a department's. Filing a Sales KPI under Marketing's target is
 * something the API refuses, so the list does not offer it.
 *
 * ...and then the caller's own reach, which this once did not apply at all.
 * Narrowing by the parent's department answers "whose KPI could this be" and
 * not "whose KPI may *you* set". So the dialog was identical for every role
 * tested: ten checkboxes and no narrowing, on a control that reads as a bulk
 * action, while `assignGoal` refuses each name one at a time — *"… is not
 * somebody you set goals for."* For an employee every box was a dead option.
 *
 * Read by the dialog and by the objective's menu, which does not offer "Give
 * an objective to people" to somebody who has nobody to give it to.
 */
export function useAssignablePeople(departmentId: string | null): {
  employees: DirectoryPerson[];
  loading: boolean;
} {
  const { people: inScope, loading } = useEmployeeDirectory(
    departmentId ? { departmentId, pageSize: 200 } : { pageSize: 200 },
  );
  const reach = useLeadReach();
  const employees = useMemo(
    () => peopleILead(inScope, reach),
    [inScope, reach],
  );
  return { employees, loading: loading === true };
}

/**
 * Give one KPI to several people, under a shared objective.
 *
 * The feedback's first point was that *"a KPI can only be assigned to a single
 * person, so there is no way to give the same KPI to a team"*.
 *
 * What this does **not** do is hand several people one shared row. Five people
 * on one KPI share one progress figure and therefore one mark, so one quiet
 * quarter drags four appraisals down and nobody reading the score could tell
 * which. So the shared thing is the objective above — a department's target,
 * which genuinely is one commitment — and each person gets their own KPI
 * beneath it, with their own measures, tasks and mark.
 *
 * ## A modal, and only offered on a shared objective
 *
 * This is not the everyday act: most KPIs are one person writing down what
 * they will do. It is the quarterly one, done once by whoever runs a
 * department, so it earns a button and not a panel — a form this size sitting
 * open on the KPI screen is exactly the layout complaint that started this.
 *
 * ## What it asks
 *
 * A title, already the parent's own, and the people, grouped by department
 * with a Select all for each. The quarter is the parent's, so it is asked only
 * where the parent has none. Every KPI it creates is a **draft**: assigning is
 * not agreeing, and the person it belongs to still sends it to be agreed.
 */
export function AssignKpiDialog({
  parent: parentProp,
  open,
  onClose,
  onAssign,
}: {
  /** `null` while closed — see the freeze below for why. */
  parent: {
    id: string;
    title: string;
    departmentId: string | null;
    dueQuarter: string | null;
  } | null;
  open: boolean;
  onClose: () => void;
  onAssign: (
    parentId: string,
    body: {
      title: string;
      description?: string;
      employeeIds: string[];
      dueQuarter?: string;
    },
  ) => Promise<{ created: unknown[]; alreadyHad: { name: string }[] }>;
}) {
  /* Remembers the last real parent: the caller clears its prop to null the
     instant it closes this, but the modal has to stay mounted with real
     content so `Modal` below can animate its own close off the real `open`. */
  const [parent, setParent] = useState(parentProp);
  if (parentProp && parentProp !== parent) setParent(parentProp);

  const { employees } = useAssignablePeople(parent?.departmentId ?? null);

  const quarters = quarterOptions(useQuarterToday());
  const [title, setTitle] = useState(parent?.title ?? "");
  const [chosen, setChosen] = useState<string[]>([]);
  const [quarter, setQuarter] = useState(
    parent?.dueQuarter ?? quarters[1] ?? quarters[0] ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* A blank form on every open, as in `NewKpiDialog`. This dialog stays
     mounted so its exit can animate, and so it kept the last title and the
     last ticks: a second objective opened with the first one's wording, and a
     person ticked under a department objective stayed ticked — and was sent —
     under the next one, where the department filter had already hidden them. */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const fresh = parentProp ?? parent;
      setTitle(fresh?.title ?? "");
      setChosen([]);
      setQuarter(fresh?.dueQuarter ?? quarters[1] ?? quarters[0] ?? "");
      setError(null);
    }
  }

  if (!parent) return null;

  /* Only people the list is showing. A tick for somebody the list no longer
     offers is invisible, and sending it would assign a KPI to a person the
     user cannot see they chose. */
  const picked = chosen.filter((id) =>
    employees.some((person) => person.id === id),
  );

  const toggle = (id: string) =>
    setChosen((was) =>
      was.includes(id) ? was.filter((one) => one !== id) : [...was, id],
    );

  /* By department, in the order the directory gave them within each. A person
     with none is last. */
  const groups = groupByDepartment(employees);
  const toggleGroup = (ids: string[]) =>
    setChosen((was) =>
      ids.every((id) => was.includes(id))
        ? was.filter((id) => !ids.includes(id))
        : [...was, ...ids.filter((id) => !was.includes(id))],
    );

  /* Not sendable until it can be: the button says so by being unavailable, and
     nothing is written under it. */
  const ready = title.trim().length >= 3 && picked.length > 0;

  const submit = async () => {
    if (!ready) return;
    setError(null);
    setSaving(true);
    try {
      const body: {
        title: string;
        employeeIds: string[];
        dueQuarter?: string;
      } = { title: title.trim(), employeeIds: picked };
      if (quarter) body.dueQuarter = quarter;
      await onAssign(parent.id, body);
    } catch (cause) {
      /* The API is the authority on whose goals somebody may set, and it can
         still say no to a list this dialog thought was right — the company's
         objectives are HR's to give out, for one. Say what it said, here,
         instead of leaving the dialog open and silent over a rejection. */
      if (!(cause instanceof ApiError)) throw cause;
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Give an objective to people under "${parent.title}"`}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={saving}
            disabled={!ready}
            onClick={() => void submit()}
          >
            {picked.length === 0
              ? "Assign"
              : picked.length === 1
                ? "Assign to 1 person"
                : `Assign to ${picked.length} people`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Objective title" required>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ship one customer story a month"
          />
        </Field>

        {/* The parent's own quarter is the one it is given for. */}
        {!parent.dueQuarter && (
          <Field label="Due quarter" required>
            <Select
              value={quarter}
              onChange={(event) => setQuarter(event.target.value)}
            >
              {quarters.map((option) => (
                <option key={option} value={option}>
                  {quarterText(option)}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Assigned to" required>
          {/* Scrolls rather than growing the modal past the screen. A
              hundred-person department is the case this feature exists for. */}
          <div className="flex max-h-64 flex-col gap-3 overflow-y-auto rounded-md border border-line p-2">
            {groups.map((group) => {
              const ids = group.people.map((person) => person.id);
              const all = ids.every((id) => chosen.includes(id));
              return (
                <div key={group.key} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    {groups.length > 1 ? (
                      <span className="text-meta font-medium text-muted">
                        {group.name}
                      </span>
                    ) : (
                      <span />
                    )}
                    {ids.length > 1 && (
                      <WizardLink onClick={() => toggleGroup(ids)}>
                        {all ? "Clear" : "Select all"}
                      </WizardLink>
                    )}
                  </div>
                  {group.people.map((person) => (
                    <Checkbox
                      key={person.id}
                      checked={chosen.includes(person.id)}
                      onChange={() => toggle(person.id)}
                      label={`${person.fullName} · ${person.jobTitle}`}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </Field>

        {error && (
          <p role="status" className="text-body-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** People by department name, A to Z, with nobody's department last. */
function groupByDepartment(people: readonly DirectoryPerson[]): {
  key: string;
  name: string;
  people: DirectoryPerson[];
}[] {
  const byKey = new Map<
    string,
    { key: string; name: string; people: DirectoryPerson[] }
  >();
  for (const person of people) {
    const key = person.departmentId ?? person.department ?? "";
    const group = byKey.get(key) ?? {
      key,
      name: person.department ?? "No department",
      people: [],
    };
    group.people.push(person);
    byKey.set(key, group);
  }
  return [...byKey.values()].sort((x, y) =>
    x.key === "" ? 1 : y.key === "" ? -1 : x.name.localeCompare(y.name),
  );
}

/**
 * Add a measure, in two steps: what kind it is, then the fields that kind needs.
 *
 * The first step is a question and not a form because a measure is not always a
 * number. "Hire both engineers" typed as a start of 0 and a target of 1 reads as
 * "0 of 1" and says nothing about being a yes or no, and a deadline typed as a
 * percentage somebody worked out elsewhere is a figure that looks exact and
 * means little. Two kinds ship now; the rest follow as their kinds do, and each
 * is one more card here.
 *
 * ## It starts fresh every time it opens
 *
 * The old dialog kept the last measure's fields on screen the next time it was
 * opened for another objective. The wrapper bumps a key when `open` turns true,
 * which hands the form a clean state without an effect.
 *
 * ## What is sent for each kind
 *
 * A number sends no `kind`, deliberately: a server that predates kinds has a
 * strict body schema and would refuse an unknown key, and "absent means a
 * number" is what it has always meant. Done or not done sends the kind and the
 * label and nothing else, because the API refuses a number, a unit or a
 * direction on it by name.
 */
export function AddMeasureDialog(props: {
  /** `null` while closed: see the freeze in the form. */
  goalTitle: string | null;
  open: boolean;
  onClose: () => void;
  onAdd: (body: CreateKeyResultBody) => Promise<void>;
}) {
  const [seen, setSeen] = useState({ open: props.open, session: 0 });
  if (props.open !== seen.open) {
    setSeen({
      open: props.open,
      session: props.open ? seen.session + 1 : seen.session,
    });
  }
  return <AddMeasureForm key={seen.session} {...props} />;
}

function AddMeasureForm({
  goalTitle: goalTitleProp,
  open,
  onClose,
  onAdd,
}: {
  /** `null` while closed — see the freeze below for why. */
  goalTitle: string | null;
  open: boolean;
  onClose: () => void;
  onAdd: (body: CreateKeyResultBody) => Promise<void>;
}) {
  /* Remembers the last real title: the caller clears its prop to null the
     instant it closes this, but the modal has to stay mounted with real
     content so `Modal` below can animate its own close off the real `open`. */
  const [goalTitle, setGoalTitle] = useState(goalTitleProp);
  if (goalTitleProp && goalTitleProp !== goalTitle) setGoalTitle(goalTitleProp);

  /* "choose" is the first step; the other two are the kind that was picked. A
     number is pre-selected, because it is what every measure was until now. */
  const [step, setStep] = useState<"choose" | MeasureKind>("choose");
  const [picked, setPicked] = useState<MeasureKind>("NUMBER");

  const [label, setLabel] = useState("");
  const [unit, setUnit] = useState("");
  const [start, setStart] = useState("0");
  const [target, setTarget] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  if (goalTitle === null) return null;

  const submit = async () => {
    const found: Record<string, string> = {};
    const problems = measureProblems({
      kind: step === "DONE" ? "DONE" : "NUMBER",
      label,
      start,
      target,
    });
    if (problems.label) found["label"] = problems.label;
    if (problems.target) found["target"] = problems.target;

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      if (step === "DONE") {
        await onAdd({ kind: "DONE", label: label.trim() });
        return;
      }
      const body: CreateKeyResultBody = {
        label: label.trim(),
        targetValue: target.trim(),
        startValue: start.trim() || "0",
      };
      if (unit.trim()) body.unit = unit.trim();
      /* No direction to ask: a target below where it starts is one that is
         meant to come down. */
      if (goesDown(start, target)) body.lowerIsBetter = true;
      await onAdd(body);
    } finally {
      setSaving(false);
    }
  };

  const choosing = step === "choose";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a target"
      description={goalTitle}
      size="md"
      footer={
        choosing ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="accent" onClick={() => setStep(picked)}>
              Next
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setStep("choose")}>Back</Button>
            <Button
              variant="accent"
              loading={saving}
              onClick={() => void submit()}
            >
              Add target
            </Button>
          </>
        )
      }
    >
      {choosing ? (
        <FieldSet legend="What kind of target is this?">
          <div className="grid gap-3 sm:grid-cols-2">
            <RadioCard
              name="measure-kind"
              value="NUMBER"
              checked={picked === "NUMBER"}
              onChange={() => setPicked("NUMBER")}
              icon={<Target aria-hidden="true" />}
              label="A number to reach"
            />
            <RadioCard
              name="measure-kind"
              value="DONE"
              checked={picked === "DONE"}
              onChange={() => setPicked("DONE")}
              icon={<CheckCircle2 aria-hidden="true" />}
              label="Done or not done"
            />
          </div>
        </FieldSet>
      ) : step === "DONE" ? (
        <div className="flex flex-col gap-4">
          <Field
            label="What does done mean?"
            required
            {...(errors["label"] ? { error: errors["label"] } : {})}
          >
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Both engineers hired"
            />
          </Field>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field
            label="What"
            required
            {...(errors["label"] ? { error: errors["label"] } : {})}
          >
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Offers accepted"
            />
          </Field>

          {/* From and To are the whole of the direction: a target below the
              start is one that comes down, so there is nothing to tick. The
              unit is typed once, and shows on both as a suffix. */}
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_7rem]">
            <Field label="From" required>
              <Input
                inputMode="decimal"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                {...(unit.trim() ? { suffix: unit.trim() } : {})}
              />
            </Field>
            <Field
              label="To"
              required
              {...(errors["target"] ? { error: errors["target"] } : {})}
            >
              <Input
                inputMode="decimal"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                {...(unit.trim() ? { suffix: unit.trim() } : {})}
              />
            </Field>
            <Field label="Unit" optional>
              <Input
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                placeholder="₦, %, days"
              />
            </Field>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/** Stopping a KPI. The reason is required because it is the only record of it. */
export function StopKpiDialog({
  goalTitle: goalTitleProp,
  open,
  onClose,
  onStop,
}: {
  /** `null` while closed — see the freeze below for why. */
  goalTitle: string | null;
  open: boolean;
  onClose: () => void;
  onStop: (reason: string) => Promise<void>;
}) {
  /* Remembers the last real title: the caller clears its prop to null the
     instant it closes this, but the modal has to stay mounted with real
     content so `Modal` below can animate its own close off the real `open`. */
  const [goalTitle, setGoalTitle] = useState(goalTitleProp);
  if (goalTitleProp && goalTitleProp !== goalTitle) setGoalTitle(goalTitleProp);

  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  if (goalTitle === null) return null;

  /* Three characters, as the API asks. Until then the button is unavailable:
     the field's name says it is needed, and nothing is shown in red for an
     empty box. */
  const ready = reason.trim().length >= 3;

  const submit = async () => {
    if (!ready) return;
    setSaving(true);
    try {
      await onStop(reason.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Stop this objective?"
      description={goalTitle}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            loading={saving}
            disabled={!ready}
            onClick={() => void submit()}
          >
            Stop it
          </Button>
        </>
      }
    >
      <Field label="Why are you stopping it" required>
        <Textarea
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Whether the words of this objective can still be changed.
 *
 * An agreed target is frozen — the title, the period and every measure's target
 * are what two people agreed — and the API refuses all of them, so the control is
 * not offered; the card already says why and offers "Reopen the target", which is
 * the way through. A finished one is the record of what was achieved.
 */
export const mayEditGoal = (goal: ApiGoal): boolean =>
  !goal.targetFrozen && goal.status !== "DONE";

/**
 * Why this one cannot be deleted, or null when it can.
 *
 * The same four refusals `removeGoal` makes, so the button is absent rather than
 * offering a click that comes back "no". An agreed objective is the record of an
 * agreement and a refused one the record of a refusal — stopping keeps both —
 * and one with others laddering up to it is holding up somebody else's page.
 */
export function deleteBlocker(goal: ApiGoal): string | null {
  if (goal.status === "DONE") {
    return "Done, so it is a record of what was achieved. It stays.";
  }
  if (goal.approval === "AGREED") {
    return "Agreed, so it is the record of that agreement. Stop it instead of deleting it.";
  }
  if (goal.approval === "REJECTED") {
    return "Not agreed, and that refusal is a record. It stays.";
  }
  if (goal.childCount > 0) {
    return `${String(goal.childCount)} ${
      goal.childCount === 1 ? "goal ladders" : "goals ladder"
    } up to this one. Move or delete ${
      goal.childCount === 1 ? "it" : "those"
    } first.`;
  }
  return null;
}

/**
 * Changing what a not-yet-agreed objective says: its title, period and
 * description.
 *
 * Only what changed is sent, so saving after touching nothing is not offered and
 * a field somebody did not mean to move is not re-written. Who it is assigned to
 * is deliberately not here: handing an objective to somebody else is a different
 * act with its own permission rules, and a form that quietly did both would make
 * the rarer one easy to do by accident.
 */
export function EditGoalDialog({
  goal,
  open,
  onClose,
  onSave,
}: {
  goal: ApiGoal | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, body: UpdateGoalBody) => Promise<boolean>;
}) {
  const { cycles } = useAppraisals();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [quarter, setQuarter] = useState("");
  /* `null` until the person touches the select, so that what it shows is the
     objective's own period, or else the open one, even if the periods arrive
     after the dialog does. */
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* Filled from the objective each time it opens. The dialog stays mounted so
     its exit can animate, which would otherwise leave the last one's words in it
     for the next. */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const key = open && goal ? goal.id : null;
  if (key !== loadedFor) {
    setLoadedFor(key);
    if (goal && key) {
      setTitle(goal.title);
      setDescription(goal.description ?? "");
      setQuarter(goal.dueQuarter ?? "");
      setPicked(null);
      setError(null);
      setPeriodError(null);
    }
  }

  const quarters = quarterOptions(useQuarterToday());
  const quarterChoices =
    goal?.dueQuarter && !quarters.includes(goal.dueQuarter)
      ? [goal.dueQuarter, ...quarters]
      : quarters;
  const periods = cycles.filter(
    (cycle) => cycle.stage !== "PUBLISHED" || cycle.id === goal?.reviewCycleId,
  );
  /* One word for every rung (UAT 23 Nov, U94): it was "KPI" for a person's own. */
  const word = "objective";
  /* A KPI that is somebody's own has to be filed in a period, whenever there is
     one to file it in. Editing an old one that was never filed asks for it,
     which is the way out the upload's notes already point to. */
  const needsPeriod = goal?.level === "personal" && periods.length > 0;
  /* The period it is filed in, or else the one that is open, so the person
     confirms a period and does not have to find one. A shared objective is not
     filed for them. */
  const reviewCycleId =
    picked ??
    goal?.reviewCycleId ??
    (needsPeriod ? defaultPeriodId(periods) : "");

  const body: UpdateGoalBody = {};
  if (goal) {
    if (title.trim() !== goal.title) body.title = title.trim();
    if (description.trim() !== (goal.description ?? "")) {
      body.description = description.trim() === "" ? null : description.trim();
    }
    if (reviewCycleId !== (goal.reviewCycleId ?? "")) {
      body.reviewCycleId = reviewCycleId === "" ? null : reviewCycleId;
      /* An objective with no quarter gets the one its period starts in (or,
         for a period with no dates, is due in), so nobody types beside a
         period what it already says. One that has a quarter keeps it: it was
         somebody's choice, and picking a period is not a reason to move it. */
      const cycle = periods.find((period) => period.id === reviewCycleId);
      if (cycle && !goal.dueQuarter) {
        const derived = quarterOfPeriod(cycle, quarters[1] ?? "");
        if (derived !== "") body.dueQuarter = derived;
      }
    }
    /* Only a company with no periods at all asks for the quarter itself. */
    if (periods.length === 0 && quarter !== (goal.dueQuarter ?? "")) {
      body.dueQuarter = quarter === "" ? null : quarter;
    }
  }
  const changed = Object.keys(body).length > 0;

  const submit = async () => {
    if (!goal) return;
    if (title.trim().length < 3) {
      setError("Give it a title of at least three characters.");
      return;
    }
    if (needsPeriod && reviewCycleId === "") {
      setPeriodError("Choose a period.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(goal.id, body);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit this ${word}`}
      description={goal?.title ?? ""}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={saving}
            disabled={!changed}
            onClick={() => void submit()}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Objective title" required {...(error ? { error } : {})}>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>

        {/* One field for when: the period, and the quarter follows it. With no
            period to pick, the quarter is the only way to date it. */}
        {periods.length > 0 ? (
          <Field
            {...(needsPeriod ? { required: true } : { optional: true })}
            label="Period"
            {...(periodError ? { error: periodError } : {})}
          >
            <Select
              value={reviewCycleId}
              onChange={(event) => {
                setPicked(event.target.value);
                setPeriodError(null);
              }}
            >
              {needsPeriod ? (
                reviewCycleId === "" && (
                  <option value="">Choose a period</option>
                )
              ) : (
                <option value="">None</option>
              )}
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Due quarter" required>
            <Select
              value={quarter}
              onChange={(event) => setQuarter(event.target.value)}
            >
              {quarter === "" && <option value="">Choose a quarter</option>}
              {quarterChoices.map((option) => (
                <option key={option} value={option}>
                  {quarterText(option)}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field optional label="Description">
          <Textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Deleting an objective that nobody has agreed.
 *
 * Says what goes with it, because a delete is the one move here that leaves no
 * trace to open later: its measures go too, and nothing is kept. That is the one
 * line; where Stop would do instead is not argued here. The button names the act
 * rather than saying "Confirm", and the safe choice is the first one.
 */
export function DeleteGoalDialog({
  goal,
  open,
  onClose,
  onDelete,
}: {
  goal: ApiGoal | null;
  open: boolean;
  onClose: () => void;
  onDelete: (goal: ApiGoal) => Promise<boolean>;
}) {
  const [saving, setSaving] = useState(false);
  /* Kept while it closes, for the same reason the dialogs above keep their
     text: the caller clears the objective the instant it closes this. */
  const [shown, setShown] = useState<ApiGoal | null>(goal);
  if (open && goal && goal !== shown) setShown(goal);
  const target = goal ?? shown;
  const word = "objective";
  const measures = target?.keyResults.length ?? 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Delete this ${word}?`}
      description={target?.title ?? ""}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            loading={saving}
            onClick={() => {
              if (!target) return;
              setSaving(true);
              void onDelete(target).finally(() => setSaving(false));
            }}
          >
            {`Delete ${word}`}
          </Button>
        </>
      }
    >
      <p className="text-body-sm text-body">
        {measures > 0
          ? `This removes it for good, along with its ${String(measures)} ${
              measures === 1 ? "target" : "targets"
            }. It cannot be undone.`
          : "This removes it for good. It cannot be undone."}
      </p>
    </Modal>
  );
}
