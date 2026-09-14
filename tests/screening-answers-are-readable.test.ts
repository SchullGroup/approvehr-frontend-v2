import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * What a screener recorded can be read back, and an absence is never a zero.
 *
 * ## The defect
 *
 * `advance` on the screening queue collects a notice period, a current salary,
 * an expected salary, right to work and a CV key, and writes them onto
 * `Candidate`. `ApiApplicationDetail.candidate` has carried all of it since the
 * recruitment module shipped. **Nothing on the candidate record rendered any of
 * it**, and `useCandidateMutations().update` had no consumer at all — so a
 * recruiter typed somebody's salary expectation into a dialog and the record
 * never mentioned it again.
 *
 * Confirmed on live data before it was fixed: five seeded candidates all
 * carrying notice periods, expectations and right-to-work, none of it on screen.
 *
 * ## Why these are source assertions
 *
 * Mounting this panel needs a session, a permission set, a resolved application
 * and a toast provider, and would then prove that one fixture renders one way.
 * The claims worth holding are about the code, and each is one careless edit
 * from regressing:
 *
 * - money reaches `Money` as `null`, never `0` — a `?? 0` would satisfy every
 *   type in the repo and put ₦0.00 where nobody was asked;
 * - `rightToWork` keeps three states, so a `null` is never rendered as "No";
 * - `noticeDays` keeps nought apart from null;
 * - the update sends `null` to clear rather than omitting the field, which is
 *   the difference between correcting a mistake and living with it.
 */

const sourceOf = (relative: string) =>
  readFileSync(path.resolve(import.meta.dirname, relative), "utf8");

const panel = sourceOf(
  "../src/app/(app)/hiring/candidates/[id]/real-pipeline.tsx",
);
const screen = sourceOf(
  "../src/app/(app)/hiring/candidates/[id]/candidate-screen.tsx",
);
const client = sourceOf("../src/lib/api/recruitment.ts");

describe("the panel exists and is mounted", () => {
  it("renders on the connected record", () => {
    expect(panel).toMatch(/export function RealScreening/);
    expect(screen).toMatch(/<RealScreening/);
  });

  it("reads the five facts the API actually carries", () => {
    for (const field of [
      "noticeDays",
      "currentSalaryKobo",
      "expectedSalaryKobo",
      "rightToWork",
      "cvStorageKey",
    ]) {
      expect(panel).toContain(field);
    }
  });

  it("uses the mutation that had no consumer", () => {
    expect(panel).toMatch(/useCandidateMutations/);
  });
});

describe("an absence is never a zero", () => {
  it("hands Money a null rather than coercing it", () => {
    /* The whole rule, in the two places it decides money. A `?? 0` here would
       claim somebody earns nothing on the figure an offer is measured against —
       the payroll ₦0 defect, one module along. */
    const nulls = panel.match(/=== null\s*\?\s*null/g) ?? [];
    expect(nulls.length).toBeGreaterThanOrEqual(2);
    expect(panel).not.toMatch(/currentSalaryKobo\s*\?\?\s*0/);
    expect(panel).not.toMatch(/expectedSalaryKobo\s*\?\?\s*0/);
  });

  it("says the absence out loud rather than leaving a blank", () => {
    expect(panel).toMatch(/absent="Not asked"/);
  });

  it("keeps right to work at three states", () => {
    /* Two states would reject somebody for a question nobody put to them. */
    expect(panel).toMatch(/rightToWork === null/);
    expect(panel).toMatch(/Not confirmed/);
  });

  it("keeps nought notice days apart from nobody asking", () => {
    /* Nought is "they can start immediately", which is a reason to move fast.
       Null is the absence of an answer. */
    expect(panel).toMatch(/noticeDays === null/);
    expect(panel).toMatch(/noticeDays === 0/);
    expect(panel).toMatch(/Available immediately/);
  });
});

describe("a mistake can be taken back", () => {
  it("sends null to clear, rather than omitting the field", () => {
    /* Omitting leaves the value, which is right for a patch that does not
       mention a field and wrong for a box somebody emptied on purpose. The API
       gained `.nullable()` on these four for exactly this. */
    expect(client).toMatch(/noticeDays\?: number \| null/);
    expect(client).toMatch(/currentSalaryKobo\?: number \| null/);
    expect(client).toMatch(/expectedSalaryKobo\?: number \| null/);
    expect(client).toMatch(/rightToWork\?: boolean \| null/);
  });

  it("does not read an empty box as a zero", () => {
    /* `Number("")` is 0, so an empty field parsed loosely would write a salary
       of nothing instead of clearing it. */
    expect(panel).toMatch(/trimmed === ""\) return null/);
  });

  it("leaves the CV key set-or-omit, matching the API", () => {
    /* The key is the only handle on a file that may exist, and the API answers
       400 on a null. Offering to clear it would be a control the server
       refuses. */
    expect(client).toMatch(/cvStorageKey\?: string;/);
  });
});

describe("the CV is not offered as a download", () => {
  it("says it cannot be fetched rather than giving a dead button", () => {
    /* No deployment has ever set `S3_BUCKET`, so the bytes are not there. A
       download button whose only outcome is a refusal is a design failure two
       clicks earlier. */
    /* Whitespace-tolerant: JSX wraps prose across lines, so a literal regex
       matches the rendered sentence and not the source one. */
    const prose = panel.replace(/\s+/g, " ");
    expect(prose).toMatch(
      /cannot be downloaded until file storage is configured/,
    );

    /* Bounded to the next top-level declaration rather than the first closing
       brace — JSX is full of those, and the first draft of this cut the body in
       half and then asserted about the wrong text. */
    const from = panel.indexOf("function CvLine");
    const rest = panel.slice(from + 1);
    const next = rest.search(/\n(?:\/\*\*|function |export )/);
    const body = next === -1 ? rest : rest.slice(0, next);
    expect(body.replace(/\s+/g, " ")).toMatch(/storage key/);
    expect(body).not.toMatch(/ExportButton|<a |href=/);
  });
});

describe("the stale claim is gone", () => {
  it("no longer says those models have no route", () => {
    /* The screen's header argued the pipeline was seeded in both modes
       "because Candidate, the pipeline Application, Interview, Scorecard and
       Offer are Prisma models with no route". True when written; the
       recruitment module shipped afterwards. */
    expect(screen).not.toMatch(/are Prisma models\s*\n?\s*\*?\s*with no route/);
    expect(screen).toMatch(/recruitment module shipped afterwards/);
  });

  it("still says which one genuinely has no API", () => {
    /* The demo's per-role questionnaire. `Requisition` has no questions and
       `Application` has no answers, so wiring it would mean inventing
       questions nobody set — and the reader deserves to know which half is
       missing rather than wondering why one panel stayed seeded. */
    expect(screen).toMatch(/screeningQuestions/);
  });
});
