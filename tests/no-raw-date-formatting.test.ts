import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The 22nd call site.
 *
 * Converting 21 of these was a day's work; letting one back in is a moment's,
 * and the symptom — one screen in company time and another in whoever is
 * looking's browser time — is worse than the original bug because it looks
 * deliberate. `src/lib/time.ts` is the one place allowed to reach for
 * `Intl.DateTimeFormat`.
 *
 * ## Why this bans date APIs and not "any locale formatting"
 *
 * The plan this replaces banned bare `toLocaleString`, which this codebase
 * calls roughly 70 times — kobo amounts, headcounts, row counts, character
 * limits — none of them a date, none of them taking a `timeZone`, all of them
 * `Number.prototype.toLocaleString`. A test written that way could never
 * pass, and would not say anything true about the bug this branch fixes: a
 * naira figure does not disagree between two colleagues in different
 * countries, a scheduled interview does. So this bans exactly the APIs that
 * format a *date*: `toLocaleDateString`, `toLocaleTimeString`,
 * `Intl.DateTimeFormat`, and `toLocaleString` — but only where the receiver
 * is traceably a `Date`, found by tracing it back to a `new Date(...)`
 * (chained directly, or through a `const x = new Date(...)` a few lines
 * up — the shape every real site converted on this branch actually took).
 * `Number.prototype.toLocaleString` never looks like that.
 *
 * Comments are stripped before matching (same as
 * `org-chart-has-no-pay.test.ts`'s `withoutComments`), so a doc comment that
 * merely *mentions* `toLocaleDateString` — explaining why a component hand-
 * rolls its date formatting instead, for example — is not mistaken for a
 * call.
 *
 * `src/lib/time.ts` is excluded because it is the one module allowed to
 * format a date. `src/lib/marketing/careers.ts` is excluded because it is a
 * public careers page with no signed-in company to read a zone from, and the
 * one date it formats is a date-only value deliberately anchored to UTC —
 * not an instance of this bug.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.resolve(REPO_ROOT, "src");

const EXCLUDED = new Set([
  path.resolve(SRC, "lib/time.ts"),
  path.resolve(SRC, "lib/marketing/careers.ts"),
]);

/** Comments out, code in — see org-chart-has-no-pay.test.ts for why. */
const withoutComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function violationsIn(source: string, relPath: string): string[] {
  const lines = source.split("\n");

  /* Locals assigned straight from `new Date(...)`, so `x.toLocaleString(` a
     few lines later is still traceable to a Date rather than a Number. */
  const dateVars = new Set<string>();
  for (const line of lines) {
    const match = line.match(/\b(?:const|let)\s+(\w+)\s*=\s*new Date\(/);
    if (match) dateVars.add(match[1]);
  }

  const hits: string[] = [];
  lines.forEach((line, i) => {
    const lineNo = i + 1;
    const flag = () => hits.push(`${relPath}:${lineNo}: ${line.trim()}`);

    if (line.includes(".toLocaleDateString(")) flag();
    if (line.includes(".toLocaleTimeString(")) flag();
    if (line.includes("Intl.DateTimeFormat(")) flag();

    if (line.includes(".toLocaleString(")) {
      const chainedOffDate = /new Date\([^()]*\)\s*\.\s*toLocaleString\(/.test(
        line,
      );
      const offDateVariable = [...dateVars].some((name) =>
        new RegExp(`\\b${name}\\b\\s*\\.\\s*toLocaleString\\(`).test(line),
      );
      if (chainedOffDate || offDateVariable) flag();
    }
  });

  return hits;
}

describe("date formatting goes through lib/time", () => {
  const files = collectSourceFiles(SRC).filter((f) => !EXCLUDED.has(f));

  it("has no raw date-locale formatting outside the helper", () => {
    const hits = files.flatMap((file) => {
      const raw = readFileSync(file, "utf8");
      const relPath = path.relative(REPO_ROOT, file);
      return violationsIn(withoutComments(raw), relPath);
    });

    /* An array rather than a joined string, so a failure prints one offending
       line per row — the working list this doubles as. */
    expect(hits).toEqual([]);
  });

  it("still reads the files it thinks it does", () => {
    /* A path or exclusion that stopped resolving would make the assertion
       above pass on an empty file list, which is a silent no-op wearing a
       green checkmark. This keeps that honest. */
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith(path.join("lib", "time.ts")))).toBe(
      false,
    );

    const timeDotTs = readFileSync(path.resolve(SRC, "lib/time.ts"), "utf8");
    expect(timeDotTs).toMatch(/Intl\.DateTimeFormat/);
  });
});
