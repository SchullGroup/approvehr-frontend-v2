import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";

/**
 * Appraisal scoring, where the overall mark and Self-assessment meet.
 *
 * Self-assessment is read from the mark somebody gave themselves when there is
 * one, and from how they answered when there is not, so whether forms ask for an
 * overall mark does not decide whether the part has anything to count. The weights
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

type Row = { component: string; label: string; weightBp: number };
const rows = (self: number): Row[] => [
  {
    component: "OBJECTIVES",
    label: "Delivery against objectives",
    weightBp: 4000,
  },
  { component: "CORE_COMPETENCY", label: "Core competencies", weightBp: 2000 },
  {
    component: "BEHAVIOURAL_COMPETENCY",
    label: "Behavioural competencies",
    weightBp: 1000,
  },
  { component: "LEADERSHIP", label: "Leadership", weightBp: 3000 - self },
  { component: "SELF_ASSESSMENT", label: "Self-assessment", weightBp: self },
];
let selfSaved = 2000;
let overallMark: boolean | null = false;

vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
/* One object per saved weight. The form keeps a draft only while the weights it
   was started from are the same object, so a fresh one on every render would
   throw every keystroke away and the draft cases below would prove nothing. */
const weightsBySaved = new Map<number, unknown>();
const weightsFor = (self: number) => {
  if (!weightsBySaved.has(self)) {
    weightsBySaved.set(self, {
      source: "saved",
      selfAssessmentNote: "THE API'S NOTE",
      frozenCycles: [],
      rows: rows(self),
    });
  }
  return weightsBySaved.get(self);
};
vi.mock("@/lib/store/performance", async (original) => ({
  ...(await original<typeof import("@/lib/store/performance")>()),
  useScoringWeights: () => ({
    weights: weightsFor(selfSaved),
    loading: false,
    error: null,
    source: "api",
    editable: true,
    refusal: "",
    save: vi.fn(),
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
    expect(screen.getByText(/Set this above 0%/)).toBeInTheDocument();
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

  it("asks the weights to be read again after the switch moves, so the API's note follows it", async () => {
    mount("marks");
    await userEvent.click(screen.getByRole("switch"));
    expect(setOverallMark).toHaveBeenCalledWith(true);
    await screen.findByText("Appraisal forms will end with an overall mark");
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
