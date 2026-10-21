/**
 * The loading and failure rule is checked, not trusted.
 *
 * `components/ui/load-state.tsx` states it: while a read is loading a screen
 * shows skeletons and no count; after it fails, the failure card and neither the
 * empty state nor a count. A visual audit found it broken on six screens that
 * said something false while loading ("this month has no payslips on it", "You
 * have not clocked in today" beside a live Clock in button, "Nothing waiting on
 * you" and ₦0.00) and on about ten more that showed the failure and then an
 * empty state with a call to action under it. Each was written by somebody who
 * handled `loading`, `error` and `rows.length === 0` correctly in isolation. The
 * defect is the combination, and `tsc` cannot see a combination.
 *
 * ## What this can and cannot prove
 *
 * It cannot prove a screen is correct — only a render can, and `tests/
 * load-state.test.tsx` renders the helper. What a source scan can do is stop the
 * rule **drifting back**, in two ways:
 *
 * 1. **The adopted screens stay adopted.** Each file in `ADOPTED` was moved onto
 *    `LoadState` / `loadPhase` and must keep using it. A refactor that puts the
 *    three booleans back is the regression this exists to catch.
 *
 * 2. **A ratchet over everything else.** A file that renders both a failure
 *    (`LoadFailure`) and an empty state (`EmptyState`) *can* say "nothing here"
 *    directly under "this did not load" — that is the shape of the defect — and
 *    it is not on the shared rule. Those files are listed in
 *    `scripts/load-rule-baseline.json`. The list may only get shorter: a file
 *    that is not in it and has the shape fails here, and a file in it that no
 *    longer has the shape fails here too, so the baseline is always exactly the
 *    work still to do rather than a number nobody trusts.
 *
 *    This is a proxy, honestly: some baseline files handle it correctly by
 *    hand, and a screen could say something false while loading without
 *    rendering a `LoadFailure` at all. It is the cheapest signal that is true of
 *    the files the audit actually found.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const BASELINE = path.join(ROOT, "scripts", "load-rule-baseline.json");

/** Moved onto the rule. Paths relative to the repo root. */
const ADOPTED = [
  "src/app/(app)/approvals/inbox.tsx",
  "src/app/(app)/dashboard/app-use-card.tsx",
  "src/app/(app)/dashboard/dashboard-screen.tsx",
  "src/app/(app)/dashboard/today-panel.tsx",
  "src/app/(app)/hiring/hiring-screen.tsx",
  "src/app/(app)/hiring/postings/postings-screen.tsx",
  "src/app/(app)/payroll/payslips/index-table.tsx",
  "src/app/(app)/people/departments/departments-screen.tsx",
  "src/app/(app)/people/directory.tsx",
  "src/app/(app)/people/leave/leave-screen.tsx",
  "src/app/(app)/performance/kpis.tsx",
  "src/app/(app)/profile/profile-screen.tsx",
  "src/components/portal/my-clock-card.tsx",
];

const USES_RULE = /\b(LoadState|loadPhase)\b/;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}

const rel = (file: string) =>
  path.relative(ROOT, file).split(path.sep).join("/");

/** Comments do not render; a mention of `<EmptyState` in one is not the shape. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const problems: string[] = [];

/* ------------------------------------------------------------- 1. adopted */

for (const file of ADOPTED) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) {
    problems.push(
      `${file} is listed as adopted but does not exist. Remove it from ADOPTED in scripts/verify-load-rule.ts.`,
    );
    continue;
  }
  if (!USES_RULE.test(withoutComments(fs.readFileSync(full, "utf8")))) {
    problems.push(
      `${file} no longer uses LoadState or loadPhase. It was moved onto the loading and failure rule and must stay there: while loading it shows skeletons and no counts, and after a failure the failure card and no empty state.`,
    );
  }
}

/* ------------------------------------------------------------- 2. ratchet */

const baseline: string[] = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
const known = new Set(baseline);

const shaped = walk(SRC)
  .map((file) => ({
    file: rel(file),
    code: withoutComments(fs.readFileSync(file, "utf8")),
  }))
  .filter(
    ({ code }) =>
      /<EmptyState\b/.test(code) &&
      /\bLoadFailure\b/.test(code) &&
      !USES_RULE.test(code),
  )
  .map(({ file }) => file)
  .sort();
const shapedSet = new Set(shaped);

const added = shaped.filter((file) => !known.has(file));
const cleared = baseline.filter((file) => !shapedSet.has(file));

/* `--shrink` drops files that have left the baseline, which is the only way it
   is ever allowed to change. `--init` writes the first baseline and refuses once
   there is one, so neither flag can be used to add a file past the check. */
if (process.argv.includes("--init")) {
  if (baseline.length > 0) {
    console.error(
      "The baseline already exists; --init only writes a first one.",
    );
    process.exit(1);
  }
  fs.writeFileSync(BASELINE, JSON.stringify(shaped, null, 2) + "\n");
  console.log(`Wrote a baseline of ${shaped.length} files.`);
  process.exit(0);
}
if (process.argv.includes("--shrink") && cleared.length > 0) {
  const kept = baseline.filter((file) => shapedSet.has(file));
  fs.writeFileSync(BASELINE, JSON.stringify(kept, null, 2) + "\n");
  console.log(`Removed ${cleared.length} files from the baseline.`);
  process.exit(0);
}

if (added.length > 0) {
  problems.push(
    `These files render a failure (LoadFailure) and an empty state (EmptyState) without the shared rule, so they can say "nothing here" under "this did not load":\n` +
      added.map((file) => `    ${file}`).join("\n") +
      `\n  Wrap the part that counts or says "empty" in <LoadState> (components/ui/load-state.tsx). Do not add to scripts/load-rule-baseline.json — it only shrinks.`,
  );
}

if (cleared.length > 0) {
  problems.push(
    `These files are in scripts/load-rule-baseline.json but no longer have the shape, which is good news. Remove them so the baseline stays exactly the work still to do:\n` +
      cleared.map((file) => `    ${file}`).join("\n"),
  );
}

if (problems.length > 0) {
  console.error(`\nLoad rule check failed.\n`);
  for (const problem of problems) console.error(`  - ${problem}\n`);
  process.exit(1);
}

console.log(
  `Load rule check passed. ${ADOPTED.length} screens on the shared rule, ${baseline.length} still to move (baseline), none added.`,
);
