import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiCompetency, ApiSection } from "@/lib/api/performance";

/**
 * The sections and subsections dialog lists every subsection by name, to rename,
 * move or archive it. It says how each is answered in front of the name, as By
 * section does, because this is the other place two subsections that read alike sit
 * side by side with nothing to tell them apart.
 */

let sections: ApiSection[];
let competencies: ApiCompetency[];

vi.mock("@/lib/store/performance", () => ({
  useSections: () => ({ sections, loading: false, reload: vi.fn() }),
  useFramework: () => ({
    competencies,
    groups: [],
    loading: false,
    error: null,
    source: "api",
    reload: vi.fn(),
  }),
  useFrameworkActions: () => ({
    editable: true,
    createSection: vi.fn(),
    createCompetency: vi.fn(),
    updateSection: vi.fn(),
    deleteSection: vi.fn(),
    updateCompetency: vi.fn(),
    archiveCompetency: vi.fn(),
    setChoiceOptions: vi.fn(),
  }),
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => true }));

const { SectionsDialog } =
  await import("@/app/(app)/performance/sections-dialog");

const subsection = (over: Partial<ApiCompetency>): ApiCompetency => ({
  id: "c",
  name: "Subsection",
  sectionId: "s-core",
  sectionName: "Core competency",
  description: null,
  isCore: false,
  scaleMax: 5,
  active: true,
  archived: false,
  ratingCount: 0,
  ...over,
});

describe("the subsections in the sections dialog", () => {
  const show = async (list: ApiCompetency[]) => {
    sections = [
      {
        id: "s-core",
        name: "Core competency",
        order: 0,
        competencyCount: list.length,
        component: "CORE_COMPETENCY",
        weightBp: 4000,
      },
    ];
    competencies = list;
    render(<SectionsDialog open onClose={vi.fn()} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Core competency/ }),
    );
  };

  /** The row a subsection is on, found by the button that renames it. */
  const rowOf = (name: string) =>
    screen.getByRole("button", { name: `Rename ${name}` }).closest("li");

  it("puts the word that says how each is answered in front of its name", async () => {
    await show([
      subsection({ id: "c1", name: "Punctuality" }),
      subsection({ id: "c2", name: "Follows safety", answerKind: "BOOLEAN" }),
      subsection({ id: "c3", name: "Customer feedback", answerKind: "CHOICE" }),
    ]);

    for (const [name, word] of [
      ["Punctuality", "Rated"],
      ["Follows safety", "Yes or no"],
      ["Customer feedback", "Pick one"],
    ] as const) {
      const text = rowOf(name)?.textContent ?? "";
      expect(text.indexOf(word), name).toBeGreaterThanOrEqual(0);
      expect(text.indexOf(word), name).toBeLessThan(text.indexOf(name));
    }
  });

  it("tells two subsections with the same name apart", async () => {
    await show([
      subsection({ id: "t1", name: "Teamwork" }),
      subsection({ id: "t2", name: "Teamwork", answerKind: "BOOLEAN" }),
    ]);

    const rows = screen
      .getAllByRole("button", { name: "Rename Teamwork" })
      .map((button) => button.closest("li")?.textContent ?? "");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/^Rated.*Teamwork/);
    expect(rows[1]).toMatch(/^Yes or no.*Teamwork/);
  });

  it("keeps the ratings badge it had, after the name", async () => {
    await show([subsection({ id: "c1", name: "Punctuality", ratingCount: 4 })]);
    const row = rowOf("Punctuality");
    expect(row).not.toBeNull();
    expect(
      within(row as HTMLElement).getByText("4 ratings"),
    ).toBeInTheDocument();
  });
});
