import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LINK_CHOICES } from "@/components/projects/linked-tasks";
import { visibleStrings, type VisibleString } from "./support/visible-strings";

/**
 * The Projects module speaks one friendly vocabulary, and this keeps it so.
 *
 * Kene's rule (4 Nov): one set of words for everyone, no company setting. The
 * words are in `src/lib/projects/terms.ts` and the table is at the top of that
 * file. People who have never used a ticket tracker were put off by "issue",
 * "sprint" and "backlog", so a retired word must not come back into anything a
 * person reads. This reads the source rather than rendering it, because a
 * rendered test only sees the screens it happens to open and the toast on the
 * path nobody tested is exactly where an old word hides.
 *
 * ## What it reads
 *
 * Every string a person could see in the files listed in `SCOPE`: JSX text,
 * string and template literals in props (`title`, `label`, `placeholder`,
 * `aria-label`, `description`), toast text, error messages, copy helpers and
 * demo sample text. Comments are not read. Positions that name something for
 * the machine are skipped (see `tests/support/visible-strings.ts`): import
 * paths, object keys, comparisons, `className`, `href`, `data-*`, route and
 * API paths. A stored value such as `EPIC` or `STORY` is all capitals and is
 * skipped; a lone lowercase word is skipped unless it sits in a label-like spot.
 *
 * ## Also caught here: "1 tasks"
 *
 * A number followed by a hard-coded plural of one of the module's own nouns
 * (`${n} tasks`) reads wrongly for one. Write it through `count(n, "task")`.
 *
 * ## When it fails
 *
 * The message names the file, the line, the text and the word to use instead.
 * Fix the string. If it is not shown to a person (an id, a query key, a log
 * line), add it to `ALLOWED` with the reason. An entry nothing matches any
 * longer fails too, so the list cannot rot.
 *
 * ## What it does not read
 *
 * `lib/projects/retired-words.ts` (the old words, kept for Find), the audit
 * action names, API paths and `?issue=` links (they are contracts, not copy),
 * and text the API sends. The backend changes its own strings.
 */

const SRC = path.resolve(import.meta.dirname, "../src");

/** Paths under `src/`: a folder is read whole, a file alone. */
const SCOPE = [
  "app/(app)/projects",
  "components/projects",
  "lib/projects",
  "lib/store/projects.ts",
  "lib/store/programs.ts",
  "lib/store/program-sync.ts",
  "lib/store/nav-hint.ts",
  "lib/api/projects.ts",
  "lib/api/programs.ts",
  "app/(app)/performance/plan-work-dialog.tsx",
  /* Finished project work, where it shows in Performance: the Work record, the
     work inside a review, and the completed work under an objective. */
  "components/performance/completed-item.tsx",
  "components/performance/completed-work.tsx",
  "components/performance/work-this-cycle.tsx",
  "components/performance/work-record.tsx",
  "lib/store/completions.ts",
  "lib/api/completions.ts",
  "components/portal/nav.tsx",
  "components/portal/programs-nav.tsx",
  "components/portal/sidebar-model.ts",
  "lib/store/features.ts",
];

/** Read by nobody but search, on purpose. */
const SKIP = ["lib/projects/retired-words.ts"];

const RETIRED: { re: RegExp; use: string }[] = [
  { re: /\bissues?\b/i, use: "task" },
  { re: /\bepics?\b/i, use: "initiative" },
  { re: /\bsprints?\b/i, use: "cycle" },
  { re: /\bbacklog\b/i, use: "Later (the list) or Plan (the tab)" },
  { re: /\bstor(?:y|ies)\b/i, use: "task" },
  { re: /\bsub-tasks?\b/i, use: "subtask" },
  { re: /\bbugs?\b/i, use: "problem" },
  { re: /\b(?:story )?points?\b|\bpts?\b/i, use: "effort" },
  { re: /\bburndown\b/i, use: "progress" },
  { re: /\bvelocity\b/i, use: "pace" },
  { re: /\bwip\b/i, use: "limit" },
  { re: /\bwatch(?:ers?|ing)?\b/i, use: "follow / following" },
  { re: /\broadmap\b/i, use: "timeline" },
  { re: /\bstatus(?:es)?\b/i, use: "stage" },
  /* The board types are "Simple board" and "Board with cycles". The stored value
     `SCRUM` is all capitals and is skipped, like `EPIC`. "kanban" and "swimlane"
     join this list when the board's own heading and Group by control stop using
     them. */
  { re: /\bscrum\b/i, use: "board with cycles" },
];

/** A figure followed by one of these, hard-coded, reads wrongly for one. */
const COUNTED = /^\s*(?:tasks|subtasks|problems|initiatives|cycles|stages)\b/;

/** Props whose value is something a person reads, even as one lowercase word. */
const LABEL_PROPS = new Set([
  "label",
  "title",
  "placeholder",
  "description",
  "detail",
  "message",
  "text",
  "noun",
  "heading",
  "caption",
  "help",
  "hint",
  "body",
  "name",
  "verb",
]);
const LABEL_ATTRS = new Set([
  "aria-label",
  "title",
  "placeholder",
  "label",
  "description",
  "caption",
  "help",
  "alt",
]);

/**
 * Strings that mention a retired word and are not copy. Keyed by file under
 * `src/`. `text` is matched exactly, or as a pattern. Every entry says why.
 */
type Allowed = { file: string; text: string | RegExp; why: string };

const ALLOWED: Allowed[] = [
  {
    file: "app/(app)/projects/[id]/backlog-view.tsx",
    text: "issue",
    why: "The kind of thing a drag carries, read by `useDragInto`; never shown.",
  },
  {
    file: "app/(app)/projects/[id]/board-view.tsx",
    text: "issue",
    why: "The kind of thing a drag carries, read by `useDragInto`; never shown.",
  },
  {
    file: "app/(app)/projects/[id]/issues-view.tsx",
    text: /^(status|points|sprint)$/,
    why: "Sort keys of the table (`SortKey`), the first argument of `th()`; the label is the second.",
  },
];

/* ------------------------------------------------------------------------- */

function filesIn(target: string): string[] {
  const full = path.join(SRC, target);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap((name) => {
    const child = path.join(full, name);
    if (statSync(child).isDirectory())
      return filesIn(path.relative(SRC, child));
    return /\.(ts|tsx)$/.test(name) ? [child] : [];
  });
}

const rel = (file: string) =>
  path.relative(SRC, file).split(path.sep).join("/");

function isIdentifierLike(s: VisibleString): boolean {
  const text = s.text;
  if (/\s/.test(text)) return false; // a phrase, or a piece of one: " pts"
  if (/^[/?&#.]/.test(text)) return true; // a path or query piece
  if (/^[A-Z][A-Z0-9_]*$/.test(text)) return true; // STORY, EPIC, IN_PROGRESS
  if (/^[a-z][a-z0-9-]*$/.test(text) || /^[a-z][A-Za-z0-9]*$/.test(text)) {
    // A lone lowercase word is an id unless it sits where a label goes.
    if (/^sub-tasks?$/.test(text)) return false;
    const where = s.where;
    if (where.startsWith("prop:") && LABEL_PROPS.has(where.slice(5)))
      return false;
    if (where.startsWith("attr:") && LABEL_ATTRS.has(where.slice(5)))
      return false;
    if (where.startsWith("arg:")) return false;
    return true;
  }
  return false;
}

type Finding = { file: string; line: number; text: string; reason: string };

function scan(): { findings: Finding[]; used: Set<Allowed> } {
  const findings: Finding[] = [];
  const used = new Set<Allowed>();
  const files = [...new Set(SCOPE.flatMap(filesIn))]
    .filter((file) => !SKIP.includes(rel(file)))
    .sort();
  for (const file of files) {
    const name = rel(file);
    for (const s of visibleStrings(file)) {
      let reason: string | null = null;

      if (s.afterHole && COUNTED.test(s.text)) {
        reason =
          'a hard-coded plural after a number reads wrongly for 1: write it with count(n, "task") from lib/projects/terms';
      } else if (!isIdentifierLike(s)) {
        const hit = RETIRED.find((r) => r.re.test(s.text));
        if (hit)
          reason = `retired word, say "${hit.use}" (lib/projects/terms.ts)`;
      }
      if (!reason) continue;

      const allowed = ALLOWED.find(
        (a) =>
          a.file === name &&
          (typeof a.text === "string"
            ? a.text === s.text
            : a.text.test(s.text)),
      );
      if (allowed) {
        used.add(allowed);
        continue;
      }
      findings.push({ file: name, line: s.line, text: s.text, reason });
    }
  }
  return { findings, used };
}

describe("the Projects module's friendly words", () => {
  const { findings, used } = scan();

  it("shows no retired word to a person", () => {
    const report = findings
      .map(
        (f) =>
          `  ${f.file}:${f.line}  ${JSON.stringify(f.text.length > 90 ? `${f.text.slice(0, 90)}…` : f.text)}\n      ${f.reason}`,
      )
      .join("\n");
    expect(
      findings,
      `\nThese strings are read by people and use a word the Projects module has retired.\nChange the wording (the words live in src/lib/projects/terms.ts). If a string is not shown\nto anybody, add it to ALLOWED in tests/projects-friendly-words.test.ts with the reason.\n\n${report}\n`,
    ).toEqual([]);
  });

  it("keeps its allow-list honest: every entry still matches something", () => {
    const stale = ALLOWED.filter((a) => !used.has(a)).map(
      (a) => `${a.file}  ${String(a.text)}`,
    );
    expect(
      stale,
      "These ALLOWED entries match nothing any more. Delete them.",
    ).toEqual([]);
  });

  it("reads a real number of files, so it cannot pass by reading none", () => {
    const files = [...new Set(SCOPE.flatMap(filesIn))];
    expect(files.length).toBeGreaterThan(80);
  });
});

describe("the link picker", () => {
  /* A software team's words. Links already stored with them still show, under
     the label the API sends; the picker just stops offering them. */
  it("does not offer Front end for or Back end for", () => {
    const labels = LINK_CHOICES.map((c) => c.label.toLowerCase());
    expect(labels).not.toContain("front end for");
    expect(labels).not.toContain("back end for");
    expect(LINK_CHOICES.map((c) => c.value)).toEqual([
      "RELATES",
      "BLOCKS",
      "BLOCKED_BY",
      "DUPLICATES",
      "DUPLICATED_BY",
    ]);
  });
});
