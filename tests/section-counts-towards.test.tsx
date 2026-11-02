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

let sections: ApiSection[];
let createSection: Mock<(...args: unknown[]) => Promise<unknown>>;
let updateSection: Mock<(...args: unknown[]) => Promise<unknown>>;

vi.mock("@/lib/store/performance", () => ({
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

beforeEach(() => {
  sections = [section({})];
  createSection = vi.fn().mockResolvedValue({});
  updateSection = vi.fn().mockResolvedValue({});
});

describe("what a section counts towards", () => {
  it("can be chosen for an existing section, and is sent as the component", async () => {
    show();
    await userEvent.click(
      screen.getByRole("button", { name: /Company values/ }),
    );
    const select = screen.getByLabelText("What Company values counts towards");
    await userEvent.selectOptions(select, "BEHAVIOURAL_COMPETENCY");
    await waitFor(() =>
      expect(updateSection).toHaveBeenCalledWith("s1", {
        component: "BEHAVIOURAL_COMPETENCY",
      }),
    );
  });

  it("clearing it sends null, which is how a section is taken out of the mark", async () => {
    sections = [section({ component: "CORE_COMPETENCY", weightBp: 4000 })];
    show();
    await userEvent.click(
      screen.getByRole("button", { name: /Company values/ }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText("What Company values counts towards"),
      "",
    );
    await waitFor(() =>
      expect(updateSection).toHaveBeenCalledWith("s1", { component: null }),
    );
  });

  it("is offered when a section is created", async () => {
    show();
    await userEvent.click(
      screen.getByRole("button", { name: "Add a section" }),
    );
    await userEvent.type(screen.getByLabelText("New section"), "Our values");
    await userEvent.selectOptions(
      screen.getByLabelText("What the new section counts towards"),
      "LEADERSHIP",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add it" }));
    await waitFor(() =>
      expect(createSection).toHaveBeenCalledWith({
        name: "Our values",
        order: 1,
        component: "LEADERSHIP",
      }),
    );
  });

  it("only offers the parts of the mark that ratings can feed", async () => {
    show();
    await userEvent.click(
      screen.getByRole("button", { name: /Company values/ }),
    );
    const select = screen.getByLabelText("What Company values counts towards");
    const labels = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(labels).toEqual([
      "No part of the mark (ratings are only recorded)",
      "Core competencies",
      "Behavioural competencies",
      "Leadership (managers only)",
    ]);
  });
});
