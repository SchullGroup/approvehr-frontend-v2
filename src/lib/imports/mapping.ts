import type { CsvRow } from "@/lib/csv";
import type { ImportRow } from "@/lib/api/imports";
import {
  COLUMN_LOOKUP,
  EMPLOYEE_COLUMNS,
  HEADING,
  REQUIRED_FIELDS,
  SPEC_BY_FIELD,
  normalizeKey,
  type EmployeeField,
} from "./template";

/**
 * Matching the file's columns to the ones we need.
 *
 * This is the step every other product gets wrong by demanding exact headings,
 * so it is worth saying what "getting it right" means here: the file is never
 * edited and the guess is never final. Each column in *their* file gets a
 * dropdown, pre-selected with our best guess, and the person can overrule any of
 * it — including telling us to leave a column out.
 *
 * ## Why we rename rather than send their headings
 *
 * The API matches headings by alias too, so we could post the file's own names
 * and let it work them out. We do not, for one reason: then the mapping step
 * would be advisory. Somebody who tells us `state_of_origin` is their PAYE state
 * has to be obeyed, and the only way to obey is to send that column under the
 * heading the API reads as the tax state. So the rows we post carry template
 * headings, and a column mapped to nothing is simply not sent.
 *
 * The cost is that the API's messages then name *our* heading, not theirs.
 * `reverseHeadings` is how the store puts their own words back before anything
 * reaches a screen — see `lib/store/imports.ts`.
 */

/** File heading to the field it fills. `""` means "do not import this column". */
export type Mapping = Record<string, EmployeeField | "">;

/**
 * The best guess for every heading in the file.
 *
 * Same rule as the API: normalise the heading (lowercase, drop everything that
 * is not a letter or digit) and look it up against the ordered alias list, where
 * position is priority. When two headings claim one field — a file with both
 * `job_title` and `position` — the earlier alias wins and the loser is left
 * unmapped rather than quietly overwriting. Nothing is invented: a heading that
 * matches nothing comes back as "do not import", visibly.
 */
export function guessMapping(headers: readonly string[]): Mapping {
  const claims = new Map<
    EmployeeField,
    { heading: string; priority: number; index: number }
  >();
  const mapping: Mapping = {};

  headers.forEach((heading, index) => {
    mapping[heading] = "";
    const match = COLUMN_LOOKUP.get(normalizeKey(heading));
    if (!match) return;
    const held = claims.get(match.field);
    if (
      !held ||
      match.priority < held.priority ||
      (match.priority === held.priority && index < held.index)
    ) {
      claims.set(match.field, { heading, priority: match.priority, index });
    }
  });

  for (const [field, claim] of claims) mapping[claim.heading] = field;
  return mapping;
}

export type MappingProblems = {
  /** Required columns nothing is mapped to. Blocks the check step. */
  missingRequired: EmployeeField[];
  /** One field claimed by two headings. Also blocks: we can only send one. */
  duplicates: { field: EmployeeField; headings: string[] }[];
};

export function mappingProblems(mapping: Mapping): MappingProblems {
  const byField = new Map<EmployeeField, string[]>();
  for (const [heading, field] of Object.entries(mapping)) {
    if (!field) continue;
    byField.set(field, [...(byField.get(field) ?? []), heading]);
  }

  return {
    missingRequired: REQUIRED_FIELDS.filter((field) => !byField.has(field)),
    duplicates: [...byField.entries()]
      .filter(([, headings]) => headings.length > 1)
      .map(([field, headings]) => ({ field, headings })),
  };
}

export const isMappingReady = (mapping: Mapping): boolean => {
  const problems = mappingProblems(mapping);
  return problems.missingRequired.length === 0 && problems.duplicates.length === 0;
};

/** Headings the person has chosen to leave out. Named in the UI, never silent. */
export const ignoredHeadings = (mapping: Mapping): string[] =>
  Object.entries(mapping)
    .filter(([, field]) => field === "")
    .map(([heading]) => heading);

/**
 * Template heading back to the file's own heading.
 *
 * Every problem the API reports names a column, and the column it names is the
 * one we sent. This turns `gross_monthly` back into `salary` — the word actually
 * at the top of their spreadsheet, which is the only version they can act on.
 */
export function reverseHeadings(mapping: Mapping): Record<string, string> {
  const reverse: Record<string, string> = {};
  for (const [heading, field] of Object.entries(mapping)) {
    if (field) reverse[HEADING[field]] = heading;
  }
  return reverse;
}

/**
 * One file row to one API row.
 *
 * Values are trimmed here — the parser deliberately preserves the file's bytes,
 * and this is the boundary where a trailing space in a bank account number stops
 * mattering. Empty cells are left out of the object entirely rather than sent as
 * `""`. Two reasons: the API reads a blank cell as nothing either way, and the
 * request body is capped at 100kb, so 40 empty columns per row is the difference
 * between three requests and eight.
 */
export function mapRow(row: CsvRow, mapping: Mapping): ImportRow {
  const mapped: ImportRow = {};
  for (const [heading, field] of Object.entries(mapping)) {
    if (!field) continue;
    const value = (row[heading] ?? "").trim();
    if (value === "") continue;
    mapped[HEADING[field]] = value;
  }
  return mapped;
}

export const mapRows = (
  rows: readonly CsvRow[],
  mapping: Mapping,
): ImportRow[] => rows.map((row) => mapRow(row, mapping));

/** Options for one column's dropdown, in the order the template lists them. */
export const FIELD_OPTIONS: readonly {
  field: EmployeeField;
  label: string;
  required: boolean;
}[] = EMPLOYEE_COLUMNS.map((spec) => ({
  field: spec.field,
  label: spec.column,
  required: spec.required,
}));

/** The one-line note for a field, for the column being matched. */
export const noteFor = (field: EmployeeField): string =>
  SPEC_BY_FIELD.get(field)?.note ?? "";

export const exampleFor = (field: EmployeeField): string =>
  SPEC_BY_FIELD.get(field)?.example ?? "";
