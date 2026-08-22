import type { Dictionary } from "./spec";

/**
 * Everything the four-step import screen needs that is not in the dictionary.
 *
 * The dictionary is the data contract — columns, aliases, which cells are dates,
 * what one row is called. This is the *screen's* description of the entity: the
 * page title, where the records live once they are in, and where the things a
 * row can refer to are created. Two objects rather than one because the
 * dictionary is shared with the API and this is not.
 *
 * `components/imports/` renders any of these. A new importable entity is a
 * dictionary, a surface, and a validate/apply pair on the API — no new screen.
 */

/**
 * Something a row can name that has to exist first.
 *
 * The check returns `missing` as a map — `{ departments: [...], salaryGrades:
 * [...] }` for employees — and each key gets a callout with the names in it and
 * a link to where they are created. A key with no entry here still renders, with
 * the names and no link, because naming what is missing matters more than
 * knowing where to fix it.
 */
export type ImportPrerequisite = {
  /** "Some departments do not exist yet" */
  title: string;
  /** What the rows naming them will do. "will be skipped until they exist" */
  consequence: string;
  action?: { href: string; label: string };
};

export type ImportSurface = {
  dictionary: Dictionary<string>;
  /** The page heading. Never carries "· ApproveHR". */
  title: string;
  description: string;
  breadcrumb: readonly { href: string; label: string }[];
  /** Where the records are once they are in. The link at the end of the flow. */
  home: { href: string; label: string };
  prerequisites: Readonly<Record<string, ImportPrerequisite>>;
  /**
   * One sentence about the match key, printed under the optional-column count.
   *
   * A whole sentence rather than a clause the screen composes, and that changed
   * when the second entity arrived: a person's staff number is optional and
   * falls back to an email, while an equipment tag is **required** and nothing is
   * generated for a row without one. "A column you do not have is left out —
   * including the tag" is true of one and false of the other, so the framework
   * cannot write the lead-in and each surface writes the whole thing.
   */
  keyNote: string;
  /** The demo-mode refusal, which has to name what would not have happened. */
  refusalWithoutApi: string;
  /**
   * Counts only this entity's writer can report, for the result screen.
   *
   * `managersLinked` for people; `handedOver` and `kindsAdded` for equipment.
   * `key` names the field the API spreads flat onto the apply response, and the
   * result screen renders a stat only when that key is **present** — so an
   * entity that links nothing shows three stats rather than a fourth reading
   * zero, and a key the writer did not report is absent rather than none.
   */
  linkedStats?: readonly { key: string; label: string; hint: string }[];
};
