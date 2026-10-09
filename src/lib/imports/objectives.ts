import {
  buildDictionary,
  normalizeKey,
  type ColumnSpec,
  type Dictionary,
  type RowContext,
} from "./spec";

/**
 * The objectives dictionary, and the rules only an objectives upload has.
 *
 * The fifth dictionary on this side, and like the others it needed no new
 * screen, store or template writer: `spec.ts`, `mapping.ts`, `check.ts`,
 * `template-file.ts` and `components/imports/` render it as they render
 * employees. What is new is who is let in — see `ImportSurface.useAccess`.
 *
 * ## This is a mirror, and the API's copy wins
 *
 * The API owns this list — `approvehr-api/src/modules/imports/objectives.ts`,
 * `OBJECTIVE_COLUMNS` — and when it answers, **its copy wins**:
 * `GET /imports/template/objectives` is what the screen renders and what the
 * downloaded file is built from. The copy here is the same data compiled in, for
 * the first two steps (choose a file, match its columns), which need no database.
 * `scripts/verify-template.ts` gates the drift.
 *
 * ## What the browser can and cannot say about a row
 *
 * Only what the file alone settles: a title's length, a quarter's shape, a
 * measure with no target, a Yes that is not one, a row repeating an earlier row.
 * Whether the owner is on the staff list, whether the parent exists, and above
 * all **whether this person may raise that objective for that person** are the
 * API's — it asks the same question the single form asks, with the uploader's
 * own authority. This file is allowed to lag the API and never to contradict it.
 */

/** Rows per request, as the API caps it. */
export const MAX_ROWS_PER_BATCH = 500;

export type ObjectiveField =
  | "title"
  | "quarter"
  | "ownerEmail"
  | "department"
  | "parent"
  | "description"
  | "measure"
  | "start"
  | "target"
  | "unit"
  | "lowerIsBetter";

const COLUMNS: readonly ColumnSpec<ObjectiveField>[] = [
  {
    field: "title",
    templateExample: "DELETE THIS ROW",
    column: "Title",
    aliases: [
      "objective",
      "objective_title",
      "goal",
      "goal_title",
      "kpi",
      "name",
    ],
    required: true,
    example: "Grow qualified pipeline",
    note: "What the objective is, 3 to 140 characters.",
  },
  {
    field: "quarter",
    column: "Quarter",
    aliases: ["due_quarter", "period", "due", "due_by"],
    required: true,
    example: "2026-Q4",
    note: "The quarter it is due in, like 2026-Q4.",
  },
  {
    field: "ownerEmail",
    column: "Owner email",
    aliases: [
      "owner",
      "owner_email_address",
      "employee_email",
      "work_email",
      "assigned_to",
      "assignee",
    ],
    required: false,
    example: "ngozi.williams@company.com",
    note: "Whose objective it is, by work email. Leave blank for a department or company objective.",
  },
  {
    field: "department",
    column: "Department",
    aliases: ["dept", "department_name", "team"],
    required: false,
    example: "Marketing",
    note: "The department it belongs to, by name. Needed when there is no owner and no parent; a personal objective takes its parent's.",
  },
  {
    field: "parent",
    column: "Parent objective",
    aliases: [
      "parent",
      "parent_title",
      "parent_goal",
      "under",
      "ladders_up_to",
      "reports_to_objective",
    ],
    required: false,
    example: "Marketing: grow pipeline",
    note: "The exact title of the department or company objective this one sits under. It has to exist already.",
  },
  {
    field: "description",
    column: "Description",
    aliases: ["details", "notes", "summary"],
    required: false,
    example: "Source and qualify 40 new leads a month.",
    note: "A line or two on what done looks like, up to 2000 characters.",
  },
  {
    field: "measure",
    column: "Measure",
    aliases: ["key_result", "measure_name", "metric", "kpi_measure"],
    required: false,
    example: "Qualified leads per month",
    note: "What is counted, if the objective has a number to hit. Needs a Target.",
  },
  {
    field: "start",
    column: "Start",
    aliases: ["start_value", "baseline", "starting_value", "from"],
    required: false,
    example: "10",
    note: "Where the number is today. Blank means 0.",
  },
  {
    field: "target",
    column: "Target",
    aliases: ["target_value", "goal_value", "to"],
    required: false,
    example: "40",
    note: "The number it has to reach.",
  },
  {
    field: "unit",
    column: "Unit",
    aliases: ["units", "uom", "measure_unit"],
    required: false,
    example: "leads",
    note: "What the number is in: %, leads, days, ₦. Up to 20 characters.",
  },
  {
    field: "lowerIsBetter",
    column: "Lower is better",
    aliases: ["lower_better", "decrease", "reduce", "counts_down"],
    required: false,
    example: "No",
    dropdown: ["Yes", "No"],
    note: "Yes when success is the number coming down, like cost or churn. Blank means No.",
  },
];

const TITLE_MIN = 3;
const TITLE_MAX = 140;
const DESCRIPTION_MAX = 2000;
const UNIT_MAX = 20;

/**
 * A quarter as people write it, as `YYYY-Qn` — the API's own reader.
 *
 * `2026-Q4` is what is stored; `Q4 2026` and `2026 Q4` are read rather than
 * refused, because the point of the cell is which quarter, not how it was typed.
 */
export function parseQuarter(raw: string): string | null {
  const text = raw.trim().toUpperCase().replace(/\s+/g, " ");
  const yearFirst = /^(\d{4})\s*[-/ ]?\s*Q([1-4])$/.exec(text);
  if (yearFirst) return `${yearFirst[1]}-Q${yearFirst[2]}`;
  const quarterFirst = /^Q([1-4])\s*[-/ ,]?\s*(\d{4})$/.exec(text);
  if (quarterFirst) return `${quarterFirst[2]}-Q${quarterFirst[1]}`;
  return null;
}

/** Yes or No, the ways spreadsheets spell them. Null when it is neither. */
export function parseYesNo(raw: string): boolean | null {
  const text = raw.trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(text)) return true;
  if (["no", "n", "false", "0"].includes(text)) return false;
  return null;
}

/** A measure cell. Thousands separators and spaces are formatting, not content. */
const tidyNumber = (raw: string): string => raw.replace(/[,\s_]/g, "");
/** The API's rule: at most 14 digits before the point and 4 after. */
const PLAIN_NUMBER = /^-?\d{1,14}(\.\d{1,4})?$/;

/** The title as two people would compare it: case and runs of spaces ignored. */
const titleKey = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

/** The rules the file alone settles. Everything else is the API's. */
function objectiveRowRules(ctx: RowContext<ObjectiveField>): void {
  const { text, error, tally, seen } = ctx;

  const title = text("title");
  if (title !== "") {
    if (title.length < TITLE_MIN) {
      error(
        "title",
        `Give the objective a title of at least ${TITLE_MIN} characters.`,
      );
    } else if (title.length > TITLE_MAX) {
      error(
        "title",
        `That title is ${title.length} characters. Keep it to ${TITLE_MAX} so it fits a card or a report column.`,
      );
    }
  }

  const quarter = text("quarter");
  if (quarter !== "" && parseQuarter(quarter) === null) {
    error(
      "quarter",
      `"${quarter}" is not a quarter we can read. Write it like 2026-Q4.`,
    );
  }

  const owner = text("ownerEmail");
  if (owner !== "" && !owner.includes("@")) {
    error(
      "ownerEmail",
      `"${owner}" is not a work email. This column takes an email, not a name — two people can share a name. Leave it blank for a department or company objective.`,
    );
  }
  if (owner === "" && title !== "") tally("ownerless");

  const description = text("description");
  if (description.length > DESCRIPTION_MAX) {
    error(
      "description",
      `That description is ${description.length} characters. Keep it to ${DESCRIPTION_MAX}.`,
    );
  }

  /* ---- the measure: all of it, or none of it ---- */
  const label = text("measure");
  const start = text("start");
  const target = text("target");
  const unit = text("unit");
  const lower = text("lowerIsBetter");

  if (label === "") {
    if (start !== "" || target !== "" || unit !== "" || lower !== "") {
      error(
        "measure",
        "Name what is being measured, or clear the Start, Target, Unit and Lower is better cells on this row.",
      );
    }
  } else {
    let lowerIsBetter = false;
    if (lower !== "") {
      const parsed = parseYesNo(lower);
      if (parsed === null)
        error("lowerIsBetter", `"${lower}" is not Yes or No.`);
      else lowerIsBetter = parsed;
    }
    if (unit.length > UNIT_MAX) {
      error(
        "unit",
        `That unit is ${unit.length} characters. Keep it to ${UNIT_MAX}.`,
      );
    }
    if (target === "") {
      error("target", "A measure needs a target — the number it has to reach.");
    } else {
      const startText = start === "" ? "0" : tidyNumber(start);
      const targetText = tidyNumber(target);
      const startOk = PLAIN_NUMBER.test(startText);
      const targetOk = PLAIN_NUMBER.test(targetText);
      if (!startOk) {
        error("start", "Use a plain number with at most four decimal places.");
      }
      if (!targetOk) {
        error("target", "Use a plain number with at most four decimal places.");
      }
      if (startOk && targetOk) {
        const from = Number(startText);
        const to = Number(targetText);
        if (from === to) {
          error(
            "target",
            "The target is the same as the starting value, so there is nothing to measure. Set a target you have to move towards.",
          );
        } else if (lowerIsBetter && to > from) {
          error(
            "target",
            "This measure counts down, so the target has to be below the starting value. Cost, churn and time-to-hire all go down.",
          );
        } else if (!lowerIsBetter && to < from) {
          error(
            "target",
            'The target is below the starting value. Say "Yes" under Lower is better if the number is meant to come down.',
          );
        } else {
          tally("measures");
        }
      }
    }
  }

  /* ---- a row repeating an earlier row: title, owner, parent ---- */
  if (title !== "" && title.length >= TITLE_MIN) {
    const key = [
      titleKey(title),
      owner.toLowerCase() || "-",
      normalizeKey(text("parent")) || "-",
      /* A department's own objective is told apart by the department. */
      owner === "" ? normalizeKey(text("department")) || "-" : "-",
    ].join("|");
    const first = seen("objective", key);
    if (first !== undefined) {
      error(
        "title",
        `"${title}" is already on row ${first} of this file${owner ? ` for ${owner}` : ""}. Two rows cannot be the same objective — remove one.`,
      );
    }
  }
}

/** The batch-level sentences, from what the row rules counted. */
function objectiveFileNotes(
  counts: Readonly<Record<string, number>>,
): string[] {
  const notes: string[] = [];
  const ownerless = counts["ownerless"] ?? 0;
  const measures = counts["measures"] ?? 0;

  if (ownerless > 0) {
    notes.push(
      `${ownerless} ${ownerless === 1 ? "row has" : "rows have"} no owner, so ${ownerless === 1 ? "it becomes a department or company objective" : "they become department or company objectives"}.`,
    );
  }
  if (measures > 0) {
    notes.push(
      `${measures} ${measures === 1 ? "objective is" : "objectives are"} added with a measure.`,
    );
  }
  /* Said once, because it is the thing most likely to be assumed the other way:
     nothing an upload makes is agreed. */
  notes.push(
    "Objectives arrive as drafts. The owner sends them to be agreed and their lead agrees them. Whether you may raise each one for that person is checked when you connect.",
  );
  return notes;
}

/**
 * The objectives dictionary, built.
 *
 * `buildDictionary` puts the two required columns first, so the sheet somebody
 * downloads opens on what the objective is and when it is due.
 */
export const OBJECTIVES: Dictionary<ObjectiveField> = buildDictionary(
  {
    slug: "objectives",
    kind: "OBJECTIVES",
    templateFile: {
      basename: "approvehr-objectives-template",
      sheetName: "Objectives",
    },
    noun: { one: "objective", many: "objectives" },
    /* The second line of a report row is whose objective it is. */
    keyLabel: "owner",
    rowRules: objectiveRowRules,
    fileNotes: objectiveFileNotes,
    identify: (text) => ({
      key: text("ownerEmail") || null,
      name: text("title") || null,
    }),
  },
  COLUMNS,
);

/** The dictionary's own list, in template order, for a screen that needs it. */
export const OBJECTIVE_COLUMNS = OBJECTIVES.columns;

export const HEADING = OBJECTIVES.heading;
