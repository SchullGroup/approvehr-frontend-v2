import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";

/**
 * Appraisal scoring, where the overall mark and Self-assessment meet.
 *
 * Self-assessment is the overall mark somebody gave themselves, so what the
 * weights page may say about it depends on whether forms ask for one. Switched
 * off, "somebody who rates themselves 5 rather than 3 moves their own mark" would
 * describe something nobody can do, so it is not said, and the page offers the
 * way to the switch instead of repeating the API's explanation. A server that
 * does not know the setting is not "off", and the page must read exactly as it did.
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

describe("Self-assessment while forms do not ask for an overall mark", () => {
  it("offers the way to the switch, instead of describing a swing nobody can cause", () => {
    mount();
    expect(
      screen.getByRole("button", {
        name: "Switch overall marks on under Names of marks",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/moves their own final mark/)).toBeNull();
    expect(screen.queryByText("What we do instead")).toBeNull();
  });

  it("offers it at the default weight too, instead of arguing against a weight nobody can use yet", () => {
    selfSaved = 0;
    mount();
    expect(
      screen.getByRole("button", {
        name: "Switch overall marks on under Names of marks",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Set this above 0%/)).toBeNull();
  });

  it("does not repeat the API's explanation in words of its own", () => {
    mount();
    expect(screen.queryByText(/Overall marks are switched off/)).toBeNull();
    expect(screen.queryByText(/no self-given mark/)).toBeNull();
  });

  it("keeps the API's own sentence about what is saved, so it is said once and by the API", () => {
    mount();
    expect(screen.getByText("THE API'S NOTE")).toBeInTheDocument();
  });

  it("no longer claims it is collected either way", () => {
    mount();
    expect(screen.queryByText(/Collected either way/)).toBeNull();
  });

  it("takes the person to the switch without leaving the page", async () => {
    mount();
    const panel = () => screen.getByText("THE SCALE FORM").closest("[hidden]");
    expect(panel()).not.toBeNull();
    await userEvent.click(
      screen.getByRole("button", {
        name: "Switch overall marks on under Names of marks",
      }),
    );
    expect(panel()).toBeNull();
    expect(window.location.search).toBe("?tab=marks");
  });
});

describe("Self-assessment where forms ask for one, or the server does not say", () => {
  it.each([
    ["on", true],
    ["not said", null],
  ] as const)(
    "reads as it always did when the setting is %s",
    (_name, value) => {
      overallMark = value;
      mount();
      expect(
        screen.getByText(/moves their own final mark by 10%/),
      ).toBeInTheDocument();
      expect(screen.getByText("What we do instead")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: "Switch overall marks on under Names of marks",
        }),
      ).toBeNull();
    },
  );
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

  it("is told the weight that is saved, not the one being typed", async () => {
    selfSaved = 0;
    mount("marks");
    /* Typing 20% into Self-assessment is a draft. The card is about what a
       form would do today, so it says nothing until that is saved. */
    const weight = screen.getAllByLabelText("Weight")[4]!;
    await userEvent.clear(weight);
    await userEvent.type(weight, "20");
    expect(
      screen.queryByRole("button", {
        name: /Self-assessment has nothing to count/,
      }),
    ).toBeNull();
  });

  it("says Self-assessment has nothing to count once a weight is saved with the mark off", () => {
    mount("marks");
    expect(
      screen.getByRole("button", {
        name: /Self-assessment has nothing to count/,
      }),
    ).toBeInTheDocument();
  });
});
