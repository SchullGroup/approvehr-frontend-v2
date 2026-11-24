import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiQuestion } from "@/lib/api/performance";
import {
  answerOf,
  audienceOf,
  createBody,
  groupsOf,
  whoOf,
} from "@/lib/performance/question-groups";

/**
 * Add questions: the step after a period is created (owner, 24 Nov 2026). The
 * usual questions are already in, one screen per group, a final count, and a
 * started period is read only.
 */

const state = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  stage: "DRAFT" as string,
  questions: [] as unknown[],
  addQuestion: vi.fn(),
  addStandard: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push, replace: state.replace }),
}));
vi.mock("@/lib/store/performance", () => ({
  useAppraisals: () => ({
    cycles: [{ id: "c1", name: "H2", stage: state.stage }],
  }),
  useCycleQuestions: () => ({
    questions: state.questions,
    loading: false,
    error: null,
    reload: state.reload,
  }),
  useFramework: () => ({
    competencies: [
      {
        id: "k1",
        name: "Teamwork",
        sectionId: "s-core",
        active: true,
        archived: false,
      },
    ],
  }),
  useSections: () => ({
    sections: [
      { id: "s-core", component: "CORE_COMPETENCY" },
      { id: "s-b", component: "BEHAVIOURAL_COMPETENCY" },
    ],
  }),
  useCycleMutations: () => ({
    addQuestion: state.addQuestion,
    addStandardQuestions: state.addStandard,
    updateQuestion: vi.fn(),
    removeQuestion: vi.fn(),
    reorderQuestions: vi.fn(),
  }),
}));

const q = (over: Partial<ApiQuestion> & { id: string }): ApiQuestion =>
  ({
    reviewCycleId: "c1",
    competencyId: null,
    prompt: over.id,
    kind: "TEXT",
    askedOf: ["SELF"],
    required: true,
    options: [],
    allowCustom: false,
    order: 0,
    source: "HR",
    departmentIds: [],
    ...over,
  }) as ApiQuestion;

const { QuestionsWizard } =
  await import("@/app/(app)/performance/periods/[id]/questions/questions-wizard");

beforeEach(() => {
  state.stage = "DRAFT";
  state.questions = [
    q({ id: "What went well?" }),
    q({ id: "What should they improve?", askedOf: ["MANAGER"] }),
  ];
  state.addQuestion = vi.fn().mockResolvedValue({});
  state.addStandard = vi.fn().mockResolvedValue([]);
  state.push = vi.fn();
  state.replace = vi.fn();
  state.reload = vi.fn();
});

describe("the rules, as data", () => {
  it("files by subsection's section, else by who is asked", () => {
    const map = new Map([["k1", "core" as const]]);
    expect(groupsOf({ competencyId: "k1", askedOf: ["SELF"] }, map)).toEqual([
      "core",
    ]);
    expect(groupsOf({ competencyId: null, askedOf: ["SELF"] }, map)).toEqual([
      "self",
    ]);
    expect(
      groupsOf({ competencyId: null, askedOf: ["SELF", "MANAGER"] }, map),
    ).toEqual(["self", "manager"]);
    expect(groupsOf({ competencyId: null, askedOf: [] }, map)).toEqual([
      "self",
      "manager",
    ]);
  });
  it("sends the type, who and required, trimmed", () => {
    expect(
      createBody({
        prompt: "  How did it go?  ",
        answer: "BOOLEAN",
        who: "BOTH",
        required: false,
        competencyId: "k1",
      }),
    ).toEqual({
      prompt: "How did it go?",
      kind: "BOOLEAN",
      askedOf: ["SELF", "MANAGER"],
      required: false,
      competencyId: "k1",
    });
    expect(whoOf(audienceOf("MANAGER"))).toBe("MANAGER");
    expect(answerOf("CHOICE")).toBe("TEXT");
  });
});

describe("the screens", () => {
  it("opens on the self review group with what is already in, and continues the progress bar", () => {
    render(<QuestionsWizard cycleId="c1" />);
    expect(
      screen.getByRole("heading", { name: "Self review questions" }),
    ).toBeInTheDocument();
    expect(screen.getByText("What went well?")).toBeInTheDocument();
    expect(screen.queryByText("What should they improve?")).toBeNull();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      expect.any(String),
    );
  });

  it("puts the standard set in once when a draft has none", () => {
    state.questions = [];
    render(<QuestionsWizard cycleId="c1" />);
    expect(state.addStandard).toHaveBeenCalledTimes(1);
    expect(state.addStandard).toHaveBeenCalledWith("c1");
  });

  it("adds a question to the group with its type, who answers and required", async () => {
    const user = userEvent.setup();
    render(<QuestionsWizard cycleId="c1" />);
    await user.click(screen.getByRole("button", { name: "Add a question" }));
    await user.type(screen.getByLabelText("Question"), "What did you learn?");
    await user.click(screen.getByRole("button", { name: "Add question" }));
    expect(state.addQuestion).toHaveBeenCalledWith("c1", {
      prompt: "What did you learn?",
      kind: "TEXT",
      askedOf: ["SELF"],
      required: true,
    });
  });

  it("refuses a too-short question without asking the server", async () => {
    const user = userEvent.setup();
    render(<QuestionsWizard cycleId="c1" />);
    await user.click(screen.getByRole("button", { name: "Add a question" }));
    await user.type(screen.getByLabelText("Question"), "Hi");
    await user.click(screen.getByRole("button", { name: "Add question" }));
    expect(state.addQuestion).not.toHaveBeenCalled();
    expect(screen.getByText("Write the question out.")).toBeInTheDocument();
  });

  it("walks the groups, counts each on the last screen, and Finish lands on the period", async () => {
    const user = userEvent.setup();
    render(<QuestionsWizard cycleId="c1" />);
    for (const title of [
      "Manager review questions",
      "Core competency questions",
      "Behavioural competency questions",
      "Review and finish",
    ]) {
      await user.click(screen.getByRole("button", { name: "Continue" }));
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    const list = screen.getByRole("list");
    expect(within(list).getByText("Self review questions")).toBeVisible();
    expect(within(list).getAllByText("1 question").length).toBe(2);
    expect(within(list).getAllByText("0 questions").length).toBe(2);
    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(state.push).toHaveBeenCalledWith("/performance/periods/c1");
  });

  it("keeps two buttons on a step and Use the defaults and finish as a link under them", () => {
    render(<QuestionsWizard cycleId="c1" />);
    const form = screen
      .getByRole("heading", { name: "Self review questions" })
      .closest("form") as HTMLElement;
    const skip = within(form).getByRole("button", {
      name: "Use the defaults and finish",
    });
    expect(skip.className).toMatch(/underline/);
    expect(skip.className).not.toMatch(/bg-accent/);
  });

  it("offers Use the defaults and finish before the last screen", async () => {
    const user = userEvent.setup();
    render(<QuestionsWizard cycleId="c1" />);
    await user.click(
      screen.getByRole("button", { name: "Use the defaults and finish" }),
    );
    expect(state.push).toHaveBeenCalledWith("/performance/periods/c1");
  });

  it("sends a started period to its Questions tab instead of a dead end", () => {
    state.stage = "SELF";
    const { container } = render(<QuestionsWizard cycleId="c1" />);
    expect(state.replace).toHaveBeenCalledWith(
      "/performance/periods/c1?tab=questions",
    );
    expect(container).toBeEmptyDOMElement();
    expect(state.addStandard).not.toHaveBeenCalled();
    expect(screen.queryByText(/can no longer change/)).toBeNull();
  });
});
