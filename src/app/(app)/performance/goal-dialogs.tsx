"use client";

import { CheckCircle2, Target } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Button,
  Callout,
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
  SuggestButton,
  SuggestionPanel,
} from "@/components/performance/suggestions";
import {
  currentQuarter,
  parseMeasure,
  type ApiGoal,
  type CreateGoalBody,
  type CreateKeyResultBody,
  type MeasureKind,
  type UpdateGoalBody,
} from "@/lib/api/performance";
import { ApiError } from "@/lib/api/client";
import { useCan } from "@/lib/permissions";
import { useObjectiveSuggestions } from "@/lib/store/ai";
import {
  useDepartments,
  useHeadedDepartmentIds,
} from "@/lib/store/departments";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useAppraisals } from "@/lib/store/performance";
import { useOrgTimezone, useSession } from "@/lib/store/session";
import { todayIn } from "@/lib/time";
import { TODAY } from "@/lib/today";
import {
  objectiveWhoseChoices,
  peopleILead,
  type LeadReach,
} from "./goal-facts";

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
function useLeadReach(): LeadReach {
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

/* -------------------------------------------------------------------------- */

/**
 * Whether a KPI has to be filed in an appraisal period, and the one sentence
 * that says so.
 *
 * A KPI is a person's own work, and an objective filed in no period "counts
 * towards nobody's appraisal mark, even once it is agreed": it is tracked,
 * agreed and scored for nobody, with nothing on the screen to say so. So when
 * there is a period to choose, choosing one is not optional.
 *
 * Only a **personal** one, and only while there is a period to choose. A shared
 * objective (the company's, a department's) is a standing target that may
 * belong to no cycle, and a company that has no open period yet has nothing to
 * file anything under, which is said in words rather than by refusing to save.
 *
 * The API still accepts an objective with no period: this is the form's rule,
 * not the server's.
 */
const NEEDS_PERIOD =
  "Choose the appraisal period this is scored in. A KPI with none counts towards nobody's mark, even once it is agreed.";

/**
 * The form for a new KPI, and — in `objective` mode — for a new objective.
 *
 * Same fields, same save, same rules on the API. The mode changes what the
 * form calls itself and who it offers: an objective is the company's, a
 * department's or the maker's own, so it leaves out the list of people a leader
 * could hand a KPI to. That list is the KPI form's, and the next step from a
 * new objective ("Give a KPI to people") does it better, in bulk.
 */
export function NewKpiDialog({
  parentId: parentIdProp,
  parentTitle: parentTitleProp,
  mode: modeProp = "kpi",
  open,
  onClose,
  onCreate,
}: {
  parentId?: string;
  parentTitle?: string;
  mode?: "kpi" | "objective";
  open: boolean;
  onClose: () => void;
  onCreate: (body: CreateGoalBody) => Promise<void>;
}) {
  /* What this dialog is for, kept while it closes. The caller clears its own
     state the instant it closes this, and an exit animation that read
     "New KPI" over a form that said "New objective" a moment ago would be the
     dialog changing its mind on the way out. */
  const [mode, setMode] = useState(modeProp);
  if (open && modeProp !== mode) setMode(modeProp);
  const [parentId, setParentId] = useState(parentIdProp);
  if (open && parentIdProp !== parentId) setParentId(parentIdProp);
  const [parentTitle, setParentTitle] = useState(parentTitleProp);
  if (open && parentTitleProp !== parentTitle) setParentTitle(parentTitleProp);
  const objective = mode === "objective";

  const { people } = useEmployeeDirectory({ pageSize: 200 });
  const { employeeId } = useSession();
  const reach = useLeadReach();
  /* A company KPI has no owner and everybody can read it, which is why the API
     gates it. The option is absent rather than disabled for the same reason. */
  const canSetCompanyWide = useCan("EDIT_RECORDS");

  /**
   * The departments this person may file a shared target under.
   *
   * The cascade's middle rung, and it rides in the **same control** as the
   * owner rather than a second field beside it. "Whose is this" has exactly
   * three kinds of answer — the company's, a department's, or a person's —
   * so one select is the question, and a separate department picker that only
   * applies when the owner is nobody would be two controls describing one
   * choice.
   *
   * Only the ones the API will accept: heading it is enough, and
   * `EDIT_RECORDS` covers all of them. Offering a department the save would
   * refuse puts a name in front of somebody that does not work.
   */
  const { flat: departments } = useDepartments();
  const mine = departments.filter(
    (department) =>
      canSetCompanyWide ||
      (employeeId !== null && department.headId === employeeId),
  );

  /**
   * The appraisal periods an objective can be scored in.
   *
   * A published one is absent: its marks are a record, and filing a new
   * objective into it would change a score somebody has already been told.
   */
  const { cycles, loading: periodsLoading } = useAppraisals();
  const openPeriods = cycles.filter((cycle) => cycle.stage !== "PUBLISHED");

  const quarters = quarterOptions(useQuarterToday());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  /* `null` is "not chosen yet", so the starting answer can follow the
     departments as they arrive rather than being fixed at mount, before they
     have loaded. */
  const [chosenOwner, setChosenOwner] = useState<string | null>(null);
  const [quarter, setQuarter] = useState(quarters[1] ?? quarters[0] ?? "");
  /* `null` is "not chosen yet", for the same reason as the owner above: when a
     KPI has exactly one period to go in, that is the starting answer, and it
     follows the periods as they arrive instead of being fixed at mount. Empty
     is a real choice only for a shared objective — see the copy below. */
  const [chosenPeriod, setChosenPeriod] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* A blank form on every open. This dialog stays mounted between uses so its
     exit can animate, which also means it keeps whatever was typed last time:
     the second objective somebody makes, or the KPI they add under the one they
     have just made, would start with the first one's title in it. */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle("");
      setDescription("");
      setChosenOwner(null);
      setQuarter(quarters[1] ?? quarters[0] ?? "");
      setChosenPeriod(null);
      setError(null);
      setPeriodError(null);
    }
  }

  /* The objective form's own list of answers; the KPI form builds its own
     below. See `objectiveWhoseChoices`. */
  const whose = objectiveWhoseChoices({
    departments,
    employeeId,
    canSetCompanyWide,
  });
  const owner = chosenOwner ?? (objective ? whose.fallback : "me");
  const personal = owner !== "company" && !owner.startsWith("dept:");
  const needsPeriod = !objective && personal && openPeriods.length > 0;
  const onlyPeriod = openPeriods.length === 1 ? (openPeriods[0]?.id ?? "") : "";
  const reviewCycleId = chosenPeriod ?? (needsPeriod ? onlyPeriod : "");

  /**
   * Suggestions, only under a parent.
   *
   * A KPI with no parent has nothing to be suggested *from* — this is the
   * "turn the company goal into something my team can be held to" case, and
   * the parent goal is the whole of the grounding. Offering the button on a
   * top-level KPI would be offering to invent a company's objectives, which is
   * not a blank page anybody should have filled for them.
   */
  const suggestions = useObjectiveSuggestions();

  const submit = async () => {
    if (title.trim().length < 3) {
      setError("Give it a title of at least three characters.");
      return;
    }
    if (needsPeriod && reviewCycleId === "") {
      setPeriodError(NEEDS_PERIOD);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const body: CreateGoalBody = { title: title.trim() };
      if (description.trim()) body.description = description.trim();
      if (parentId) body.parentId = parentId;
      if (quarter) body.dueQuarter = quarter;
      if (reviewCycleId) body.reviewCycleId = reviewCycleId;
      if (owner === "company") body.ownerId = null;
      else if (owner.startsWith("dept:")) {
        /* A shared target: nobody owns it, and the department is what makes it
           a department objective rather than a company one. */
        body.ownerId = null;
        body.departmentId = owner.slice("dept:".length);
      } else if (owner !== "me") body.ownerId = owner;
      await onCreate(body);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        parentTitle
          ? `${objective ? "New objective" : "New KPI"} under "${parentTitle}"`
          : objective
            ? "New objective"
            : "New KPI"
      }
      description={
        objective && !parentTitle
          ? "Once it is made you can add KPIs under it, or give them to people."
          : undefined
      }
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={saving}
            /* While the company's periods are still arriving there is no way
               to know whether this has one to be filed in, and a KPI saved in
               that moment would be filed in none. */
            disabled={periodsLoading === true && cycles.length === 0}
            onClick={() => void submit()}
          >
            {objective ? "Create objective" : "Create KPI"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label={objective ? "Objective title" : "KPI title"}
          required
          {...(error ? { error } : {})}
          help="Say it the way you would to the person doing it."
        >
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Fill the two Lagos engineering roles"
          />
        </Field>

        {/* Under the field it fills, not above it: the blank page is the thing
            being helped with, and a suggestion panel above the input would read
            as the primary way to write a KPI. Typing it yourself is. */}
        {parentId && (
          <div className="flex flex-col gap-3">
            <SuggestButton
              loading={suggestions.loading}
              label="Suggest objectives under this goal"
              onClick={() => void suggestions.ask({ goalId: parentId })}
            />
            <SuggestionPanel
              state={suggestions}
              onDismiss={suggestions.clear}
              useLabel="Use this"
              emptyHint="Edit it before you save."
              /* The only path from a suggestion into the form, and it lands in
                 the editable fields rather than in the create call. Measures
                 are shown on the suggestion and deliberately not applied —
                 this dialog cannot create one (`AddMeasureDialog` does), and
                 silently dropping them would be worse than showing them as the
                 next thing to add. */
              onUse={(suggestion) => {
                setTitle(suggestion.title);
                if (suggestion.detail) setDescription(suggestion.detail);
                setError(null);
              }}
            />
          </div>
        )}

        <Field label="Assigned to" required>
          <Select
            value={owner}
            onChange={(event) => setChosenOwner(event.target.value)}
          >
            {objective ? (
              whose.choices.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))
            ) : (
              <>
                <option value="me">Mine</option>
                {canSetCompanyWide && (
                  <option value="company">
                    The whole company (everyone sees it)
                  </option>
                )}
                {/* The middle rung. A department's target is nobody's
                    personally, so it lives with "the whole company" rather
                    than among the names — and each one says which department,
                    because "a department" without saying which is half a
                    fact. */}
                {mine.map((department) => (
                  <option key={department.id} value={`dept:${department.id}`}>
                    {department.name}, the whole department
                  </option>
                ))}
                {/* The API's own rule, not a longer list than it will accept,
                    and not a shorter one either. `createGoal` refuses anybody
                    who is not the caller, a direct report, somebody in a
                    department the caller heads, or anybody at all with
                    EDIT_RECORDS.

                    This used to read `managerId === employeeId`, which was the
                    rule when the comment was written and is narrower than the
                    one the API now applies — so a department head was not
                    offered their own department. `peopleILead` is the
                    current rule, shared with the assign dialog so the two
                    cannot drift again.

                    `person.id !== employeeId` stays here rather than in the
                    helper: this select has its own "me" option above. */}
                {peopleILead(people, reach)
                  .filter((person) => person.id !== employeeId)
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.fullName} · {person.jobTitle}
                    </option>
                  ))}
              </>
            )}
          </Select>
        </Field>

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

        {openPeriods.length > 0 && (
          <Field
            {...(needsPeriod ? { required: true } : { optional: true })}
            label="Appraisal period"
            {...(periodError ? { error: periodError } : {})}
            help={
              reviewCycleId
                ? "Counts towards this person's mark for that period, once somebody agrees it."
                : needsPeriod
                  ? "Pick the period this is scored in."
                  : "Without an appraisal period, this objective will not count towards anyone's mark, even once it is agreed."
            }
          >
            <Select
              value={reviewCycleId}
              onChange={(event) => {
                setChosenPeriod(event.target.value);
                setPeriodError(null);
              }}
            >
              {needsPeriod ? (
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

        {/* Said in words, because there is nothing to choose and nothing to
            refuse: a company that has not started a period yet is not stopped
            from writing its KPIs down. Not while the list is still arriving. */}
        {!objective &&
          personal &&
          openPeriods.length === 0 &&
          periodsLoading !== true && (
            <Callout tone="warning">
              No appraisal period is open, so this KPI will count towards
              nobody&apos;s mark. Start a period first, then edit the KPI to
              file it in that period.
            </Callout>
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
 * Adding a measure.
 *
 * The direction check is done here as well as on the server, with the same
 * wording. Not because the server cannot be trusted, but because "the target is
 * below where you started — tick the box if it is meant to come down" is worth
 * saying while somebody is still looking at the two fields.
 */
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
 * Every KPI it creates is a **draft**. Assigning is not agreeing; the person
 * it belongs to still sends it to be agreed, which is what makes an agreement
 * worth anything.
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

  /* Everybody when the objective is the company's; the department's own people
     when it is a department's. Filing a Sales KPI under Marketing's target is
     something the API refuses, so the list does not offer it. */
  const { people: inScope } = useEmployeeDirectory(
    parent?.departmentId
      ? { departmentId: parent.departmentId, pageSize: 200 }
      : { pageSize: 200 },
  );
  const reach = useLeadReach();

  /**
   * ...and then the caller's own reach, which this did not apply at all.
   *
   * Narrowing by the parent's department answers "whose KPI could this be" and
   * not "whose KPI may *you* set". So the dialog was identical for every role
   * tested: ten checkboxes and no narrowing, on a control that reads as a bulk
   * action, while `assignGoal` refuses each name one at a time — *"… is not
   * somebody you set goals for."* For an employee every box was a dead option.
   */
  const employees = useMemo(
    () => peopleILead(inScope, reach),
    [inScope, reach],
  );

  const quarters = quarterOptions(useQuarterToday());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
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
      setTitle("");
      setDescription("");
      setChosen([]);
      setQuarter(
        (parentProp ?? parent)?.dueQuarter ?? quarters[1] ?? quarters[0] ?? "",
      );
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

  const submit = async () => {
    if (title.trim().length < 3) {
      setError("Give it a title of at least three characters.");
      return;
    }
    if (picked.length === 0) {
      setError("Pick at least one person.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const body: {
        title: string;
        description?: string;
        employeeIds: string[];
        dueQuarter?: string;
      } = { title: title.trim(), employeeIds: picked };
      if (description.trim()) body.description = description.trim();
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
      title={`Give a KPI to people under "${parent.title}"`}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={saving}
            onClick={() => void submit()}
          >
            {picked.length === 1
              ? "Assign to 1 person"
              : `Assign to ${picked.length} people`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="KPI title"
          required
          {...(error ? { error } : {})}
          help="The same KPI, worded once. Each person gets their own copy to track."
        >
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ship one customer story a month"
          />
        </Field>

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

        <Field
          label="Assigned to"
          required
          help={
            parent.departmentId
              ? "The people in this department."
              : "Anybody, since this is a company objective."
          }
        >
          {employees.length === 0 ? (
            <p className="text-body-sm text-muted">
              {inScope.length === 0
                ? "Nobody is in this department yet, so there is nobody to give it to."
                : "Nobody here is yours to set goals for. You can assign to the people who report to you and to the departments you head."}
            </p>
          ) : (
            /* Scrolls rather than growing the modal past the screen. A
               hundred-person department is the case this feature exists for. */
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border border-line p-2">
              {employees.map((person) => (
                <Checkbox
                  key={person.id}
                  checked={chosen.includes(person.id)}
                  onChange={() => toggle(person.id)}
                  label={`${person.fullName} · ${person.jobTitle}`}
                />
              ))}
            </div>
          )}
        </Field>

        <Field optional label="Description">
          <Textarea
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        {/* Said before the button, not after the save. Somebody assigning eight
            KPIs should know they are drafts, or they will wonder why nothing is
            agreed. */}
        <p className="text-body-sm text-muted">
          Each person gets their own KPI as a draft. They send it to be agreed —
          assigning it is not the same as agreeing it.
        </p>
      </div>
    </Modal>
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
  const [current, setCurrent] = useState("");
  const [countDown, setCountDown] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  if (goalTitle === null) return null;

  const submit = async () => {
    const found: Record<string, string> = {};
    if (label.trim().length < 2)
      found["label"] =
        step === "DONE"
          ? "Say what done means, in a few words."
          : "Name what is being measured.";

    if (step === "NUMBER") {
      if (!target.trim()) found["target"] = "Set the number you are aiming at.";

      const from = parseMeasure(start.trim() || "0");
      const to = parseMeasure(target.trim() || "0");
      if (target.trim() && from === to) {
        found["target"] =
          "That is the same as the starting number, so there is nothing to measure.";
      } else if (target.trim() && countDown && to > from) {
        found["target"] =
          "This one counts down, so the target has to be below the starting number.";
      } else if (target.trim() && !countDown && to < from) {
        found["target"] =
          "The target is below the starting number. Tick the box if it is meant to come down.";
      }
    }

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
      if (current.trim()) body.currentValue = current.trim();
      if (countDown) body.lowerIsBetter = true;
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
      title="Add a measure"
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
              Add measure
            </Button>
          </>
        )
      }
    >
      {choosing ? (
        <FieldSet legend="What kind of measure is this?">
          <div className="grid gap-3 sm:grid-cols-2">
            <RadioCard
              name="measure-kind"
              value="NUMBER"
              checked={picked === "NUMBER"}
              onChange={() => setPicked("NUMBER")}
              icon={<Target aria-hidden="true" />}
              label="A number to reach"
              description="A figure that moves from where it is to a target: revenue of ₦40m, 12 hires, cost down to ₦300k."
            />
            <RadioCard
              name="measure-kind"
              value="DONE"
              checked={picked === "DONE"}
              onChange={() => setPicked("DONE")}
              icon={<CheckCircle2 aria-hidden="true" />}
              label="Done or not done"
              description="Something that is finished or it is not: the filing is submitted. A manager confirms it when it is done."
            />
          </div>
        </FieldSet>
      ) : step === "DONE" ? (
        <div className="flex flex-col gap-4">
          <Field
            label="What does done mean?"
            required
            help="Say it so a manager can tell whether it happened. A manager confirms it when it is done, and until then it counts as not done."
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
            label="Measure"
            required
            {...(errors["label"] ? { error: errors["label"] } : {})}
          >
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Offers accepted"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Starting value" required>
              <Input
                inputMode="decimal"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </Field>
            <Field
              label="Target value"
              required
              {...(errors["target"] ? { error: errors["target"] } : {})}
            >
              <Input
                inputMode="decimal"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              />
            </Field>
            <Field
              label="Current value"
              help="Leave blank if nothing has been measured yet. The measure then counts as unread and stays out of the objective's progress until a reading is entered."
            >
              <Input
                inputMode="decimal"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Unit"
            help="₦, %, days, customers, whatever you say out loud."
          >
            <Input
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
            />
          </Field>

          <Checkbox
            label="This number should go down"
            description="Cost, days to hire, complaints. Progress is how far it has fallen."
            checked={countDown}
            onChange={(event) => setCountDown(event.target.checked)}
          />
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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (goalTitle === null) return null;

  const submit = async () => {
    if (reason.trim().length < 3) {
      setError("Say why in a few words. Whoever owns this will be told.");
      return;
    }
    setError(null);
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
      title="Stop this KPI"
      description={goalTitle}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Keep it</Button>
          <Button
            variant="danger"
            loading={saving}
            onClick={() => void submit()}
          >
            Stop it
          </Button>
        </>
      }
    >
      <Field
        label="Why are you stopping it"
        required
        {...(error ? { error } : {})}
        /* What actually happens, which is not what this used to promise.
           `cancelGoal` sets the status to off track and sends the reason to
           the objective's owner as a notification. It does **not** write it
           onto the objective — there is no cancelled status and no reason
           column — so "with this reason against it" was a claim the reader
           would go looking for and not find. See BE-35. */
        help="It will show as off track, and the reason goes to whoever owns it. It is not kept on the objective itself."
      >
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

/** What the card calls this one: a person's own is a KPI, a shared one an objective. */
const goalWord = (goal: ApiGoal) =>
  goal.level === "personal" ? "KPI" : "objective";

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
 * Changing what a not-yet-agreed objective says: its title, quarter, appraisal
 * period and description.
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
  const [reviewCycleId, setReviewCycleId] = useState("");
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
      setReviewCycleId(goal.reviewCycleId ?? "");
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
  const word = goal ? goalWord(goal) : "objective";
  /* A KPI that is somebody's own has to be filed in a period, whenever there is
     one to file it in. Editing an old one that was never filed asks for it,
     which is the way out the upload's notes already point to. */
  const needsPeriod = word === "KPI" && periods.length > 0;

  const body: UpdateGoalBody = {};
  if (goal) {
    if (title.trim() !== goal.title) body.title = title.trim();
    if (description.trim() !== (goal.description ?? "")) {
      body.description = description.trim() === "" ? null : description.trim();
    }
    if (quarter !== (goal.dueQuarter ?? "")) {
      body.dueQuarter = quarter === "" ? null : quarter;
    }
    if (reviewCycleId !== (goal.reviewCycleId ?? "")) {
      body.reviewCycleId = reviewCycleId === "" ? null : reviewCycleId;
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
      setPeriodError(NEEDS_PERIOD);
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
        <Field
          label={`${word === "KPI" ? "KPI" : "Objective"} title`}
          required
          {...(error ? { error } : {})}
        >
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>

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

        {periods.length > 0 && (
          <Field
            {...(needsPeriod ? { required: true } : { optional: true })}
            label="Appraisal period"
            {...(periodError ? { error: periodError } : {})}
            help={
              reviewCycleId
                ? "Counts towards this person's mark for that period, once somebody agrees it."
                : needsPeriod
                  ? "Pick the period this is scored in."
                  : "Nothing here reaches an appraisal mark. A quarter alone lets the objective be agreed and still score nothing."
            }
          >
            <Select
              value={reviewCycleId}
              onChange={(event) => {
                setReviewCycleId(event.target.value);
                setPeriodError(null);
              }}
            >
              {needsPeriod ? (
                reviewCycleId === "" && (
                  <option value="">Choose an appraisal period</option>
                )
              ) : (
                <option value="">Not part of an appraisal period</option>
              )}
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
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
 * trace to open later: its measures go too, and nothing is kept. The button names
 * the act rather than saying "Confirm", and the safe choice is the first one.
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
  const word = target ? goalWord(target) : "objective";
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
          <Button onClick={onClose}>Keep it</Button>
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
              measures === 1 ? "measure" : "measures"
            }. It cannot be undone.`
          : "This removes it for good. It cannot be undone."}
      </p>
      <p className="mt-3 text-body-sm text-muted">
        Nobody has agreed it yet, so there is no agreement to lose. If it should
        stay on record as stopped, use Stop instead.
      </p>
    </Modal>
  );
}
