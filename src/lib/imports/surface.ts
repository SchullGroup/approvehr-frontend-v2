import type { CheckedRowFacts, Dictionary } from "./spec";
import type { TemplateLists } from "./template-file";

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

/**
 * A sentence about the whole file, said once above the report.
 *
 * For a consequence that no single row carries and that costs somebody something
 * if it is missed. A warning on a cell is real and is already in the report, but
 * the report groups the same warning from every row into one collapsed section,
 * and `PARITY.md` Rule 5 is explicit that a reveal must not be the only place a
 * thing that matters is said. Never a blocker: a row that will not import is
 * `errors`, and says so on its own line.
 */
export type ImportCheckNotice = {
  tone: "warning" | "info";
  title: string;
  body: string;
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
   * What to say about the file as a whole, from the rows the check came back with.
   *
   * Handed the rows and nothing else, so the sentence is built from what the check
   * itself reported — the API's own warnings when it answers, the browser's when it
   * does not — and cannot disagree with the report beneath it. Absent for every
   * entity whose only findings are rows; the first to use it is objectives, whose
   * one finding that is not about a row is that nothing is filed in a period.
   */
  checkNotices?: (
    rows: readonly CheckedRowFacts[],
  ) => readonly ImportCheckNotice[];
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
   * The company's own lists, for the template's dropdowns: its departments, the
   * appraisal periods still open.
   *
   * A hook, because they are read off the same stores the rest of the app reads.
   * `lists` is keyed by the dictionary field a list fills, and `ready` is false
   * until every list has answered — one way or the other, so a list that failed
   * to load is `ready` with nothing in it and the template simply has no
   * dropdown there. The download waits on `ready`, because a workbook built a
   * moment early looks exactly like one that was always going to have no list.
   *
   * Absent for an entity whose columns are all either free text or a fixed
   * vocabulary, which is every entity but objectives. Always the same hook for a
   * given surface, so it is called unconditionally.
   */
  useTemplateLists?: () => { lists: TemplateLists; ready: boolean };
  /**
   * What somebody without access is told. Absent means the pay-records wording,
   * which is true of the entities that are gated by `IMPORT_DATA` and false of
   * the others.
   */
  noAccess?: { title: string; description: string };
};
