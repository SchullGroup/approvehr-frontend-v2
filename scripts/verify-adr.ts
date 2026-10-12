/**
 * The architecture decision records: `docs/adr/`.
 *
 * ## Why this is a gate
 *
 * An ADR is only worth finding if the numbering, the header and the index can be
 * trusted without reading every file, and markdown is not in this repo's
 * `format:check`, so nothing else looks at it. The failures are all quiet ones:
 * two PRs that both took 0012, a "Superseded by" that the other record does not
 * agree with, an index row for a file that was renamed, a template comment left
 * in. None is visible to `tsc`, to lint, or to a reviewer reading one diff.
 *
 * ## What it checks
 *
 * - Numbers are four digits, unique and gapless from 0001, and match the filename.
 * - The first line is `# NNNN — Title`, with the same number.
 * - The header block is the template's, line for line and in order. Status, date
 *   (a real day, not in the future), scope and the two supersession fields are
 *   valid. `Backfilled` is optional and, when present, last.
 * - Supersession is reciprocal, and a record is `Superseded` exactly when
 *   something supersedes it.
 * - The sections are the template's, and Consequences carries Harder, Accepted
 *   and Revisit if, because an ADR with only benefits is a sales page (rule 8).
 * - No leftover template comment or placeholder, and no more than two pages.
 * - Relative links resolve.
 * - The index lists exactly the files that exist, with the same title, status,
 *   date and scope as the record itself.
 *
 * What it cannot check is whether a decision is right, whether `Enforced by`
 * names something real, or whether a backfilled date matches the commit it cites.
 * Those are what the person accepting the record is for.
 *
 * Run `npm run verify-adr`. `ADR_DIR` points it elsewhere, which is how it is
 * tamper-tested.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const DIR = resolve(process.env["ADR_DIR"] ?? "docs/adr");
const STATUSES = [
  "Proposed",
  "Accepted",
  "Rejected",
  "Deprecated",
  "Superseded",
] as const;
const SCOPES = ["frontend", "backend", "both", "process"] as const;
const HEADER = [
  "Status",
  "Date",
  "Decided by",
  "Scope",
  "Supersedes",
  "Superseded by",
  "Enforced by",
] as const;
const SECTIONS = [
  "Context",
  "Decision",
  "Consequences",
  "Alternatives considered",
  "References",
];
const MAX_LINES = 140;
const NONE = "—";

const problems: string[] = [];
const fail = (where: string, what: string): void => {
  problems.push(`${where}: ${what}`);
};

type Adr = {
  file: string;
  number: string;
  title: string;
  fields: Map<string, string>;
};

const strip = (markdown: string): string =>
  markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");

const files = readdirSync(DIR)
  .filter((name) => /^\d{4}-.+\.md$/.test(name))
  .sort();

const adrs: Adr[] = [];

for (const file of files) {
  const where = file;
  const text = readFileSync(join(DIR, file), "utf8");
  const lines = text.split("\n");
  const number = file.slice(0, 4);

  if (!/^\d{4}-[a-z0-9]+(-[a-z0-9]+)*\.md$/.test(file)) {
    fail(where, "the filename must be NNNN-kebab-case.md");
  }

  const h1 = /^# (\d{4}) — (.+)$/.exec(lines[0] ?? "");
  if (!h1) {
    fail(
      where,
      "the first line must be `# NNNN — The decision, as a sentence`",
    );
    continue;
  }
  if (h1[1] !== number)
    fail(where, `the title says ${h1[1]} but the filename says ${number}`);

  /* The header block: seven required lines, then optionally Backfilled. */
  const fields = new Map<string, string>();
  let cursor = 1;
  while ((lines[cursor] ?? "") === "") cursor++;
  const order = [...HEADER, "Backfilled"] as string[];
  let last = -1;
  while (/^- \*\*[^*]+:\*\*/.test(lines[cursor] ?? "")) {
    const m = /^- \*\*([^*]+):\*\* ?(.*)$/.exec(lines[cursor] ?? "");
    if (!m) break;
    const label = m[1] as string;
    const at = order.indexOf(label);
    if (at === -1) fail(where, `unknown header line "${label}"`);
    else if (at < last) fail(where, `header line "${label}" is out of order`);
    else last = at;
    if (fields.has(label)) fail(where, `header line "${label}" appears twice`);
    fields.set(label, (m[2] as string).trim());
    cursor++;
  }
  for (const label of HEADER) {
    if (!fields.has(label)) fail(where, `the header is missing "${label}"`);
    else if (fields.get(label) === "")
      fail(where, `the header line "${label}" is empty`);
  }

  const status = fields.get("Status") ?? "";
  if (!(STATUSES as readonly string[]).includes(status)) {
    fail(where, `Status "${status}" is not one of ${STATUSES.join(", ")}`);
  }
  const date = fields.get("Date") ?? "";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00Z`))
  ) {
    fail(where, `Date "${date}" is not a real YYYY-MM-DD day`);
  } else if (
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  ) {
    fail(where, `Date "${date}" is not a real day`);
  } else if (date > new Date().toISOString().slice(0, 10)) {
    fail(where, `Date "${date}" is in the future`);
  }
  const scope = fields.get("Scope") ?? "";
  if (!(SCOPES as readonly string[]).includes(scope)) {
    fail(where, `Scope "${scope}" is not one of ${SCOPES.join(", ")}`);
  }
  for (const label of ["Supersedes", "Superseded by"]) {
    const v = fields.get(label) ?? "";
    if (v !== NONE && !/^\d{4}(, \d{4})*$/.test(v)) {
      fail(
        where,
        `${label} must be "${NONE}" or ADR numbers like "0003" or "0003, 0004", not "${v}"`,
      );
    }
  }

  /* Sections, in the template's order. */
  const found = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.startsWith("## "));
  const names = found.map(({ l }) => l.slice(3).trim());
  if (names.join("|") !== SECTIONS.join("|")) {
    fail(
      where,
      `the sections must be ${SECTIONS.map((s) => `"${s}"`).join(", ")} in that order; found ${names.map((s) => `"${s}"`).join(", ") || "none"}`,
    );
  }
  const consequences = text.slice(
    text.indexOf("## Consequences"),
    text.indexOf("## Alternatives considered"),
  );
  for (const label of ["Harder", "Accepted", "Revisit if"]) {
    if (!consequences.includes(`**${label}:**`))
      fail(where, `Consequences has no "${label}" line`);
  }
  for (const section of found) {
    const next = found.find((s) => s.i > section.i)?.i ?? lines.length;
    const body = lines
      .slice(section.i + 1, next)
      .join("\n")
      .trim();
    if (body === "")
      fail(where, `the section "${section.l.slice(3)}" is empty`);
  }

  if (text.includes("<!--"))
    fail(where, "a template comment is still in the file");
  if (
    /\bNNNN\b|YYYY-MM-DD|Name \(role\)/.test(strip(text.replace(/^# .*$/m, "")))
  ) {
    fail(where, "a template placeholder is still in the file");
  }
  if (lines.length > MAX_LINES) {
    fail(
      where,
      `${String(lines.length)} lines; an ADR is one page, two at most (${String(MAX_LINES)})`,
    );
  }

  /* Relative links must resolve. Code spans and fences are stripped first so a
     path quoted as code is not mistaken for a link. */
  for (const m of strip(text).matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = (m[1] as string).split("#")[0] ?? "";
    if (target === "" || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    if (!existsSync(resolve(dirname(join(DIR, file)), target))) {
      fail(where, `the link "${m[1] as string}" does not resolve`);
    }
  }

  adrs.push({ file, number, title: h1[2] as string, fields });
}

/* Numbers: unique and gapless from 0001. */
const seen = new Map<string, string>();
for (const a of adrs) {
  const earlier = seen.get(a.number);
  if (earlier) fail(a.file, `number ${a.number} is also used by ${earlier}`);
  else seen.set(a.number, a.file);
}
const numbers = [...seen.keys()].map(Number).sort((a, b) => a - b);
numbers.forEach((n, i) => {
  if (n !== i + 1) {
    if (!problems.some((p) => p.includes("is not gapless"))) {
      fail(
        "docs/adr",
        `numbering is not gapless: expected ${String(i + 1).padStart(4, "0")}, found ${String(n).padStart(4, "0")}. Numbers are never reused or renumbered, so a gap means a file was deleted.`,
      );
    }
  }
});

/* Supersession is reciprocal. */
const byNumber = new Map(adrs.map((a) => [a.number, a]));
const list = (v: string | undefined): string[] =>
  !v || v === NONE ? [] : v.split(", ");
for (const a of adrs) {
  for (const target of list(a.fields.get("Supersedes"))) {
    const other = byNumber.get(target);
    if (!other) fail(a.file, `Supersedes ${target}, which does not exist`);
    else if (!list(other.fields.get("Superseded by")).includes(a.number)) {
      fail(
        a.file,
        `Supersedes ${target}, but ${other.file} does not say "Superseded by: ${a.number}"`,
      );
    }
  }
  for (const target of list(a.fields.get("Superseded by"))) {
    const other = byNumber.get(target);
    if (!other) fail(a.file, `Superseded by ${target}, which does not exist`);
    else if (!list(other.fields.get("Supersedes")).includes(a.number)) {
      fail(
        a.file,
        `Superseded by ${target}, but ${other.file} does not say "Supersedes: ${a.number}"`,
      );
    }
  }
  const superseded = list(a.fields.get("Superseded by")).length > 0;
  const status = a.fields.get("Status");
  if (superseded && status !== "Superseded")
    fail(
      a.file,
      `it is superseded, so its Status must be Superseded, not ${String(status)}`,
    );
  if (!superseded && status === "Superseded")
    fail(a.file, "its Status is Superseded but nothing says Superseded by");
}

/* The index lists exactly what exists. */
const indexPath = join(DIR, "index.md");
if (!existsSync(indexPath)) {
  fail("docs/adr", "index.md is missing");
} else {
  const rows = new Map<string, string[]>();
  for (const line of readFileSync(indexPath, "utf8").split("\n")) {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length === 5 && /^\d{4}$/.test(cells[0] ?? "")) {
      if (rows.has(cells[0] as string))
        fail("index.md", `lists ${String(cells[0])} twice`);
      rows.set(cells[0] as string, cells);
    }
  }
  for (const a of adrs) {
    const row = rows.get(a.number);
    if (!row) {
      fail("index.md", `has no row for ${a.file}`);
      continue;
    }
    const link = /^\[(.+)\]\(([^)]+)\)$/.exec(row[1] ?? "");
    if (!link)
      fail(
        "index.md",
        `row ${a.number}: the Decision cell must be a link, [Title](file.md)`,
      );
    else {
      if (link[2] !== a.file)
        fail(
          "index.md",
          `row ${a.number} links ${String(link[2])}, not ${a.file}`,
        );
      if (link[1] !== a.title)
        fail(
          "index.md",
          `row ${a.number} says "${String(link[1])}" but the record is titled "${a.title}"`,
        );
    }
    if (row[2] !== a.fields.get("Status"))
      fail(
        "index.md",
        `row ${a.number}: Status ${String(row[2])} but the record says ${String(a.fields.get("Status"))}`,
      );
    if (row[3] !== a.fields.get("Date"))
      fail(
        "index.md",
        `row ${a.number}: Decided ${String(row[3])} but the record says ${String(a.fields.get("Date"))}`,
      );
    if (row[4] !== a.fields.get("Scope"))
      fail(
        "index.md",
        `row ${a.number}: Scope ${String(row[4])} but the record says ${String(a.fields.get("Scope"))}`,
      );
  }
  for (const number of rows.keys()) {
    if (!byNumber.has(number))
      fail("index.md", `has a row for ${number}, which has no file`);
  }
}

if (problems.length > 0) {
  console.log(
    `verify-adr: ${String(problems.length)} problem${problems.length === 1 ? "" : "s"}\n`,
  );
  for (const p of problems) console.log(`  FAIL  ${p}`);
  process.exit(1);
}
console.log(
  `verify-adr: ${String(adrs.length)} records, ${String(files.length)} files, index matches`,
);
