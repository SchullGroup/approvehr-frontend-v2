import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";

/**
 * Appraisal scoring, where the overall mark and Self-assessment meet.
 *
 * Self-assessment is read from the mark somebody gave themselves when there is
 * one, and from how they answered when there is not, so whether forms ask for an
 * overall mark does not decide whether the part has anything to count. The parts
 * page therefore reads the same either way: the API's sentence about what is
 * saved, once; what a weight costs; and no offer to switch marks on, which used to
 * be there because "nothing to count" was true.
 *
 * What does depend on the switch is the card on the Names of marks tab, and that
 * it is read again when the switch moves, so the API's sentence follows it.
 */

const reload = vi.fn();
const setOverallMark = vi.fn<(next: boolean) => Promise<object>>(
  async () => ({}),
);

type Part = { source: string; name: string; weightBp: number };
const partsOf = (self: number): Part[] =>
  [
    {
      source: "OBJECTIVES",
      name: "Delivery against objectives",
      weightBp: 4000,
    },
    { source: "CORE_COMPETENCY", name: "Core competencies", weightBp: 2000 },
    {
      source: "BEHAVIOURAL_COMPETENCY",
      name: "Behavioural competencies",
      weightBp: 1000,
    },
    { source: "LEADERSHIP", name: "Leadership", weightBp: 3000 - self },
    { source: "SELF_ASSESSMENT", name: "Self-assessment", weightBp: self },
  ].filter((part) => part.weightBp > 0);
let selfSaved = 2000;
let overallMark: boolean | null = false;

vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
/* One object per saved set, so a re-render hands the screen the same list. */
const viewBySaved = new Map<number, unknown>();
const viewFor = (self: number) => {
  if (!viewBySaved.has(self)) {
    const parts = partsOf(self);
    const totalBp = parts.reduce((sum, part) => sum + part.weightBp, 0);
    viewBySaved.set(self, {
      parts: parts.map((part) => ({
        id: part.source,
        source: part.source,
        sourceLabel: part.name,
        name: part.name,
        description: null,
        weightBp: part.weightBp,
        shareBp: Math.round((part.weightBp * 10000) / totalBp),
      })),
      totalBp,
      sources: [],
      selfAssessmentNote: "THE API'S NOTE",
    });
  }
  return viewBySaved.get(self);
};
vi.mock("@/lib/store/performance", async (original) => ({
  ...(await original<typeof import("@/lib/store/performance")>()),
  useScoringParts: () => ({
    parts: viewFor(selfSaved),
    loading: false,
    error: null,
    source: "api",
    editable: true,
    refusal: "",
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    reload,
  }),
}));
vi.mock("@/lib/store/features", async (original) => ({
  ...(await original<typeof import("@/lib/store/features")>()),
  useFeatureSettings: () => ({
    overallMark,
    editable: true,
    loading: false,
    saving: null,
    error: null,
    setOverallMark,
  }),
}));

import { ScoringWeightsForm } from "@/app/(app)/settings/performance/weights-form";

const mount = (tab: "weights" | "marks" = "weights") =>
  render(
    <ToastProvider>
      <ScoringWeightsForm scale={<p>THE SCALE FORM</p>} initialTab={tab} />
    </ToastProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  selfSaved = 2000;
  overallMark = false;
  window.history.replaceState(null, "", "/settings/performance");
});

describe("Self-assessment reads the same whatever forms ask for", () => {
  it.each([
    ["off", false],
    ["on", true],
    ["not said", null],
  ] as const)(
    "describes what a weight costs when the setting is %s",
    (_name, value) => {
      overallMark = value;
      mount();
      expect(
        screen.getByText(/moves their own final mark by 10%/),
      ).toBeInTheDocument();
      expect(screen.getByText("What we do instead")).toBeInTheDocument();
    },
  );

  it("does not offer to switch overall marks on, because the part counts without it", () => {
    overallMark = false;
    mount();
    expect(
      screen.queryByRole("button", {
        name: "Switch overall marks on under Names of marks",
      }),
    ).toBeNull();
  });

  it("argues against a weight at the default, whatever forms ask for", () => {
    selfSaved = 0;
    overallMark = false;
    mount();
    expect(
      screen.getByText(/Add a part scored from self-assessment/),
    ).toBeInTheDocument();
  });

  it("keeps the API's own sentence about what is saved, so it is said once and by the API", () => {
    mount();
    expect(screen.getAllByText("THE API'S NOTE")).toHaveLength(1);
  });

  it("says the person's own answers are shown beside the manager's, not a self-rating", () => {
    mount();
    expect(
      screen.getByText(/Their own answers are shown beside the manager's/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/The self-rating is shown/)).toBeNull();
  });
});

describe("the Names of marks tab", () => {
  it("opens with the switch, ahead of the names it decides whether to offer", () => {
    mount("marks");
    const card = screen.getByText("Overall mark on appraisals");
    const scale = screen.getByText("THE SCALE FORM");
    expect(
      card.compareDocumentPosition(scale) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });

  it("asks the parts to be read again after the switch moves, so the API's note follows it", async () => {
    mount("marks");
    await userEvent.click(screen.getByRole("switch"));
    expect(setOverallMark).toHaveBeenCalledWith(true);
    await screen.findByText("Appraisal forms will end with an overall mark");
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
