import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { ApiSection } from "@/lib/api/performance";

/**
 * Telling a section which part of the mark it feeds.
 *
 * QA: sections the company creates are never counted. The cause was that
 * nothing in the product could set a section's component, so every section
 * invented in this dialog stayed outside the mark with a note saying it would
 * count "once weighted", and no control to weight it.
 */

const section = (over: Partial<ApiSection>): ApiSection => ({
  id: "s1",
  name: "Company values",
  order: 0,
  competencyCount: 0,
  component: null,
  weightBp: null,
  ...over,
});

/* What Settings holds: two parts the company named itself, and Leadership,
   which it has no part for. */
const scoringRow = (component: string, label: string, isPart: boolean) => ({
  component,
  label,
  weightBp: isPart ? 5000 : 0,
  isPart,
});
const SETTINGS = [
  scoringRow("OBJECTIVES", "Delivery against objectives", false),
  scoringRow("TASKS", "C", true),
  scoringRow("CORE_COMPETENCY", "A", true),
  scoringRow("BEHAVIOURAL_COMPETENCY", "Our values", true),
  scoringRow("LEADERSHIP", "Leadership", false),
  scoringRow("SELF_ASSESSMENT", "How I did", true),
];
let scoringRows = SETTINGS;

let sections: ApiSection[];
let createSection: Mock<(...args: unknown[]) => Promise<unknown>>;
let updateSection: Mock<(...args: unknown[]) => Promise<unknown>>;

vi.mock("@/lib/store/performance", () => ({
  useScoringWeights: () => ({
    weights: { source: "saved", rows: scoringRows, totalBp: 10000 },
    loading: false,
  }),
  useSections: () => ({ sections, loading: false, reload: vi.fn() }),
  useFramework: () => ({ competencies: [], loading: false, reload: vi.fn() }),
  useFrameworkActions: () => ({
    editable: true,
    createSection: (...args: unknown[]) => createSection(...args),
    updateSection: (...args: unknown[]) => updateSection(...args),
    createCompetency: vi.fn(),
    updateCompetency: vi.fn(),
    archiveCompetency: vi.fn(),
    deleteSection: vi.fn(),
  }),
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => true }));

const { SectionsDialog } =
  await import("@/app/(app)/performance/sections-dialog");

const show = () =>
  render(
    <ToastProvider>
      <SectionsDialog open onClose={() => {}} />
    </ToastProvider>,
  );

/** The select in the small dialog a section's menu opens: Counts towards. */
const openCounts = async (name = "Company values") => {
  await userEvent.click(
    screen.getByRole("button", { name: `More actions for ${name}` }),
  );
  await userEvent.click(
    screen.getByRole("menuitem", { name: "Counts towards" }),
  );
  return screen.getByLabelText(`What ${name} counts towards`);
};

beforeEach(() => {
  scoringRows = SETTINGS;
  sections = [section({})];
  createSection = vi.fn().mockResolvedValue({});
  updateSection = vi.fn().mockResolvedValue({});
});

describe("what a section counts towards", () => {
  it("can be chosen for an existing section, and is sent as the component", async () => {
    show();
    const select = await openCounts();
    await userEvent.selectOptions(select, "BEHAVIOURAL_COMPETENCY");
    await waitFor(() =>
      expect(updateSection).toHaveBeenCalledWith("s1", {
        component: "BEHAVIOURAL_COMPETENCY",
      }),
    );
  });

  it("clearing it sends null, which is how a section is taken out of the score", async () => {
    sections = [section({ component: "CORE_COMPETENCY", weightBp: 4000 })];
    show();
    const select = await openCounts();
    await userEvent.selectOptions(select, "");
    await waitFor(() =>
      expect(updateSection).toHaveBeenCalledWith("s1", { component: null }),
    );
  });

  it("is not asked when a section is created: it starts unscored, and its row says so", async () => {
    show();
    await userEvent.click(
      screen.getByRole("button", { name: "Add a section" }),
    );
    await userEvent.type(
      screen.getByLabelText("New section"),
      "Our values{Enter}",
    );
    await waitFor(() =>
      expect(createSection).toHaveBeenCalledWith({
        name: "Our values",
        order: 1,
      }),
    );
    expect(screen.queryByLabelText(/counts towards/i)).not.toBeInTheDocument();
  });

  it("lists the company's parts that ratings can feed, by their names in Settings, and not the ones they cannot", async () => {
    show();
    const select = await openCounts();
    const labels = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);
    /* Tasks done is scored from tasks, so it is absent, not greyed with a
       sentence. */
    expect(labels).toEqual(["Not scored", "A", "Our values", "How I did"]);
    for (const option of within(select).getAllByRole("option")) {
      expect(option).toBeEnabled();
    }
  });

  it("reads Not scored for a section that feeds a source the company has no part for", async () => {
    sections = [section({ component: "LEADERSHIP", weightBp: null })];
    show();
    expect(screen.getByText("Not scored")).toBeInTheDocument();
    const select = await openCounts();
    expect(select).toHaveValue("");
    expect(
      within(select).queryByText(/not one of your scoring parts/i),
    ).not.toBeInTheDocument();
  });

  it("offers only Not scored when Settings has no part ratings can feed", async () => {
    scoringRows = scoringRows.map((row) => ({
      ...row,
      isPart: row.component === "TASKS",
    }));
    show();
    const select = await openCounts();
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Not scored"]);
  });
});
