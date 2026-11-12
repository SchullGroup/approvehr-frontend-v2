import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";

/**
 * The Records tab of Appraisal scoring.
 *
 * Two company decisions about the performance module live on it, and neither reaches a mark: how long
 * the work behind a final rating is kept, and whether people may use their own finished work in their
 * review answers. What is proved here is only that the second is on the tab, under the first, and that
 * it is the page's own tab and not the weights or the names: the cards themselves are held by their own
 * files' tests.
 */

const setWorkInAnswers = vi.fn<(next: boolean) => Promise<object>>(
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
    flags: { projects: true },
    editable: true,
    loading: false,
    saving: null,
    error: null,
    setOverallMark: vi.fn(),
    setWorkEvidenceMonths: vi.fn(),
    setWorkInAnswers,
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

  it("puts the new switch under the retention setting, never above it", () => {
    mount();
    const text = records().textContent ?? "";
    expect(text.indexOf("Work kept with a final rating")).toBeLessThan(
      text.indexOf("Work in review answers"),
    );
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
