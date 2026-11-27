import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { ApiCompetency, ApiSection } from "@/lib/api/performance";

/**
 * The framework editor is one flat list, edited where it is read.
 *
 * Every section is a heading with its competencies under it, on screen at once.
 * A pencil renames in place and saves on Enter or on leaving the field; a menu
 * holds the rare acts; an act that cannot be done is not in the menu; and none of
 * the old notices, hints or Save buttons are there.
 */

let sections: ApiSection[];
let competencies: ApiCompetency[];
let editable = true;
let updateSection: Mock<(...args: unknown[]) => Promise<unknown>>;
let deleteSection: Mock<(...args: unknown[]) => Promise<unknown>>;
let createCompetency: Mock<(...args: unknown[]) => Promise<unknown>>;
let updateCompetency: Mock<(...args: unknown[]) => Promise<unknown>>;
let archiveCompetency: Mock<(...args: unknown[]) => Promise<unknown>>;

vi.mock("@/lib/store/performance", () => ({
  useScoringWeights: () => ({ weights: null, loading: true }),
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
    editable,
    createSection: vi.fn().mockResolvedValue({}),
    createCompetency: (...args: unknown[]) => createCompetency(...args),
    updateSection: (...args: unknown[]) => updateSection(...args),
    deleteSection: (...args: unknown[]) => deleteSection(...args),
    updateCompetency: (...args: unknown[]) => updateCompetency(...args),
    archiveCompetency: (...args: unknown[]) => archiveCompetency(...args),
    setChoiceOptions: vi.fn(),
  }),
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => true }));

const { SectionsDialog } =
  await import("@/app/(app)/performance/sections-dialog");

const section = (over: Partial<ApiSection>): ApiSection => ({
  id: "s-core",
  name: "Core competency",
  order: 0,
  competencyCount: 0,
  component: "CORE_COMPETENCY",
  weightBp: 4000,
  ...over,
});

const competency = (over: Partial<ApiCompetency>): ApiCompetency => ({
  id: "c1",
  name: "Punctuality",
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

const show = () =>
  render(
    <ToastProvider>
      <SectionsDialog open onClose={() => {}} />
    </ToastProvider>,
  );

const menu = (name: string) =>
  userEvent.click(
    screen.getByRole("button", { name: `More actions for ${name}` }),
  );

beforeEach(() => {
  editable = true;
  sections = [
    section({}),
    section({
      id: "s-lead",
      name: "Leadership",
      order: 1,
      component: null,
      weightBp: null,
    }),
  ];
  competencies = [
    competency({}),
    competency({
      id: "c2",
      name: "Teamwork",
      sectionId: "s-lead",
      sectionName: "Leadership",
      ratingCount: 3,
    }),
  ];
  updateSection = vi.fn().mockResolvedValue({});
  deleteSection = vi.fn().mockResolvedValue({});
  createCompetency = vi.fn().mockResolvedValue({});
  updateCompetency = vi.fn().mockResolvedValue({});
  archiveCompetency = vi
    .fn()
    .mockResolvedValue({ note: "Its 3 ratings are kept." });
});

describe("the list", () => {
  it("shows every section with its competencies, with nothing to open", () => {
    show();
    expect(
      screen.getByRole("heading", { name: "Core competency" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Leadership" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Punctuality")).toBeVisible();
    expect(screen.getByText("Teamwork")).toBeVisible();
    /* A heading is not a button: there is nothing to open. */
    expect(
      screen.queryByRole("button", { name: /^Core competency/ }),
    ).not.toBeInTheDocument();
  });

  it("says what a section is worth in two words at most, and Not scored for none", () => {
    show();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("Not scored")).toBeInTheDocument();
  });

  it("has none of the old sentences, hints, descriptions or Save buttons", () => {
    const { container } = show();
    const text = container.ownerDocument.body.textContent ?? "";
    for (const gone of [
      "These apply to every appraisal",
      "Open it to rename or move it",
      "Save the name",
      "Save the description",
      "counts towards nothing until",
      "Group name",
      "Description",
    ]) {
      expect(text).not.toContain(gone);
    }
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
  });

  it("uses one noun each, section and competency, and never group or subsection", () => {
    show();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\bgroup\b|subsection/i);
    expect(screen.getByRole("button", { name: "Add a section" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Add a competency to Leadership" }),
    ).toBeVisible();
  });

  it("lists competencies that have no section under No section, with no warning badge", () => {
    competencies = [
      competency({
        id: "c3",
        name: "Adrift",
        sectionId: null,
        sectionName: null,
      }),
    ];
    show();
    expect(screen.getByRole("heading", { name: "No section" })).toBeVisible();
    expect(screen.getByText("Adrift")).toBeVisible();
    expect(
      screen.queryByText(/counts towards no part/),
    ).not.toBeInTheDocument();
  });

  it("shows nothing to change, and says why once, without a connection", () => {
    editable = false;
    show();
    expect(
      screen.queryByRole("button", { name: /Rename|More actions|Add a/ }),
    ).toBeNull();
    expect(
      screen.getByText("Editing needs a connection to the server."),
    ).toBeVisible();
  });
});

describe("renaming with the pencil", () => {
  it("saves on Enter, with no button", async () => {
    show();
    await userEvent.click(
      screen.getByRole("button", { name: "Rename Core competency" }),
    );
    const field = screen.getByRole("textbox", {
      name: "Rename Core competency",
    });
    await userEvent.clear(field);
    await userEvent.type(field, "Core skills{Enter}");
    await waitFor(() =>
      expect(updateSection).toHaveBeenCalledWith("s-core", {
        name: "Core skills",
      }),
    );
    expect(updateSection).toHaveBeenCalledTimes(1);
  });

  it("saves on leaving the field", async () => {
    show();
    await userEvent.click(
      screen.getByRole("button", { name: "Rename Punctuality" }),
    );
    const field = screen.getByRole("textbox", { name: "Rename Punctuality" });
    await userEvent.clear(field);
    await userEvent.type(field, "Timekeeping");
    /* Clicking away from the field is leaving it. */
    await userEvent.click(screen.getByRole("heading", { name: "Leadership" }));
    await waitFor(() =>
      expect(updateCompetency).toHaveBeenCalledWith("c1", {
        name: "Timekeeping",
      }),
    );
  });

  it("puts the old name back on Escape, and does not save", async () => {
    show();
    await userEvent.click(
      screen.getByRole("button", { name: "Rename Core competency" }),
    );
    const field = screen.getByRole("textbox", {
      name: "Rename Core competency",
    });
    await userEvent.type(field, "x{Escape}");
    expect(
      screen.queryByRole("textbox", { name: "Rename Core competency" }),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Core competency" }),
    ).toBeVisible();
    expect(updateSection).not.toHaveBeenCalled();
  });

  it("sends nothing when the name is unchanged", async () => {
    show();
    await userEvent.click(
      screen.getByRole("button", { name: "Rename Core competency" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Rename Core competency" }),
      "{Enter}",
    );
    expect(updateSection).not.toHaveBeenCalled();
  });
});

describe("a section's menu", () => {
  it("holds order, what it counts towards and remove, and leaves out a move that cannot be made", async () => {
    show();
    await menu("Core competency");
    const items = screen.getAllByRole("menuitem").map((one) => one.textContent);
    /* The first section cannot move up: the item is absent, not greyed. */
    expect(items).toEqual(["Move down", "Counts towards", "Remove"]);
  });

  it("has no Move down on the last section", async () => {
    show();
    await menu("Leadership");
    expect(
      screen.getAllByRole("menuitem").map((one) => one.textContent),
    ).toEqual(["Move up", "Counts towards", "Remove"]);
  });

  it("moves a section by renumbering, as it always did", async () => {
    show();
    await menu("Leadership");
    await userEvent.click(screen.getByRole("menuitem", { name: "Move up" }));
    await waitFor(() => expect(updateSection).toHaveBeenCalledTimes(2));
    expect(updateSection).toHaveBeenCalledWith("s-lead", { order: 0 });
    expect(updateSection).toHaveBeenCalledWith("s-core", { order: 1 });
  });

  it("asks one line before removing, and then removes", async () => {
    show();
    await menu("Leadership");
    await userEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    const confirm = screen.getByRole("dialog", { name: "Remove Leadership?" });
    expect(
      within(confirm).getByText(
        "Its competencies and their ratings stay, with no section.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Remove" }),
    );
    await waitFor(() => expect(deleteSection).toHaveBeenCalledWith("s-lead"));
  });
});

describe("a competency", () => {
  it("is added to a section by typing its name and pressing Enter", async () => {
    show();
    await userEvent.click(
      screen.getByRole("button", {
        name: "Add a competency to Core competency",
      }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "New competency" }),
      "Communication{Enter}",
    );
    await waitFor(() =>
      expect(createCompetency).toHaveBeenCalledWith({
        name: "Communication",
        scaleMax: 5,
        sectionId: "s-core",
      }),
    );
  });

  it("is moved to another section from its menu, and that is saved when chosen", async () => {
    show();
    await menu("Punctuality");
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Move to another section" }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Section for Punctuality"),
      "s-lead",
    );
    await waitFor(() =>
      expect(updateCompetency).toHaveBeenCalledWith("c1", {
        sectionId: "s-lead",
      }),
    );
  });

  it("is archived after one line, and the API's sentence about its ratings is kept", async () => {
    show();
    await menu("Teamwork");
    await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    const confirm = screen.getByRole("dialog", { name: "Archive Teamwork?" });
    expect(
      within(confirm).getByText("Its ratings are kept."),
    ).toBeInTheDocument();
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Archive" }),
    );
    await waitFor(() => expect(archiveCompetency).toHaveBeenCalledWith("c2"));
    expect(await screen.findByText("Its 3 ratings are kept.")).toBeVisible();
  });
});
