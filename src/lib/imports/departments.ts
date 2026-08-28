import {
  buildDictionary,
  normalizeKey,
  type ColumnSpec,
  type Dictionary,
  type RowContext,
} from "./spec";

/**
 * The department dictionary, and the rules only a department import has.
 *
 * The framework's second dictionary on this side, and it needed no new screen,
 * no new store and no new template writer — `spec.ts`, `mapping.ts`, `check.ts`,
 * `template-file.ts` and `components/imports/` render it exactly as they render
 * employees. That is what the extraction was for.
 *
 * ## This is a mirror, and the API's copy wins
 *
 * The API owns this list — `approvehr-api/src/modules/imports/departments.ts`,
 * `DEPARTMENT_COLUMNS` — and when the API answers, **its copy wins**:
 * `GET /imports/template/departments` is what the screen renders, what
 * pre-selects the column matches and what the downloaded file is built from. The
 * copy here is the same data compiled in, for the one case where that call
 * cannot be made — choosing a file and lining its headings up against a list has
 * no business needing a database.
 *
 * The drift is gated rather than described: `scripts/verify-template.ts` parses
 * the API's declaration as text and asserts the same columns, the same required
 * set, the same recommended set and the same declared cell types.
 *
 * ## What this check can and cannot answer about a tree
 *
 * A department import's interesting questions are almost all questions about the
 * database — does that parent exist, is this name already yours, is that email
 * anybody — so this check is deliberately thin, and the screen says so through
 * the step-four refusal rather than implying a clean file will import cleanly.
 *
 * One case is worth naming because it looks answerable and is not: **a loop.**
 * A row that names itself as its own parent is caught here, because that is one
 * row and one cell. A loop across several rows is not, because `rowRules` sees
 * one row at a time and a graph needs all of them — and the loops that matter
 * most run partly through departments already on file, which no browser can see.
 * The API refuses every one of them, with both names and the chain, before
 * anything is written. A false negative here is the documented and expected
 * direction: this file is allowed to lag the API, never to contradict it.
 */

/**
 * Rows per request, as the API caps it.
 *
 * Not the number actually sent: `express.json` is capped at 100kb and the client
 * measures its own parts. A department row is four short cells, so this cap is
 * the one that bites first for this entity rather than the byte budget.
 */
export const MAX_ROWS_PER_BATCH = 500;

export type DepartmentField = "name" | "parent" | "costCentre" | "head";

const COLUMNS: readonly ColumnSpec<DepartmentField>[] = [
  {
    field: "name",
    templateExample: "DELETE THIS ROW",
    column: "name",
    aliases: [
      "department",
      "department_name",
      "dept",
      "unit",
      "unit_name",
      "team",
      "team_name",
    ],
    required: true,
    example: "Finance",
    note: "The department's name. Not case- or punctuation-sensitive when matching.",
  },
  {
    field: "parent",
    column: "parent_department",
    aliases: [
      "parent",
      "parent_name",
      "parent_unit",
      "division",
      "reports_to",
      "belongs_to",
      "sits_under",
    ],
    required: false,
    example: "Group Services",
    note: "The department it sits inside, by name. Leave blank for a top-level department.",
  },
  {
    field: "costCentre",
    column: "cost_centre",
    aliases: [
      "cost_center",
      "cost_centre_code",
      "cost_center_code",
      "cost_code",
      "gl_code",
      "gl_account",
    ],
    required: false,
    example: "CC-2100",
    note: "Your cost centre code, up to 40 characters.",
    recommended: {
      why: "no cost centre code — this unit's pay cannot be grouped against your ledger in a payroll report",
    },
  },
  {
    field: "head",
    column: "head_of_department",
    aliases: [
      "head",
      "hod",
      "department_head",
      "head_email",
      "head_staff_no",
      "led_by",
      "manager",
      "lead",
    ],
    required: false,
    example: "ngozi.williams@company.com",
    note: "The head's work email or staff number — not their name. Must already be on your staff list.",
    recommended: {
      why: "nobody named as head — a head is who sees everyone beneath this unit, not only their own direct reports",
    },
  },
];

/** The name column is 80 characters on the model, the cost centre 40. */
const NAME_MAX = 80;
const COST_CENTRE_MAX = 40;

/**
 * Something that looks like a person's name rather than a way to find them.
 *
 * Two or more words, no `@`, no digit. It is the commonest thing typed into a
 * head column and it is answerable from the file alone, so it is worth catching
 * here rather than waiting for the API to say nobody matched — the message can
 * name the actual mistake instead of the symptom.
 */
const LOOKS_LIKE_A_NAME = /^[A-Za-z][A-Za-z'’.-]*(\s+[A-Za-z][A-Za-z'’.-]*)+$/;

/** The rules the file alone settles. Everything else is the API's. */
function departmentRowRules(ctx: RowContext<DepartmentField>): void {
  const { text, error, warn, tally, seen } = ctx;

  const name = text("name");
  const nameKey = normalizeKey(name);
  if (name !== "") {
    if (nameKey === "") {
      error(
        "name",
        `"${name}" has no letters or digits in it, so there is nothing to match on. Give the department a name.`,
      );
    } else if (name.length > NAME_MAX) {
      error(
        "name",
        `That name is ${name.length} characters. Keep it to ${NAME_MAX} so it fits a nav item and a report column.`,
      );
    } else {
      const first = seen("name", nameKey);
      if (first !== undefined) {
        error(
          "name",
          `"${name}" is already on row ${first} of this file. Two rows cannot be the same department — merge them, or give one a different name. Capital letters and punctuation are ignored when we compare.`,
        );
      }
    }
  }

  /* The one loop a single row can prove. Everything longer needs the whole
     graph, half of which is in the database — see the file header. */
  const parent = text("parent");
  if (parent !== "" && nameKey !== "" && normalizeKey(parent) === nameKey) {
    error(
      "parent",
      `${name} cannot sit inside ${name}. A department cannot be its own parent — leave this cell empty for a top-level department.`,
    );
  } else if (parent !== "") {
    tally("nested");
  }

  const costCentre = text("costCentre");
  if (costCentre !== "") {
    if (costCentre.length > COST_CENTRE_MAX) {
      error(
        "costCentre",
        `That code is ${costCentre.length} characters. Keep it to ${COST_CENTRE_MAX}.`,
      );
    } else {
      const first = seen("costCentre", normalizeKey(costCentre));
      if (first !== undefined) {
        warn(
          "costCentre",
          `${costCentre} is also on row ${first}. Both units import, and a payroll report will add their cost together under this one code.`,
        );
      }
    }
  }

  const head = text("head");
  if (head !== "" && LOOKS_LIKE_A_NAME.test(head)) {
    tally("namedHeads");
    warn(
      "head",
      `"${head}" looks like a person's name. This column takes a work email or a staff number — two people can share a name, and a department has one head.`,
    );
  }
}

/** The batch-level sentences, from what the row rules counted. */
function departmentFileNotes(counts: Readonly<Record<string, number>>): string[] {
  const notes: string[] = [];
  const nested = counts["nested"] ?? 0;
  const namedHeads = counts["namedHeads"] ?? 0;

  if (nested > 0) {
    notes.push(
      `${nested} ${nested === 1 ? "row names a parent" : "rows name parents"}. Whether ${nested === 1 ? "it exists" : "they exist"} — here or already on your list — is checked when you connect, and so is whether any of them closes a loop.`,
    );
  }
  if (namedHeads > 0) {
    notes.push(
      `${namedHeads} head ${namedHeads === 1 ? "cell holds" : "cells hold"} what looks like a person's name rather than an email or a staff number. Those departments will import with no head.`,
    );
  }
  /* Said whenever a file is checked offline, because it is the thing somebody is
     most likely to assume the other way round: this import sets structure, and
     it is the one importer that touches nobody's own record. */
  notes.push(
    "Nobody's own department changes. This import sets the shape of the company — naming somebody as a head does not move them into the unit they head.",
  );
  return notes;
}

/**
 * The department dictionary, built.
 *
 * `buildDictionary` is the only way to make one, and it is what puts the
 * required column first. One required column makes that look like a formality;
 * it is not — the template, the matching dropdowns, the browser check and the
 * API's own response all read this one ordered list.
 */
export const DEPARTMENTS: Dictionary<DepartmentField> = buildDictionary(
  {
    slug: "departments",
    kind: "DEPARTMENTS",
    templateFile: {
      basename: "approvehr-departments-template",
      sheetName: "Departments",
    },
    noun: { one: "department", many: "departments" },
    /* What the match key is called in copy. It is the name, because that is what
       the table is unique on. */
    keyLabel: "department name",
    rowRules: departmentRowRules,
    fileNotes: departmentFileNotes,
    identify: (text) => ({
      /* The key *is* the name, so there is no second identifier to print. Null
         rather than a repeat: the report renders this as a muted second line, and
         one name shown twice reads as two facts. */
      key: null,
      name: text("name") || null,
    }),
  },
  COLUMNS,
);

/** The dictionary's own list, in template order, for a screen that needs it. */
export const DEPARTMENT_COLUMNS = DEPARTMENTS.columns;

export const HEADING = DEPARTMENTS.heading;
