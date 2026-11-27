import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";

/**
 * The Records tab of Appraisal scoring.
 *
 * Three company decisions about the performance module live on it, and none reaches a mark: how long
 * the work behind a final rating is kept, whether people may use their own finished work in their
 * review answers, and whether the linked tasks are offered beside Confirm. They are one card, a field
 * and two switches with no headings. What is proved here is that each is on the tab, in that order,
 * that the two that need Projects are not drawn without it, and that they are the page's own tab and
 * not the weights or the names: the sections themselves are held by their own files' tests.
 */

const setWorkInAnswers = vi.fn<(next: boolean) => Promise<object>>(
  async () => ({}),
);
const setWorkAssists = vi.fn<(next: boolean) => Promise<object>>(
  async () => ({}),
);
let projectsOn = true;

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
  /* The form reads whether it is connected from the parts, so they are mocked too: an empty
     company is enough, since this file is about the Records tab and not the parts. */
  useScoringParts: () => ({
    parts: { parts: [], totalBp: 0, sources: [], selfAssessmentNote: "" },
    loading: false,
    error: null,
    source: "api",
    editable: true,
    refusal: "",
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    reload: vi.fn(),
  }),
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
    flags: { projects: projectsOn },
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
  projectsOn = true;
  window.history.replaceState(null, "", "/settings/performance?tab=records");
});

describe("the Records tab", () => {
  it("is one card: a field and two switches, with no heading", () => {
    mount();
    const tab = within(records());
    expect(
      tab.getByRole("textbox", { name: /Months to keep/ }),
    ).toBeInTheDocument();
    expect(
      tab.getByRole("switch", {
        name: /Let people add their finished work/,
      }),
    ).not.toBeChecked();
    expect(
      tab.getByRole("switch", {
        name: /Show linked tasks next to Confirm/,
      }),
    ).not.toBeChecked();
    expect(tab.queryByRole("heading")).toBeNull();
    for (const gone of [
      "Work kept with a final rating",
      "Work in review answers",
      "Task suggestions",
      "It never changes a score.",
    ]) {
      expect(tab.queryByText(gone)).toBeNull();
    }
  });

  it("puts how long work is kept first, then work in answers, then the linked tasks", () => {
    mount();
    const order = [
      within(records()).getByRole("textbox", { name: /Months to keep/ }),
      within(records()).getByRole("switch", {
        name: /Let people add their finished work/,
      }),
      within(records()).getByRole("switch", {
        name: /Show linked tasks next to Confirm/,
      }),
    ];
    for (let at = 0; at < order.length - 1; at += 1) {
      expect(
        order[at]!.compareDocumentPosition(order[at + 1]!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("keeps the months field and drops both switches when Projects is off, with no line about it", () => {
    projectsOn = false;
    mount();
    const tab = within(records());
    expect(
      tab.getByRole("textbox", { name: /Months to keep/ }),
    ).toBeInTheDocument();
    expect(tab.queryAllByRole("switch")).toHaveLength(0);
    expect(tab.queryByText(/Needs Projects/)).toBeNull();
  });

  it("keeps the assists' switch off the weights and the names too", () => {
    mount();
    const all = screen.getAllByRole("switch", {
      hidden: true,
      name: /Show linked tasks next to Confirm/,
    });
    expect(all).toHaveLength(1);
    expect(records()).toContainElement(all[0] as HTMLElement);
  });

  it("asks before the assists are switched on, as the section does", async () => {
    mount();
    await userEvent.click(
      within(records()).getByRole("switch", {
        name: /Show linked tasks next to Confirm/,
      }),
    );
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Switch on task suggestions?",
    );
    expect(setWorkAssists).not.toHaveBeenCalled();
  });

  it("is not on the weights or the names", async () => {
    mount();
    const switchLabel = /Let people add their finished work/;
    const all = screen.getAllByRole("switch", {
      hidden: true,
      name: switchLabel,
    });
    expect(all).toHaveLength(1);
    expect(records()).toContainElement(all[0] as HTMLElement);
  });

  it("asks before it is switched on, as the section does", async () => {
    mount();
    await userEvent.click(
      within(records()).getByRole("switch", {
        name: /Let people add their finished work/,
      }),
    );
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Let people add their work to review answers?",
    );
    expect(setWorkInAnswers).not.toHaveBeenCalled();
  });
});
