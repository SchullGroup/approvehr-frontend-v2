import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";

/**
 * The Records tab of Appraisal scoring.
 *
 * Three company decisions about the performance module live on it, and none reaches a mark: how long
 * the work behind a final rating is kept, whether people may use their own finished work in their
 * review answers, and whether the two assists are offered (the linked tasks beside Confirm and the
 * weekly-line suggestions). What is proved here is only that each is on the tab, in that order, and
 * that they are the page's own tab and not the weights or the names: the cards themselves are held by
 * their own files' tests.
 */

const setWorkInAnswers = vi.fn<(next: boolean) => Promise<object>>(
  async () => ({}),
);
const setWorkAssists = vi.fn<(next: boolean) => Promise<object>>(
  async () => ({}),
);

vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
const weights = {
  source: "saved",
  selfAssessmentNote: "THE API'S NOTE",
  frozenCycles: [],
  rows: [
    { component: "OBJECTIVES", label: "Delivery", weightBp: 5000 },
    { component: "CORE_COMPETENCY", label: "Core", weightBp: 5000 },
  ],
};
vi.mock("@/lib/store/performance", async (original) => ({
  ...(await original<typeof import("@/lib/store/performance")>()),
  useScoringWeights: () => ({
    weights,
    loading: false,
    error: null,
    source: "api",
    editable: true,
    refusal: "",
    save: vi.fn(),
    reload: vi.fn(),
  }),
}));
vi.mock("@/lib/store/features", async (original) => ({
  ...(await original<typeof import("@/lib/store/features")>()),
  useFeatureSettings: () => ({
    overallMark: false,
    workEvidenceMonths: null,
    workInAnswers: false,
    workAssists: false,
    flags: { projects: true },
    editable: true,
    loading: false,
    saving: null,
    error: null,
    setOverallMark: vi.fn(),
    setWorkEvidenceMonths: vi.fn(),
    setWorkInAnswers,
    setWorkAssists,
  }),
}));

import { ScoringWeightsForm } from "@/app/(app)/settings/performance/weights-form";

const mount = () =>
  render(
    <ToastProvider>
      <ScoringWeightsForm scale={<p>THE SCALE FORM</p>} initialTab="records" />
    </ToastProvider>,
  );

const records = () =>
  screen.getByRole("tabpanel", { name: "Records", hidden: true });

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/settings/performance?tab=records");
});

describe("the Records tab", () => {
  it("holds how long work is kept and whether people may use their work in their answers", () => {
    mount();
    const tab = within(records());
    expect(tab.getByText("Work kept with a final rating")).toBeInTheDocument();
    expect(tab.getByText("Work in review answers")).toBeInTheDocument();
    expect(
      tab.getByRole("switch", {
        name: /Let people use their own project work/,
      }),
    ).not.toBeChecked();
  });

  it("holds the two assists' switch as well", () => {
    mount();
    const tab = within(records());
    expect(
      tab.getByText("Work behind a milestone, and weekly lines"),
    ).toBeInTheDocument();
    expect(
      tab.getByRole("switch", {
        name: /Offer the linked tasks beside Confirm/,
      }),
    ).not.toBeChecked();
  });

  it("puts the switches in order: how long work is kept, then work in answers, then the assists", () => {
    mount();
    const text = records().textContent ?? "";
    const kept = text.indexOf("Work kept with a final rating");
    const answers = text.indexOf("Work in review answers");
    const assists = text.indexOf("Work behind a milestone, and weekly lines");
    expect(kept).toBeGreaterThanOrEqual(0);
    expect(kept).toBeLessThan(answers);
    expect(answers).toBeLessThan(assists);
  });

  it("keeps the assists' switch off the weights and the names too", () => {
    mount();
    const all = screen.getAllByRole("switch", {
      hidden: true,
      name: /Offer the linked tasks beside Confirm/,
    });
    expect(all).toHaveLength(1);
    expect(records()).toContainElement(all[0] as HTMLElement);
  });

  it("asks before the assists are switched on, as the card does", async () => {
    mount();
    await userEvent.click(
      within(records()).getByRole("switch", {
        name: /Offer the linked tasks beside Confirm/,
      }),
    );
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Offer the linked tasks and the weekly-line suggestions?",
    );
    expect(setWorkAssists).not.toHaveBeenCalled();
  });

  it("is not on the weights or the names", async () => {
    mount();
    const switchLabel = /Let people use their own project work/;
    const all = screen.getAllByRole("switch", {
      hidden: true,
      name: switchLabel,
    });
    expect(all).toHaveLength(1);
    expect(records()).toContainElement(all[0] as HTMLElement);
  });

  it("asks before it is switched on, as the card does", async () => {
    mount();
    await userEvent.click(
      within(records()).getByRole("switch", {
        name: /Let people use their own project work/,
      }),
    );
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Let people use their own work in their review answers?",
    );
    expect(setWorkInAnswers).not.toHaveBeenCalled();
  });
});
