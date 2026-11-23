/**
 * U58 (NC-16, HR-31): question 6 of the setup wizard asked a new company about
 * "roles", listed eight that did not match the six the product has, and could
 * not be answered: its main button was "Skip for now". It is not asked. Access
 * roles are called "Access" in the menu and on their page, so "role" is left
 * for jobs.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { askedQuestions, resumeIndex } from "@/app/(setup)/setup/questions";
import type { ApiWizardQuestion } from "@/lib/api/setup";

const q = (id: string, step: number): ApiWizardQuestion => ({
  id,
  step,
  question: id,
  help: "",
  options: [],
});
const all = [
  q("headcount", 1),
  q("appraisals", 2),
  q("paye", 3),
  q("pension", 4),
  q("attendance", 5),
  q("roles", 6),
  q("salaryStructure", 7),
  q("nhf", 8),
];

describe("the setup wizard's questions", () => {
  it("does not ask about roles", () => {
    expect(askedQuestions(all).map((x) => x.id)).not.toContain("roles");
    expect(askedQuestions(all)).toHaveLength(7);
  });

  it("resumes at the first question not answered yet", () => {
    const asked = askedQuestions(all);
    expect(asked[resumeIndex(asked, 0)]!.id).toBe("headcount");
    /* Five answered: the next is salary structure, not the roles step. */
    expect(asked[resumeIndex(asked, 5)]!.id).toBe("salaryStructure");
    /* Everything answered: the last one, as before. */
    expect(resumeIndex(asked, 8)).toBe(asked.length - 1);
  });

  it("is what the wizard shows", () => {
    const wizard = readFileSync(
      path.resolve(import.meta.dirname, "../src/app/(setup)/setup/wizard.tsx"),
      "utf8",
    );
    expect(wizard).toContain("askedQuestions(wizard.questions)");
    expect(wizard).not.toMatch(/wizard\.questions\[index\]/);
  });
});

describe("access roles are called Access", () => {
  const read = (p: string) =>
    readFileSync(path.resolve(import.meta.dirname, "..", p), "utf8");
  it("in the menu", () => {
    expect(read("src/components/portal/nav.tsx")).toMatch(
      /href: "\/settings\/roles",\s+label: "Access"/,
    );
  });
  it("on their page", () => {
    expect(read("src/app/(app)/settings/roles/page.tsx")).toContain(
      'title: "Access"',
    );
  });
});
