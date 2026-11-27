import {
  readCount,
  type ApiGoal,
  type GoalStatus,
} from "@/lib/api/performance";
import type { DirectoryPerson } from "@/lib/types";

/**
 * What is true of one objective, for the person looking at it.
 *
 * These lived inside `GoalCard`, which is the only place an objective's detail
 * used to open from. "New objective" opens the same detail from the screen
 * itself, straight after the objective is made, so the answers moved here:
 * two call sites asking the same questions would drift, and the detail modal's
 * buttons depend on every one of them.
 */

/**
 * Which rung of the ladder this is, in words.
 *
 * From the API's own `level` rather than guessed. It used to read
 * `childCount > 0 ? "Team KPI"`, which labelled a **personal** KPI that
 * happened to have children as the team's — a guess that was wrong exactly
 * where the cascade matters. A department objective names its department,
 * because "Department objective" without saying which one is half a fact.
 */
export function rungLabel(goal: ApiGoal): string {
  if (goal.level === "company") return "Company objective";
  if (goal.level === "department") {
    return goal.departmentName
      ? `${goal.departmentName} objective`
      : "Department objective";
  }
  return "Personal objective";
}

/**
 * The status to draw beside an objective, or null when there is none to draw.
 *
 * `status` is a stored column that starts at ON_TRACK and is changed only when
 * somebody changes it (marks it done, stops it, sets it). So an ON_TRACK that
 * nobody chose says nothing, and drawing it said "On track" beside an
 * objective nothing had been read for, and beside one that was declined (F14,
 * F13). A status somebody set (at risk, off track, done) is always shown. An
 * ON_TRACK is shown only once the objective is agreed and something has been
 * read against it, which is the only time it can be a claim about progress.
 */
export function shownStatus(goal: ApiGoal): GoalStatus | null {
  if (goal.status !== "ON_TRACK") return goal.status;
  const read = readCount(goal.keyResults);
  const nothingRead =
    read?.read === 0 || (goal.keyResults.length === 0 && goal.progress === 0);
  return nothingRead || goal.approval !== "AGREED" ? null : "ON_TRACK";
}

/**
 * Does this objective take a reading, or "Mark done"?
 *
 * Not once it has been declined or refused (F13). A declined objective is one
 * its approver would not agree to as written, the company's own sentence says
 * an unagreed objective is not counted, and a reading typed against it turned
 * "Declined" into "25% · On track · Mark done". Until it is agreed again the
 * way to change it is Edit and resend. A draft and one waiting to be agreed
 * still take readings: nobody has said no to them, and a person may want to
 * record where they started.
 *
 * This is the screen's rule. The API still takes the write, so a client that
 * does not ask this can still record one.
 */
export function takesReadings(goal: Pick<ApiGoal, "approval">): boolean {
  return goal.approval !== "NEEDS_REVISION" && goal.approval !== "REJECTED";
}

/** Said under a declined or refused objective's targets, in place of a box. */
export function noReadingsWords(
  goal: Pick<ApiGoal, "approval">,
): string | null {
  if (goal.approval === "NEEDS_REVISION") {
    return "It was declined, so it takes no readings until it is agreed. Edit and resend it to change it.";
  }
  if (goal.approval === "REJECTED") {
    return "It was refused, so it takes no readings.";
  }
  return null;
}

export type GoalFacts = {
  rung: string;
  progress: number;
  done: boolean;
  canShare: boolean;
  noPeriod: boolean;
  /**
   * How many of its measures have been read, or null when that is not worth
   * saying (see `readCount`). With none read, `progress` is the 0 the objective
   * was made with and not a result, and no screen may draw it as one.
   */
  reads: { read: number; of: number } | null;
};

/**
 * `actingId` is the signed-in person's own employee id.
 */
export function goalFacts(goal: ApiGoal): GoalFacts {
  const done = goal.status === "DONE";
  return {
    rung: rungLabel(goal),
    progress: goal.measuredProgress ?? goal.progress,
    done,
    canShare: goal.dueQuarter !== null && goal.keyResults.length > 0,
    /* Nothing to agree against: the API refuses to send an objective that
       belongs to no period, because one agreed for no period cannot be agreed
       before it. */
    noPeriod: goal.reviewCycleId === null && goal.dueQuarter === null,
    reads: readCount(goal.keyResults),
  };
}

/* -------------------------------------------------------------------------- */

export type WhoseChoice = { value: string; label: string };

/**
 * The answers to "whose objective is this", for the **New objective** form.
 *
 * An objective is a thing the company, a department or one person is held to,
 * so this offers exactly those three kinds and nothing narrower. Listing the
 * people somebody leads is the "New KPI" form's job — handing one person a KPI
 * is what the detail screen's "Give a KPI to people" is for, and that is where
 * this form now sends you.
 *
 * Only what the API will accept (`createGoal`): the whole company needs
 * `EDIT_RECORDS`; a department needs heading it, or `EDIT_RECORDS`; anybody
 * may make a personal one. A choice the save would refuse is not offered.
 *
 * `fallback` is where the select starts. A department you head wins — that is
 * who this button is mostly pressed by — then the company for somebody who may
 * set one (the empty cascade's own advice is "start with one company KPI"),
 * then yourself.
 */
export function objectiveWhoseChoices(input: {
  departments: readonly { id: string; name: string; headId: string | null }[];
  employeeId: string | null;
  canSetCompanyWide: boolean;
}): { choices: WhoseChoice[]; fallback: string } {
  const { departments, employeeId, canSetCompanyWide } = input;
  const heads = (department: { headId: string | null }) =>
    employeeId !== null && department.headId === employeeId;

  const choices: WhoseChoice[] = [];
  if (canSetCompanyWide) {
    choices.push({
      value: "company",
      label: "The whole company (everyone sees it)",
    });
  }
  for (const department of departments) {
    if (canSetCompanyWide || heads(department)) {
      choices.push({
        value: `dept:${department.id}`,
        label: `${department.name}, the whole department`,
      });
    }
  }
  choices.push({ value: "me", label: "Mine" });

  /* "Mine" first, for everybody with a staff record (UAT 23 Nov, U93 /
     PERF-13). It used to start on a department the person heads, so an
     employee who also heads Operations opened "New objective" on
     "Operations, the whole department": a shared target, outside any period,
     that counted towards nobody's mark. A department or the company is still
     one pick away. Somebody with no staff record cannot own one, so they start
     on the widest thing they may set. */
  const headed = departments.find(heads);
  return {
    choices,
    fallback:
      employeeId !== null
        ? "me"
        : canSetCompanyWide
          ? "company"
          : headed
            ? `dept:${headed.id}`
            : "me",
  };
}

/**
 * The appraisal period a new objective or rating starts in (UAT 23 Nov, U93 /
 * PERF-13).
 *
 * Both forms used to start on "Not part of an appraisal period", which is the
 * one choice that makes the thing count for nothing. So they start on the
 * period that is open: the one running, if exactly one is, otherwise the only
 * one not yet published. With several open and none clearly current, nothing is
 * chosen for the person, because a guess there files a mark in the wrong period.
 */
export function defaultPeriodId(
  periods: readonly { id: string; stage: string }[],
): string {
  const open = periods.filter((period) => period.stage !== "PUBLISHED");
  const running = open.filter((period) => period.stage !== "DRAFT");
  if (running.length === 1) return running[0]?.id ?? "";
  if (open.length === 1) return open[0]?.id ?? "";
  return "";
}

/* -------------------------------------------------------------------------- */

/**
 * The reach of whoever is looking: what decides whose work they lead.
 *
 * `headedDepartmentIds` is `useHeadedDepartmentIds()`; `headedDepartmentNames`
 * is the same departments by name, for a person whose row carries a department
 * name and no id (see `DirectoryPerson`).
 */
export type LeadReach = {
  employeeId: string | null;
  /** `EDIT_RECORDS`: HR leads everybody, as far as the API is concerned. */
  leadsEveryone: boolean;
  headedDepartmentIds: ReadonlySet<string>;
  headedDepartmentNames: ReadonlySet<string>;
};

/**
 * Whether this caller may set goals for this person — a mirror of the API's
 * `leadsWorkOf` (`reviewableTeamOf` + `ledTeamOf` in the performance service).
 *
 * The API's rule: everybody with `EDIT_RECORDS`; otherwise the caller's direct
 * reports (`managerId` is the caller) and everybody in a department the caller
 * **heads** — the department itself, not the ones beneath it. This asks the
 * same three questions of a row any signed-in person can read, so the dialogs
 * offer a department head the people they lead without needing the full
 * directory row that only HR is sent.
 *
 * Absent is unknown, never "no", for the two ids: a source that does not carry
 * `departmentId` is matched on the department's name instead, and one that
 * carries no `managerId` simply cannot say who somebody's manager is (so that
 * person is not offered as a direct report; the API remains the authority and
 * would refuse a guess either way).
 *
 * Self is `true`: `createGoal` and `assignGoal` both let somebody set their
 * own. A call site that wants "somebody else" says so itself, because only it
 * knows whether it offers a separate "me" option.
 */
export function leadsWorkOf(
  person: DirectoryPerson,
  reach: LeadReach,
): boolean {
  if (reach.leadsEveryone) return true;
  if (reach.employeeId === null) return false;
  if (person.id === reach.employeeId) return true;
  if (person.managerId === reach.employeeId) return true;
  if (person.departmentId !== undefined) {
    return (
      person.departmentId !== null &&
      reach.headedDepartmentIds.has(person.departmentId)
    );
  }
  return (
    person.department !== null &&
    reach.headedDepartmentNames.has(person.department)
  );
}

/** `leadsWorkOf` over a list, in the list's own order. */
export function peopleILead(
  people: readonly DirectoryPerson[],
  reach: LeadReach,
): DirectoryPerson[] {
  return people.filter((person) => leadsWorkOf(person, reach));
}
