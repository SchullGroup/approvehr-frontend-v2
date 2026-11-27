import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiComponentScore } from "@/lib/api/performance";
import {
  ScoreParts,
  partScoreWords,
  scorePartsOf,
} from "@/components/performance/score-parts";

/**
 * The one list of what a score is made of, drawn on the record of an appraisal
 * and in the history drawer.
 *
 * What is pinned: a part with nothing recorded is not in the list (and a list
 * with none draws nothing at all); a score is in the headline's out-of-5 words,
 * never a percentage; the sentences that used to sit under each part are lines
 * of one tooltip; Tasks done is not listed where the company has no Projects.
 */

const state = vi.hoisted(() => ({ projects: true }));
vi.mock("@/lib/store/project-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/project-session")>()),
  useProjectsGate: () => ({ enabled: state.projects, loading: false }),
}));

const part = (
  component: string,
  label: string,
  over: Partial<ApiComponentScore> = {},
): ApiComponentScore => ({
  component: component as ApiComponentScore["component"],
  label,
  scoreBp: 7500,
  weightBp: 4000,
  effectiveWeightBp: 4000,
  included: true,
  excludedBecause: null,
  excludedNote: null,
  evidenceCount: 2,
  ...over,
});

const objectives = part("OBJECTIVES", "Objectives");
const competencies = part("CORE_COMPETENCY", "Core competencies", {
  scoreBp: 5000,
  weightBp: 6000,
  effectiveWeightBp: 6000,
});
const leadership = part("LEADERSHIP", "Leadership", {
  scoreBp: null,
  weightBp: 2000,
  effectiveWeightBp: 0,
  included: false,
  excludedBecause: "NOT_A_MANAGER",
  excludedNote: "They manage nobody.",
  evidenceCount: 0,
});

afterEach(() => {
  cleanup();
  state.projects = true;
});

describe("which parts are in the list", () => {
  it("keeps the parts with a score and leaves out the ones with nothing recorded", () => {
    const { rows } = scorePartsOf([objectives, competencies, leadership], {
      projects: true,
    });
    expect(rows.map((row) => row.label)).toEqual([
      "Objectives",
      "Core competencies",
    ]);
  });

  it("leaves out a part that holds a score but was not counted", () => {
    const { rows } = scorePartsOf(
      [objectives, part("LEADERSHIP", "Leadership", { included: false })],
      { projects: true },
    );
    expect(rows.map((row) => row.label)).toEqual(["Objectives"]);
  });

  it("leaves Tasks done out where the company has no Projects", () => {
    const tasks = part("TASKS", "Tasks done");
    expect(
      scorePartsOf([objectives, tasks], { projects: true }).rows,
    ).toHaveLength(2);
    expect(
      scorePartsOf([objectives, tasks], { projects: false }).rows,
    ).toHaveLength(1);
  });

  it("draws nothing at all when no part has anything recorded", () => {
    const { container } = render(<ScoreParts components={[leadership]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("what a row says", () => {
  it("says the score out of 5, in the headline's unit, never as a percentage", () => {
    expect(partScoreWords(7500)).toBe("4.0 out of 5");
    expect(partScoreWords(5000)).toBe("3.0 out of 5");
    expect(partScoreWords(0)).toBe("1.0 out of 5");
    render(<ScoreParts components={[objectives, competencies]} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Objectives");
    expect(rows[0]).toHaveTextContent("4.0 out of 5");
    expect(rows[0]).toHaveTextContent("40% weight");
    expect(rows[1]).toHaveTextContent("3.0 out of 5");
    expect(screen.queryByText(/^\d+(\.\d+)?%$/)).toBeNull();
  });

  it("has one thin bar per part", () => {
    render(<ScoreParts components={[objectives, competencies]} />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveAttribute("aria-label", "Objectives");
  });

  it("says the weight a part actually carried, not the one set", () => {
    render(
      <ScoreParts
        components={[
          part("OBJECTIVES", "Objectives", {
            weightBp: 4000,
            effectiveWeightBp: 5000,
          }),
        ]}
      />,
    );
    expect(screen.getByText("50% weight")).toBeInTheDocument();
  });
});

describe("the tooltip", () => {
  it("is the only place a sentence is said, one line each", () => {
    const { lines } = scorePartsOf(
      [
        part("OBJECTIVES", "Objectives", {
          weightBp: 4000,
          effectiveWeightBp: 6000,
        }),
        leadership,
      ],
      { projects: true, notes: ["Frozen.", false, null] },
    );
    expect(lines).toEqual([
      "Leadership was left out, so the other parts share its weight and count for more than the company set.",
      "Leadership: They manage nobody.",
      "Objectives: Set at 40% by the company.",
      "Frozen.",
    ]);
  });

  it("says nothing for a part weighted at nothing, which never held a weight", () => {
    const { lines } = scorePartsOf(
      [
        objectives,
        part("LEADERSHIP", "Leadership", {
          scoreBp: null,
          weightBp: 0,
          effectiveWeightBp: 0,
          included: false,
          excludedBecause: "NOT_WEIGHTED",
          excludedNote: "Not weighted.",
        }),
      ],
      { projects: true },
    );
    expect(lines).toEqual([]);
  });

  it("is not drawn when there is nothing to say", async () => {
    render(<ScoreParts components={[objectives, competencies]} />);
    expect(
      screen.queryByRole("button", { name: "About this score" }),
    ).toBeNull();
  });

  it("opens from one icon, and the lines are not on the page until it does", async () => {
    render(
      <ScoreParts
        components={[objectives, leadership]}
        notes={["Scored on the weights it started with."]}
      />,
    );
    expect(screen.queryByText(/was left out/)).toBeNull();
    const list = screen.getByRole("list");
    expect(within(list).queryByText(/They manage nobody/)).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "About this score" }),
    );
    expect(screen.getByText(/Leadership was left out/)).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "About this score" }),
    ).toHaveLength(1);
  });
});
