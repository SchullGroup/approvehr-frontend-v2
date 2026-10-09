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
  breadcrumb: readonly { href: string; label: string }[];
  /** Where the records are once they are in. The link at the end of the flow. */
  home: { href: string; label: string };
  prerequisites: Readonly<Record<string, ImportPrerequisite>>;
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
  /**
   * Who may use this screen. A hook, because the answer is read off the session.
   *
   * Absent means `IMPORT_DATA`, which is what every importer asked until an
   * entity turned up whose natural author is not an importer: a department head
   * giving their team its quarter. That permission exists because one careless
   * upload overwrites hundreds of pay records, and an upload of objectives
   * touches no pay at all. The API makes the same distinction — this only
   * decides whether the screen is offered, and the rows still answer to the
   * uploader's own authority there.
   *
   * Always the same hook for a given surface, so it is called unconditionally.
   */
  useAccess?: () => boolean;
  /**
   * What somebody without access is told. Absent means the pay-records wording,
   * which is true of the entities that are gated by `IMPORT_DATA` and false of
   * the others.
   */
  noAccess?: { title: string; description: string };
};
