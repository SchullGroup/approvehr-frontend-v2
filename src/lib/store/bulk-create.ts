"use client";

import { useState } from "react";
import {
  imports as api,
  type ApiApplyExtras,
  type ImportRow,
} from "@/lib/api/imports";
import { actionMessage } from "@/lib/use-action";
import {
  blankDraft,
  draftToRow,
  MAX_ITEMS,
  pasteCells,
  touchedOnly,
  type Defaults,
  type Draft,
} from "@/lib/bulk-create/model";
import {
  errorsOf,
  reportsByItem,
  type ItemReport,
} from "@/lib/bulk-create/report";
import { checkMappedRows } from "@/lib/imports/check";
import type { Dictionary } from "@/lib/imports/spec";
import { planParts } from "./imports";
import { useOrgTimezone, useSession } from "./session";

/**
 * The "add several" window, as state.
 *
 * ## Four phases, and the review is one of them
 *
 * `edit` (the person typing), `checking` (the API reading the rows), `review`
 * (the same items, read-only, nothing created yet) and `done` (what landed and
 * what did not). `applying` sits between the last two. The review is a phase and
 * not a screen of its own, because the person asked for the same window with
 * the controls taken away: what they are looking at is the thing they typed.
 *
 * ## It goes through the importer, not through "create" in a loop
 *
 * The window posts the rows it holds to `POST /imports/<entity>/validate` and
 * then `/apply`, exactly as an upload does. That is the point of it: the same
 * rules, the same answers, and each row checked with the author's own authority
 * — whether you may raise an objective for that person is the API's question.
 * A loop over the single-create call would be N requests, a half-saved result
 * when the fourth fails, and a second opinion about the rules.
 *
 * ## What is sent is what was checked
 *
 * The API fingerprints the rows it validated and refuses an apply whose rows
 * are different. So the rows go into `checked` once, at the check, and `apply`
 * sends those — never a re-read of the drafts. Editing after a check is not
 * possible in `review` (the controls are gone), and "Edit again" throws the
 * check away, so the two cannot disagree.
 */

export type Phase = "edit" | "checking" | "review" | "applying" | "done";

/** What the batch is called in the history of past imports. */
const BATCH_NAME = "Added in the app";

/** One validated part: the rows it carried and the items they were. */
type CheckedPart = {
  batchId: string;
  keys: string[];
  rows: ImportRow[];
};

/** What a check said beyond the rows themselves. */
export type Findings = {
  notes: string[];
  /** Named things the rows refer to that do not exist, by kind. */
  missing: Record<string, string[]>;
};

export type Checked = {
  parts: CheckedPart[];
  /** Items the check covered, in the order they were sent. */
  keys: string[];
};

export type Outcome = {
  created: number;
  updated: number;
  /** Counts only this entity's writer reports, summed. Absent when none did. */
  extras: Partial<Record<keyof ApiApplyExtras, number>>;
  notes: string[];
  /** Items that went in, by name as they were when they did. */
  landed: { key: string; name: string }[];
  /** Items that did not, with whatever the API said about each. */
  notLanded: string[];
  reports: Record<string, ItemReport>;
  /** Set when a part did not go through at all. */
  failure: string | null;
};

const EXTRA_KEYS = [
  "managersLinked",
  "handedOver",
  "kindsAdded",
  "parentsLinked",
  "headsSet",
  "invited",
  "measuresAdded",
] as const satisfies readonly (keyof ApiApplyExtras)[];

let sequence = 0;
/** Unique across windows, so a key from one can never name an item in another. */
export const nextDraftKey = (): string => {
  sequence += 1;
  return `item-${String(sequence)}`;
};

export function useBulkCreate(input: {
  dictionary: Dictionary<string>;
  defaults: Defaults;
  /** `"objective"`, for sentences like "Add at least one objective first". */
  noun: { one: string; many: string };
  /** The surface's words for a server that cannot be reached. May be empty. */
  refusalWithoutApi: string;
  itemName: (draft: Draft, position: number) => string;
  onChanged: () => void;
}) {
  const { dictionary, defaults, noun, refusalWithoutApi, itemName, onChanged } =
    input;
  const { isConnected } = useSession();
  const timeZone = useOrgTimezone();

  const [drafts, setDrafts] = useState<Draft[]>(() => [
    blankDraft(dictionary, nextDraftKey(), defaults),
  ]);
  const [phase, setPhase] = useState<Phase>("edit");
  const [reports, setReports] = useState<Record<string, ItemReport>>({});
  const [checked, setChecked] = useState<Checked | null>(null);
  /** What the last check said beyond the rows: notes, and what does not exist. */
  const [findings, setFindings] = useState<Findings>({
    notes: [],
    missing: {},
  });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Something that is not a failure: what a load or a paste just did. */
  const [notice, setNotice] = useState<string | null>(null);
  /** Where the page-by-page layout is, kept here so a check can move it. */
  const [position, setPosition] = useState(0);

  const touched = touchedOnly(drafts, defaults);
  const atLimit = drafts.length >= MAX_ITEMS;

  /* Every operation below reads `drafts` from this render and sets the whole
     next list. They are event handlers, so this render is the one the person
     was looking at — and it keeps each one a plain function of what is on
     screen, which a set-state callback that also sets other state and
     computes a return value is not. */

  const clampPosition = (length: number, wanted: number): number =>
    Math.max(0, Math.min(wanted, length - 1));

  /* ------------------------------------------------------------ editing */

  const withoutProblem = (
    current: Record<string, ItemReport>,
    key: string | null,
    field: string,
  ): Record<string, ItemReport> =>
    Object.fromEntries(
      Object.entries(current).map(([each, report]) => [
        each,
        key === null || each === key
          ? {
              ...report,
              problems: report.problems.filter(
                (problem) => problem.field !== field,
              ),
            }
          : report,
      ]),
    );

  const edit = (key: string, field: string, value: string) => {
    setDrafts(
      drafts.map((draft) =>
        draft.key === key
          ? { ...draft, values: { ...draft.values, [field]: value } }
          : draft,
      ),
    );
    /* The problem on a field goes when the field is touched. The rest stay until
       the next check, which is the only thing that can say they are gone. */
    setReports(withoutProblem(reports, key, field));
  };

  const add = (): boolean => {
    if (drafts.length >= MAX_ITEMS) return false;
    setDrafts([...drafts, blankDraft(dictionary, nextDraftKey(), defaults)]);
    setPosition(drafts.length);
    return true;
  };

  const duplicate = (key: string): boolean => {
    const index = drafts.findIndex((draft) => draft.key === key);
    const source = drafts[index];
    if (!source || drafts.length >= MAX_ITEMS) return false;
    const copy: Draft = { key: nextDraftKey(), values: { ...source.values } };
    setDrafts([
      ...drafts.slice(0, index + 1),
      copy,
      ...drafts.slice(index + 1),
    ]);
    setPosition(index + 1);
    return true;
  };

  const remove = (key: string) => {
    const kept = drafts.filter((draft) => draft.key !== key);
    const next =
      kept.length > 0
        ? kept
        : [blankDraft(dictionary, nextDraftKey(), defaults)];
    setDrafts(next);
    setPosition(clampPosition(next.length, position));
    setReports(
      Object.fromEntries(
        Object.entries(reports).filter(([each]) => each !== key),
      ),
    );
  };

  const clearAll = () => {
    setDrafts([blankDraft(dictionary, nextDraftKey(), defaults)]);
    setReports({});
    setPosition(0);
    setError(null);
    setNotice(null);
    setFindings({ notes: [], missing: {} });
  };

  /** Sets one field on every item that has something in it. Returns how many. */
  const fill = (field: string, value: string): number => {
    const targets = new Set(touched.map((draft) => draft.key));
    if (targets.size === 0) return 0;
    setDrafts(
      drafts.map((draft) =>
        targets.has(draft.key)
          ? { ...draft, values: { ...draft.values, [field]: value } }
          : draft,
      ),
    );
    /* A problem on that field is no longer true of anybody it was set on. */
    setReports(withoutProblem(reports, null, field));
    return targets.size;
  };

  /** Items from a file, added after what is already typed. */
  const append = (loaded: Draft[]) => {
    const kept = touchedOnly(drafts, defaults);
    const next = [...kept, ...loaded].slice(0, MAX_ITEMS);
    setDrafts(
      next.length > 0
        ? next
        : [blankDraft(dictionary, nextDraftKey(), defaults)],
    );
    setPosition(kept.length);
    setReports({});
    setError(null);
  };

  const paste = (
    at: { row: number; column: number },
    text: string,
  ): ReturnType<typeof pasteCells> => {
    const summary = pasteCells(
      dictionary,
      drafts,
      at,
      text,
      nextDraftKey,
      defaults,
    );
    setDrafts(summary.drafts);
    return summary;
  };

  /* ------------------------------------------------------------- check */

  const check = async (): Promise<boolean> => {
    const active = touchedOnly(drafts, defaults);
    if (active.length === 0) {
      setError(`Add at least one ${noun.one} first.`);
      return false;
    }
    setError(null);
    setNotice(null);
    setPhase("checking");

    const rows = active.map((draft) => draftToRow(dictionary, draft));
    const keys = active.map((draft) => draft.key);

    let merged: Record<string, ItemReport> = {};
    const notes = new Set<string>();
    const missing = new Map<string, Set<string>>();
    /* Columns the server was sent and did not recognise. See below. */
    const unrecognised = new Set<string>();
    const parts: CheckedPart[] = [];

    if (!isConnected) {
      /* Nothing offline can say who exists or who may raise what, so this is
         only what the rows themselves settle — and the review says as much. */
      const local = checkMappedRows(dictionary, rows, {
        presentFields: new Set(dictionary.columns.map((spec) => spec.field)),
        timeZone,
      });
      merged = reportsByItem(dictionary, keys, local.rows);
      local.notes.forEach((note) => notes.add(note));
      parts.push({ batchId: "", keys, rows });
    } else {
      try {
        for (const span of planParts(rows)) {
          const slice = rows.slice(span.start, span.end);
          const sliceKeys = keys.slice(span.start, span.end);
          const answer = await api.validate(dictionary.slug, {
            filename: BATCH_NAME,
            rows: slice,
          });
          parts.push({ batchId: answer.batchId, keys: sliceKeys, rows: slice });
          Object.assign(
            merged,
            reportsByItem(dictionary, sliceKeys, answer.rows),
          );
          answer.notes.forEach((note) => notes.add(note));
          answer.unmappedColumns.forEach((heading) =>
            unrecognised.add(heading),
          );
          for (const [kind, names] of Object.entries(answer.missing)) {
            const set = missing.get(kind) ?? new Set<string>();
            missing.set(kind, set);
            names.forEach((name) => set.add(name));
          }
        }
      } catch (thrown) {
        setPhase("edit");
        setError(actionMessage(thrown, `your ${noun.many}`));
        return false;
      }
    }

    /* The window only ever sends columns from the entity's own dictionary, and
       only the ones with something typed in them. So a column the server says it
       did not recognise is not somebody's odd spreadsheet — it is this app and
       the server disagreeing about a heading, which happens while one of them is
       a deploy behind the other.
       The cost of carrying on is the worst kind: the rows pass, the objectives
       are created, and who each is assigned to was quietly thrown away. So it
       stops here, says which column, and creates nothing. */
    if (unrecognised.size > 0) {
      const named = [...unrecognised]
        .map((heading) => `"${heading}"`)
        .join(", ");
      setReports(merged);
      setChecked(null);
      setPhase("edit");
      setError(
        `The server does not recognise ${unrecognised.size === 1 ? "the column" : "the columns"} ${named} yet, so it would have ignored ${unrecognised.size === 1 ? "it" : "them"}. Nothing was created. This usually means the server is a version behind the app: tell your administrator.`,
      );
      return false;
    }

    const failing = keys.filter((key) => errorsOf(merged[key]).length > 0);
    setReports(merged);
    setFindings({
      notes: [...notes],
      missing: Object.fromEntries(
        [...missing.entries()].map(([kind, names]) => [kind, [...names]]),
      ),
    });

    if (failing.length > 0) {
      setChecked(null);
      setPhase("edit");
      setError(
        failing.length === 1
          ? `1 ${noun.one} needs a change. Nothing is created until every one passes the check.`
          : `${String(failing.length)} ${noun.many} need a change. Nothing is created until every one passes the check.`,
      );
      /* Take the page-by-page layout to the first one, where the reason is. */
      const first = drafts.findIndex((draft) => draft.key === failing[0]);
      if (first >= 0) setPosition(first);
      return false;
    }

    setChecked({ parts, keys });
    setPhase("review");
    return true;
  };

  /** Leave the review to change something. The check is thrown away. */
  const editAgain = () => {
    setChecked(null);
    setReports({});
    setFindings({ notes: [], missing: {} });
    setError(null);
    setPhase("edit");
  };

  /* ------------------------------------------------------------- apply */

  const apply = async (): Promise<boolean> => {
    if (!checked || checked.parts.length === 0) return false;
    if (!isConnected) {
      setError(
        refusalWithoutApi ||
          "The app cannot reach the server, so nothing was created.",
      );
      return false;
    }
    setError(null);
    setPhase("applying");

    const nameOf = new Map(
      drafts.map((draft, index) => [draft.key, itemName(draft, index + 1)]),
    );
    let created = 0;
    let updated = 0;
    const extras: Outcome["extras"] = {};
    const notes = new Set<string>();
    const notLanded: string[] = [];
    const unlanded: Record<string, ItemReport> = {};
    let failure: string | null = null;

    for (const [index, part] of checked.parts.entries()) {
      try {
        const answer = await api.apply(dictionary.slug, part.batchId, {
          confirm: true,
          rows: part.rows,
        });
        created += answer.created;
        updated += answer.updated;
        for (const key of EXTRA_KEYS) {
          const value = answer[key];
          if (typeof value === "number") {
            extras[key] = (extras[key] ?? 0) + value;
          }
        }
        answer.notes.forEach((note) => notes.add(note));
        for (const report of answer.skippedRows) {
          const mapped = reportsByItem(dictionary, part.keys, [report]);
          Object.assign(unlanded, mapped);
          const key = part.keys[report.row - 1];
          if (key !== undefined) notLanded.push(key);
        }
      } catch (thrown) {
        failure = actionMessage(thrown, `these ${noun.many}`);
        /* This part and every one after it. Said by name, because that is what
           somebody has to go and look for. */
        for (const rest of checked.parts.slice(index)) {
          notLanded.push(...rest.keys);
        }
        break;
      }
    }

    const left = new Set(notLanded);
    const landed = checked.keys
      .filter((key) => !left.has(key))
      .map((key) => ({ key, name: nameOf.get(key) ?? key }));

    setOutcome({
      created,
      updated,
      extras,
      notes: [...notes],
      landed,
      notLanded: [...left],
      reports: unlanded,
      failure,
    });
    setPhase("done");
    if (created + updated > 0) onChanged();
    return failure === null;
  };

  /**
   * Back to the items that did not go in, with the reason on each.
   *
   * The ones that landed are removed: they exist now, and leaving them in the
   * window would make the next press create them a second time.
   */
  const fixTheRest = () => {
    if (!outcome) return;
    const left = new Set(outcome.notLanded);
    const rest = drafts.filter((draft) => left.has(draft.key));
    setDrafts(
      rest.length > 0
        ? rest
        : [blankDraft(dictionary, nextDraftKey(), defaults)],
    );
    setReports(outcome.reports);
    setPosition(0);
    setOutcome(null);
    setChecked(null);
    setError(null);
    setPhase("edit");
  };

  return {
    drafts,
    touched,
    atLimit,
    phase,
    reports,
    checked,
    findings,
    outcome,
    error,
    notice,
    setNotice,
    setError,
    position,
    setPosition,
    edit,
    add,
    duplicate,
    remove,
    clearAll,
    fill,
    append,
    paste,
    check,
    editAgain,
    apply,
    fixTheRest,
  };
}
