/**
 * The words the Projects module speaks, in one file.
 *
 * ## Why one file
 *
 * The standup said "issue", "sprint" and "backlog" put off the people this
 * module is for: media, health, anyone who has never used a ticket tracker.
 * Kene's answer was one friendly vocabulary for everybody, not a setting per
 * company. This file is that vocabulary. Every screen, history sentence, toast
 * and tab label that names a thing the module is about reads it from here, so a
 * word Kene wants changed at review is changed once.
 *
 * | Was                    | Now                                              |
 * | ---------------------- | ------------------------------------------------ |
 * | Issue, Story           | Task (a stored STORY is shown as a Task)         |
 * | Bug                    | Problem                                          |
 * | Sub-task               | Subtask                                          |
 * | Epic                   | Initiative                                       |
 * | Sprint                 | Cycle                                            |
 * | Backlog                | Later                                            |
 * | Story points           | Effort                                           |
 * | Status / WIP limit     | Stage / Limit                                    |
 * | Burndown / Velocity    | Progress / Pace                                  |
 * | Watchers               | Following                                        |
 * | Create issue           | New task                                         |
 * | Backlog / Roadmap tabs | Plan / Timeline                                  |
 * | Reports / All issues   | Progress / Tasks                                 |
 *
 * ## What this does not touch
 *
 * Display only. The stored values (`EPIC`, `SPRINT`, `STORY`, `BUG`, `SUBTASK`),
 * the API paths (`/issues`, `/sprints`), the `?view=` ids, the `?issue=` link,
 * the audit action names and every type and field name keep their old spelling,
 * because they are contracts with the API and with links people have saved.
 * Text the API sends (a notification, a history row) arrives as it was sent.
 * A sprint somebody already named "KEY Sprint 3" keeps that name: it is their
 * data, not our label.
 *
 * ## Rules the words follow
 *
 * Sentence case. No exclamation marks. Short, plain words. A count is always
 * written through `count()`, so "1 task" and "2 tasks" are both right and the
 * board never says "1 tasks" again. `tests/projects-friendly-words.test.ts`
 * fails when a retired word returns to a visible string.
 *
 * This file imports types only, so it can be read from `types.ts` without a
 * cycle.
 */

import type { IssueType, ProjectType, StatusCategory } from "./types";

/* --------------------------------------------------------------- nouns -- */

export type Noun = {
  /** "task" */
  one: string;
  /** "tasks" */
  many: string;
  /** "Task" */
  One: string;
  /** "Tasks" */
  Many: string;
};

const cap = (word: string): string =>
  word.charAt(0).toUpperCase() + word.slice(1);

function noun(one: string, many: string = `${one}s`): Noun {
  return { one, many, One: cap(one), Many: cap(many) };
}

/**
 * The things the module counts and names. Use the forms in a sentence
 * (`` `No ${NOUNS.cycle.one} is running` ``) and `count()` for a number.
 */
export const NOUNS = {
  task: noun("task"),
  problem: noun("problem"),
  subtask: noun("subtask"),
  initiative: noun("initiative"),
  cycle: noun("cycle"),
  stage: noun("stage"),
  /** The advisory cap on how many tasks a stage should hold. */
  limit: noun("limit"),
  project: noun("project"),
  /** A department or team's collection of projects, one level above a project. */
  program: noun("program"),
  /** Not countable: "5 effort", "Effort left". The word stays the same. */
  effort: noun("effort", "effort"),
} as const;

export type NounKey = keyof typeof NOUNS;

export const TASK = NOUNS.task;
export const PROBLEM = NOUNS.problem;
export const SUBTASK = NOUNS.subtask;
export const INITIATIVE = NOUNS.initiative;
export const CYCLE = NOUNS.cycle;
export const STAGE = NOUNS.stage;
export const LIMIT = NOUNS.limit;
export const EFFORT = NOUNS.effort;

/** "1 task", "2 tasks", "0 tasks". */
export function count(n: number, key: NounKey): string {
  return `${n} ${n === 1 ? NOUNS[key].one : NOUNS[key].many}`;
}

/** The noun alone, in the right number: "task" for 1, "tasks" otherwise. */
export function nounFor(n: number, key: NounKey): string {
  return n === 1 ? NOUNS[key].one : NOUNS[key].many;
}

export const PROGRAM = NOUNS.program;
export const PROJECT = NOUNS.project;

/* ------------------------------------------------------ names of places -- */

/** The list of work not yet planned into a cycle. Kept capitalised: it is a place, not a thing. */
export const LATER = "Later";
/** Who is keeping an eye on a task. */
export const FOLLOWING = "Following";
export const FOLLOW = "Follow";
export const UNFOLLOW = "Unfollow";

/* ---------------------------------------------------------- the tabs -- */

/**
 * A project's tabs. The **keys are the `?view=` ids** and never change, so a
 * link saved before the rename (`?view=backlog`, `?view=roadmap`,
 * `?view=reports`, `?view=issues`) still lands on the right tab. Only the
 * words people read are here.
 */
export const TAB_LABEL = {
  board: "Board",
  backlog: "Plan",
  roadmap: "Timeline",
  reports: "Progress",
  issues: "Tasks",
  settings: "Settings",
} as const;

export type ProjectViewId = keyof typeof TAB_LABEL;

/* ------------------------------------------------------------ the types -- */

/**
 * What each stored type is called. A STORY is a task that was filed under an
 * older name, so it reads as one: two entries called "Task" would be a puzzle.
 */
export const TYPE_LABEL: Record<IssueType, string> = {
  EPIC: INITIATIVE.One,
  STORY: TASK.One,
  TASK: TASK.One,
  BUG: PROBLEM.One,
  SUBTASK: SUBTASK.One,
};

/** The type a stored type is shown and counted as. Today only STORY folds into TASK. */
export function displayType(type: IssueType): IssueType {
  return type === "STORY" ? "TASK" : type;
}

/**
 * What a person can pick when creating or retyping. One entry per word: Task,
 * Problem, Initiative. A Subtask is made from a parent, so it is not here, and
 * a new item is a TASK, never a STORY.
 */
export const PICKABLE_TYPES = [
  "TASK",
  "BUG",
  "EPIC",
] as const satisfies readonly IssueType[];

/**
 * The kinds of everyday work: what the quick-add row beneath a list can make,
 * and what a task can be retyped between. Initiatives and subtasks have their
 * own places.
 */
export const WORK_TYPES = [
  "TASK",
  "BUG",
] as const satisfies readonly IssueType[];

/** What the type filter offers: every name once, so STORY is not a fifth entry. */
export const FILTER_TYPES = [
  "EPIC",
  "TASK",
  "BUG",
  "SUBTASK",
] as const satisfies readonly IssueType[];

/** What a new item is when nobody chose. */
export const DEFAULT_TYPE: IssueType = "TASK";

/** The types a report breaks the project's tasks into, in order. STORY is counted under TASK. */
export const BREAKDOWN_TYPES = [
  "TASK",
  "BUG",
  "SUBTASK",
] as const satisfies readonly IssueType[];

export const CATEGORY_LABEL: Record<StatusCategory, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

/** The stage filter's choices: the same three, with "Not started" for the first. */
export const STAGE_FILTER_LABEL: Record<StatusCategory, string> = {
  TODO: "Not started",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  SCRUM: "Scrum",
  KANBAN: "Kanban",
};

/* ------------------------------------------------------------- actions -- */

export const NEW_TASK = `New ${TASK.one}`;
export const NEW_INITIATIVE = `New ${INITIATIVE.one}`;
export const NEW_CYCLE = `New ${CYCLE.one}`;
export const START_CYCLE = `Start ${CYCLE.one}`;
export const COMPLETE_CYCLE = `Complete ${CYCLE.one}`;
export const EDIT_CYCLE = `Edit ${CYCLE.one}`;
export const DELETE_CYCLE = `Delete ${CYCLE.one}`;
export const CYCLE_NAME = `${CYCLE.One} name`;
export const CYCLE_GOAL = `${CYCLE.One} goal`;

/** A new cycle's name when nobody typed one: "Cycle 4". Existing names are never rewritten. */
export function cycleName(n: number): string {
  return `${CYCLE.One} ${n}`;
}

/* ------------------------------------------ report and chart names -- */

/**
 * The titles on the Progress tab. The tab itself is `TAB_LABEL.reports`; these
 * are the cards inside it. Burndown became "Cycle progress", velocity "Pace".
 */
export const REPORT_TITLE = {
  cycleProgress: `${CYCLE.One} progress`,
  pace: "Pace",
  workload: "Workload",
  breakdown: `${TASK.One} breakdown`,
} as const;

/* ------------------------------------------------- empty-state phrases -- */

/** What a screen says when there is nothing to show yet. */
export const EMPTY = {
  noTasks: `No ${TASK.many} yet`,
  noInitiatives: `No ${INITIATIVE.many} yet`,
  noCycles: `No ${CYCLE.many} yet`,
  noActiveCycle: `No active ${CYCLE.one}`,
  laterIsEmpty: `${LATER} is empty.`,
} as const;

/* ----------------------------------------------- page and feature copy -- */

/** The Projects page's subtitle and its search description. */
export const PROJECTS_SUBTITLE = `Plan work as projects, with ${TASK.many}, ${CYCLE.many} and a board.`;

/** The project page's search description. */
export const PROJECT_DESCRIPTION = `A project's board, ${TASK.many}, ${CYCLE.many} and settings.`;

/** The line under Projects in Settings, Features. */
export const PROJECTS_FEATURE_LINE = `Plan work as projects with ${TASK.many}, ${CYCLE.many} and a board, and let people track it together.`;

/* ------------------------------------------------------- swimlanes -- */

/** How the board can be cut into rows. The keys are the stored mode names. */
export const SWIMLANE_LABEL: Record<"none" | "assignee" | "epic", string> = {
  none: "No swimlanes",
  assignee: "Lanes by assignee",
  epic: `Lanes by ${INITIATIVE.one}`,
};

/* ------------------------------------------- programs, and the Master view -- */

/**
 * A program's tabs. The keys are the `?view=` ids on `/projects/programs/[id]`.
 * Board, Tasks, Workload and Timeline read across every project in the program.
 */
export const PROGRAM_TAB_LABEL = {
  overview: "Overview",
  projects: "Projects",
  board: "Board",
  tasks: "Tasks",
  workload: "Workload",
  timeline: "Timeline",
  people: "People & access",
  settings: "Settings",
} as const;

export type ProgramViewId = keyof typeof PROGRAM_TAB_LABEL;

/** The Master view's tabs, `?view=` ids on `/projects/master`. */
export const MASTER_TAB_LABEL = {
  overview: "Overview",
  programs: "Programs",
  tasks: "All tasks",
  workload: "Workload",
} as const;

export type MasterViewId = keyof typeof MASTER_TAB_LABEL;

/** The Master view, as the sidebar row and the page title call it. */
export const MASTER_NAME = "Overview";
export const MASTER_TITLE = "Everything you can see";
export const MASTER_DESCRIPTION = `Every ${PROGRAM.one} and ${NOUNS.project.one} in the company, read only.`;

/** The bucket for projects that belong to no program. */
export const UNASSIGNED = "Unassigned";
export const UNASSIGNED_ID = "unassigned";
export const ALL_PROGRAMS = `All ${PROGRAM.many}`;
export const ALL_PROJECTS = `All ${NOUNS.project.many}`;
export const NEW_PROGRAM = `New ${PROGRAM.one}`;
export const NEW_PROJECT = `New ${NOUNS.project.one}`;

/** What a person can have in a program, as the people list and the pickers say it. */
export const LEVEL_LABEL = {
  READ: "Read",
  WRITE: "Read and write",
  LEAD: "Lead",
} as const;

/** What each level can do, in one plain sentence. */
export const LEVEL_SENTENCE = {
  READ: `Can see every ${NOUNS.project.one}, ${TASK.one} and comment in it. Cannot change anything.`,
  WRITE: `Can see every ${NOUNS.project.one} in it, and create, edit and comment on ${TASK.many}. Each ${NOUNS.project.one}'s settings stay with its lead.`,
  LEAD: `Manages the ${PROGRAM.one}: its people, its ${NOUNS.project.many} and its settings.`,
} as const;

/** The quiet line a person sees on a project they can read but not change. */
export const READ_ONLY_BANNER = `You can view this ${NOUNS.project.one}. Ask its lead for write access.`;
export const READ_ONLY_PROGRAM = `You can view this ${PROGRAM.one}. Ask its lead for write access.`;

/** The three stage groups that compare across projects, in board order. */
export const CATEGORY_COLUMN_LABEL: Record<StatusCategory, string> = {
  TODO: "Not started",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};
