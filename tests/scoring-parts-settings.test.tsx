import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { ApiScoringParts, ScoreComponent } from "@/lib/api/performance";

/**
 * Settings → Appraisal scoring, the parts of a mark.
 *
 * The company writes its own parts: a name, what it is scored from, a weight
 * and a description. Saved parts are plain rows with an edit and a delete
 * icon, never open boxes. A company with no parts sees an empty list and a way
 * to add the first. Each source backs one part, so a used one is not offered.
 */

const SOURCES: { source: ScoreComponent; label: string }[] = [
  { source: "OBJECTIVES", label: "Delivery against objectives" },
  { source: "TASKS", label: "Weekly tasks" },
  { source: "CORE_COMPETENCY", label: "Core competencies" },
  { source: "BEHAVIOURAL_COMPETENCY", label: "Behavioural competencies" },
  { source: "LEADERSHIP", label: "Leadership" },
  { source: "SELF_ASSESSMENT", label: "Self-assessment" },
];

const viewOf = (
  parts: {
    id: string;
    source: ScoreComponent;
    name: string;
    weightBp: number;
  }[],
): ApiScoringParts => {
  const totalBp = parts.reduce((sum, part) => sum + part.weightBp, 0);
  return {
    parts: parts.map((part) => ({
      ...part,
      sourceLabel: SOURCES.find((s) => s.source === part.source)!.label,
      description: null,
      shareBp:
        totalBp === 0 ? 0 : Math.round((part.weightBp * 10000) / totalBp),
    })),
    totalBp,
    sources: SOURCES.map((s) => ({
      ...s,
      description: `About ${s.label}`,
      usedBy: parts.find((part) => part.source === s.source)?.id ?? null,
    })),
    selfAssessmentNote: "THE API'S NOTE",
  };
};

let view: ApiScoringParts = viewOf([]);
let canManage = true;
const add = vi.fn();
const update = vi.fn();
const remove = vi.fn();

vi.mock("@/lib/permissions", () => ({ useCan: () => canManage }));
vi.mock("@/lib/demo", () => ({ sourceNote: () => null }));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/lib/store/performance", async (original) => ({
  ...(await original<typeof import("@/lib/store/performance")>()),
  useScoringParts: () => ({
    parts: view,
    loading: false,
    error: null,
    source: "api",
    editable: true,
    refusal: "",
    add,
    update,
    remove,
    reload: vi.fn(),
  }),
}));
vi.mock("@/lib/store/features", async (original) => ({
  ...(await original<typeof import("@/lib/store/features")>()),
  useFeatureSettings: () => ({
    overallMark: false,
    editable: true,
    loading: false,
    saving: null,
    error: null,
    setOverallMark: vi.fn(),
  }),
}));

import { ScoringWeightsForm } from "@/app/(app)/settings/performance/weights-form";

const mount = () =>
  render(
    <ToastProvider>
      <ScoringWeightsForm scale={null} />
    </ToastProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  canManage = true;
  view = viewOf([]);
  add.mockResolvedValue({});
  update.mockResolvedValue({});
  remove.mockResolvedValue(undefined);
  window.history.replaceState(null, "", "/settings/performance");
});

describe("a company with no parts", () => {
  it("shows an empty list and a way to add the first part, and no built-in parts", () => {
    mount();
    expect(screen.getByText("No parts yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add the first part" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Delivery against objectives")).toBeNull();
    /* No open boxes on the page until somebody chooses to add or edit. */
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("adds a part with its own name, source, weight and description", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      screen.getByRole("button", { name: "Add the first part" }),
    );

    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Customer focus");
    await user.selectOptions(
      within(dialog).getByLabelText("Scored from"),
      "CORE_COMPETENCY",
    );
    await user.type(within(dialog).getByLabelText("Weight"), "30");
    await user.type(
      within(dialog).getByLabelText(/Description/),
      "How they treat the people we serve.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Add part" }));

    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(add).toHaveBeenCalledWith({
      name: "Customer focus",
      source: "CORE_COMPETENCY",
      weightBp: 3000,
      description: "How they treat the people we serve.",
    });
  });

  it("will not add a part with no name", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      screen.getByRole("button", { name: "Add the first part" }),
    );
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Weight"), "30");
    expect(
      within(dialog).getByRole("button", { name: "Add part" }),
    ).toBeDisabled();
  });
});

describe("a company with parts", () => {
  beforeEach(() => {
    view = viewOf([
      { id: "p-1", source: "OBJECTIVES", name: "Delivery", weightBp: 6000 },
      {
        id: "p-2",
        source: "LEADERSHIP",
        name: "Leading people",
        weightBp: 4000,
      },
    ]);
  });

  it("lists each part as a row with its source, weight and share, and edit and delete icons", () => {
    mount();
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    expect(
      screen.getByText("Scored from Delivery against objectives"),
    ).toBeInTheDocument();
    expect(screen.getByText("60% of a mark")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit Delivery" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete Leading people" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("does not offer a source another part already uses", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Add part" }));
    const options = within(
      within(screen.getByRole("dialog")).getByLabelText("Scored from"),
    )
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);
    expect(options).not.toContain("OBJECTIVES");
    expect(options).not.toContain("LEADERSHIP");
    expect(options).toContain("TASKS");
  });

  it("edits a part, offering its own source back", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Edit Delivery" }));
    const dialog = screen.getByRole("dialog");
    const name = within(dialog).getByLabelText("Name");
    expect(name).toHaveValue("Delivery");
    await user.clear(name);
    await user.type(name, "Results");
    const weight = within(dialog).getByLabelText("Weight");
    await user.clear(weight);
    await user.type(weight, "55");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith("p-1", {
      name: "Results",
      source: "OBJECTIVES",
      weightBp: 5500,
      description: null,
    });
  });

  it("deletes a part after asking", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      screen.getByRole("button", { name: "Delete Leading people" }),
    );
    expect(screen.getByText("Delete Leading people?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete the part" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("p-2"));
  });

  it("shows the parts without edit or delete to somebody who cannot change settings", () => {
    canManage = false;
    mount();
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Delivery" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add part" })).toBeNull();
  });
});
