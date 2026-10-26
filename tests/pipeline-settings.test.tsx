import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoPipeline } from "@/lib/hiring/pipeline/demo-store";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * The three places a company shapes its hiring: pipeline templates, the reasons
 * people are rejected for, and the tags put on candidates. All in a demo, so the
 * real demo gateway answers.
 *
 * What matters on these pages is that the rules show up beside the thing they are
 * about — a stage that cannot be removed says why, a template that cannot end says
 * so before Save — and that a refusal is the sentence the API would write.
 */

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({
    isConnected: false,
    isLoading: false,
    user: null,
    organization: undefined,
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => true,
  usePermissions: () => ({ can: () => true, loading: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/hiring/settings/pipelines",
  useSearchParams: () => new URLSearchParams(),
}));

const { TemplatesScreen } =
  await import("@/app/(app)/hiring/settings/pipelines/templates-screen");
const { ReasonsScreen } =
  await import("@/app/(app)/hiring/settings/rejection-reasons/reasons-screen");
const { TagsScreen } =
  await import("@/app/(app)/hiring/settings/tags/tags-screen");

beforeEach(() => {
  window.localStorage?.clear?.();
  demoPipeline.reset();
});

/* ------------------------------------------------------------- templates */

describe("pipeline templates", () => {
  it("are listed with their stages in order, and the default is marked", async () => {
    renderInToasts(<TemplatesScreen />);
    expect(await screen.findByText("Standard hiring")).toBeInTheDocument();
    expect(screen.getByText("Default for new roles")).toBeInTheDocument();
    const chain = screen.getByRole("list", { name: "Stages in Quick hire" });
    expect(
      within(chain)
        .getAllByRole("listitem")
        .map((li) => li.textContent?.replace("→", "").trim()),
    ).toEqual(["Applied", "Interview", "Offer", "Hired", "Rejected"]);
  });

  it("say, in a sentence, that a role copies one and later edits do not change it", async () => {
    renderInToasts(<TemplatesScreen />);
    expect(
      await screen.findByText(
        /Roles copy it when they are created, so changing a template later does not change roles that are already open/,
      ),
    ).toBeInTheDocument();
  });

  it("can be made the default, and only one is", async () => {
    const user = userEvent.setup();
    renderInToasts(<TemplatesScreen />);
    await screen.findByText("Quick hire");
    const quick = screen.getByText("Quick hire").closest("li") as HTMLElement;
    await user.click(
      within(quick).getByRole("button", { name: "Make default" }),
    );
    await waitFor(() =>
      expect(
        within(quick).getByText("Default for new roles"),
      ).toBeInTheDocument(),
    );
    expect(screen.getAllByText("Default for new roles")).toHaveLength(1);
  });

  it("can be duplicated", async () => {
    const user = userEvent.setup();
    renderInToasts(<TemplatesScreen />);
    const quick = (await screen.findByText("Quick hire")).closest(
      "li",
    ) as HTMLElement;
    await user.click(within(quick).getByRole("button", { name: "Duplicate" }));
    expect(await screen.findByText("Quick hire copy")).toBeInTheDocument();
  });

  it("will not delete the default, and says why in the API's words", async () => {
    const user = userEvent.setup();
    renderInToasts(<TemplatesScreen />);
    const standard = (await screen.findByText("Standard hiring")).closest(
      "li",
    ) as HTMLElement;
    await user.click(within(standard).getByRole("button", { name: "Delete" }));
    await user.click(
      await screen.findByRole("button", { name: "Delete template" }),
    );
    expect(
      await screen.findByText(
        "This is the default for new roles. Make another template the default first.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Standard hiring")).toBeInTheDocument();
  });

  it("delete a template that is not the default, and say roles are not changed", async () => {
    const user = userEvent.setup();
    renderInToasts(<TemplatesScreen />);
    const quick = (await screen.findByText("Quick hire")).closest(
      "li",
    ) as HTMLElement;
    await user.click(within(quick).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", {
      name: "Delete Quick hire?",
    });
    expect(confirm).toHaveTextContent(
      "Roles already made from it are not changed",
    );
    await user.click(
      within(confirm).getByRole("button", { name: "Delete template" }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Quick hire")).not.toBeInTheDocument(),
    );
  });
});

describe("the template editor", () => {
  async function openNew(user: ReturnType<typeof userEvent.setup>) {
    renderInToasts(<TemplatesScreen />);
    await user.click(
      await screen.findByRole("button", { name: "New template" }),
    );
    return screen.findByRole("dialog", { name: "New pipeline template" });
  }

  it("starts from a sensible pipeline and tells the person what saving does", async () => {
    const user = userEvent.setup();
    const dialog = await openNew(user);
    expect(dialog).toHaveTextContent(
      "Roles copy a template when they are created. Changing it later does not change roles that are already open.",
    );
    const names = within(dialog)
      .getAllByRole("textbox")
      .map((input) => (input as HTMLInputElement).value);
    expect(names).toEqual(["", "Applied", "Interview", "Hired", "Rejected"]);
  });

  it("saves a template, and says which roles will start from it", async () => {
    const user = userEvent.setup();
    const dialog = await openNew(user);
    await user.type(
      within(dialog).getByLabelText(/^Template name/),
      "Campus drive",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save template" }),
    );
    expect(await screen.findByText("Campus drive saved")).toBeInTheDocument();
    expect(
      screen.getByText("Roles made from now on start from it."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Campus drive")).toBeInTheDocument();
  });

  it("will not let the Applied stage be removed, and says why under it", async () => {
    const user = userEvent.setup();
    const dialog = await openNew(user);
    expect(
      within(dialog).getByRole("button", { name: "Remove Applied" }),
    ).toBeDisabled();
    expect(dialog).toHaveTextContent(
      "Cannot be removed: this is the Applied stage, where new applicants land. A pipeline always has one.",
    );
  });

  it("will not remove the only ending, but removes an ordinary stage", async () => {
    const user = userEvent.setup();
    const dialog = await openNew(user);
    await user.click(
      within(dialog).getByRole("button", { name: "Remove Hired" }),
    );
    expect(
      within(dialog).getByRole("button", { name: "Remove Rejected" }),
    ).toBeDisabled();
    await user.click(
      within(dialog).getByRole("button", { name: "Remove Interview" }),
    );
    expect(
      within(dialog).queryByDisplayValue("Interview"),
    ).not.toBeInTheDocument();
  });

  it("puts a stage added in a hurry before the endings, not after Hired", async () => {
    const user = userEvent.setup();
    const dialog = await openNew(user);
    await user.click(
      within(dialog).getByRole("button", { name: "Add a stage" }),
    );
    const names = within(dialog)
      .getAllByRole("textbox")
      .map((input) => (input as HTMLInputElement).value);
    expect(names).toEqual([
      "",
      "Applied",
      "Interview",
      "New stage",
      "Hired",
      "Rejected",
    ]);
  });

  it("reorders with buttons that name the stage, and keeps the endings last", async () => {
    const user = userEvent.setup();
    const dialog = await openNew(user);
    await user.click(
      within(dialog).getByRole("button", { name: "Add a stage" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Move New stage up" }),
    );
    const names = within(dialog)
      .getAllByRole("textbox")
      .map((input) => (input as HTMLInputElement).value);
    expect(names.slice(1, 4)).toEqual(["Applied", "New stage", "Interview"]);
    /* Hired cannot move up into the stages people pass through. */
    expect(
      within(dialog).getByRole("button", { name: "Move Hired up" }),
    ).toBeDisabled();
    /* Nothing goes above Applied. */
    expect(
      within(dialog).getByRole("button", { name: "Move Applied down" }),
    ).toBeDisabled();
  });

  it("flags a repeated name on the stage that repeats it, before Save goes anywhere", async () => {
    const user = userEvent.setup();
    const dialog = await openNew(user);
    await user.type(within(dialog).getByLabelText(/^Template name/), "Repeats");
    await user.click(
      within(dialog).getByRole("button", { name: "Add a stage" }),
    );
    const name = within(dialog).getByDisplayValue("New stage");
    await user.clear(name);
    await user.type(name, "interview");
    await user.click(
      within(dialog).getByRole("button", { name: "Save template" }),
    );
    expect(
      (
        await within(dialog).findAllByText(
          /Another stage already has this name/,
        )
      ).length,
    ).toBeGreaterThan(0);
    /* Nothing was saved. */
    expect(demoPipeline.current().templates.map((t) => t.name)).not.toContain(
      "Repeats",
    );
  });

  it("does not offer a second Applied, Hired or Rejected stage", async () => {
    const user = userEvent.setup();
    const dialog = await openNew(user);
    await user.click(
      within(dialog).getByRole("button", { name: "Add a stage" }),
    );
    const select = within(dialog).getByLabelText(
      "What New stage is for",
    ) as HTMLSelectElement;
    expect([...select.options].map((o) => o.text)).toEqual([
      "Screening",
      "Test",
      "Interview",
      "Offer",
    ]);
  });

  it("only an interview can wait for scorecards, and changing the type drops it", async () => {
    const user = userEvent.setup();
    const dialog = await openNew(user);
    const box = within(dialog).getByRole("checkbox", {
      name: /Needs scorecards before anybody leaves/,
    });
    expect(box).toBeChecked();
    await user.selectOptions(
      within(dialog).getByLabelText("What Interview is for"),
      "Test",
    );
    expect(
      within(dialog).queryByRole("checkbox", {
        name: /Needs scorecards before anybody leaves/,
      }),
    ).not.toBeInTheDocument();
    await user.selectOptions(
      within(dialog).getByLabelText("What Interview is for"),
      "Interview",
    );
    expect(
      within(dialog).getByRole("checkbox", {
        name: /Needs scorecards before anybody leaves/,
      }),
    ).not.toBeChecked();
  });

  it("starts blank each time it opens", async () => {
    const user = userEvent.setup();
    const dialog = await openNew(user);
    await user.type(
      within(dialog).getByLabelText(/^Template name/),
      "Half done",
    );
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await user.click(
      await screen.findByRole("button", { name: "New template" }),
    );
    const again = await screen.findByRole("dialog", {
      name: "New pipeline template",
    });
    expect(within(again).getByLabelText(/^Template name/)).toHaveValue("");
  });

  it("edits an existing template from what it has", async () => {
    const user = userEvent.setup();
    renderInToasts(<TemplatesScreen />);
    const quick = (await screen.findByText("Quick hire")).closest(
      "li",
    ) as HTMLElement;
    await user.click(within(quick).getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Edit Quick hire",
    });
    expect(within(dialog).getByLabelText(/^Template name/)).toHaveValue(
      "Quick hire",
    );
    await user.clear(within(dialog).getByLabelText(/^Template name/));
    await user.type(
      within(dialog).getByLabelText(/^Template name/),
      "Faster hire",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save template" }),
    );
    expect(await screen.findByText("Faster hire saved")).toBeInTheDocument();
  });
});

/* ---------------------------------------------------- rejection reasons */

describe("rejection reasons", () => {
  it("are listed with how many people each was given to", async () => {
    renderInToasts(<ReasonsScreen />);
    expect(
      await screen.findByText("Does not meet the must-haves"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/Given to \d+ (person|people)/).length,
    ).toBeGreaterThan(0);
  });

  it("a new one is added to the list the picker reads", async () => {
    const user = userEvent.setup();
    renderInToasts(<ReasonsScreen />);
    await user.type(
      await screen.findByLabelText("New reason"),
      "Not eligible to work here",
    );
    await user.click(screen.getByRole("button", { name: "Add reason" }));
    expect(
      await screen.findByText("Not eligible to work here"),
    ).toBeInTheDocument();
    expect(demoPipeline.current().reasons.map((r) => r.label)).toContain(
      "Not eligible to work here",
    );
  });

  it("one is renamed in place", async () => {
    const user = userEvent.setup();
    renderInToasts(<ReasonsScreen />);
    await screen.findByText("Cannot start in time");
    await user.click(
      screen.getByRole("button", { name: "Rename Cannot start in time" }),
    );
    const box = screen.getByRole("textbox", {
      name: "Rename Cannot start in time",
    });
    await user.clear(box);
    await user.type(box, "Cannot start by the date we need");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Cannot start by the date we need"),
    ).toBeInTheDocument();
  });

  it("switching one off stops it being offered but keeps it listed", async () => {
    const user = userEvent.setup();
    renderInToasts(<ReasonsScreen />);
    const row = (
      await screen.findByText("Did not attend the interview")
    ).closest("li") as HTMLElement;
    await user.click(within(row).getByRole("switch", { name: "Offered" }));
    await waitFor(() =>
      expect(within(row).getByText("Switched off")).toBeInTheDocument(),
    );
  });

  it("will not switch off the last one that is on", async () => {
    const book = demoPipeline.current();
    demoPipeline.commit({
      ...book,
      reasons: book.reasons.map((r, i) => ({ ...r, active: i === 0 })),
    });
    renderInToasts(<ReasonsScreen />);
    const row = (
      await screen.findByText("Does not meet the must-haves")
    ).closest("li") as HTMLElement;
    expect(within(row).getByRole("switch", { name: "Offered" })).toBeDisabled();
    expect(
      screen.getByText(
        "One reason has to stay on, or nobody could be rejected.",
      ),
    ).toBeInTheDocument();
  });

  it("refuses a repeat in the API's words", async () => {
    const user = userEvent.setup();
    renderInToasts(<ReasonsScreen />);
    await user.type(
      await screen.findByLabelText("New reason"),
      "cannot start in time",
    );
    await user.click(screen.getByRole("button", { name: "Add reason" }));
    expect(
      await screen.findByText('"cannot start in time" is already on the list.'),
    ).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ tags */

describe("tags", () => {
  it("are listed with how many people carry each", async () => {
    renderInToasts(<TagsScreen />);
    expect(await screen.findByText("Strong CV")).toBeInTheDocument();
    expect(
      screen.getAllByText(/On \d+ (person|people)/).length,
    ).toBeGreaterThan(0);
  });

  it("are added, renamed and refused when repeated", async () => {
    const user = userEvent.setup();
    renderInToasts(<TagsScreen />);
    await user.type(await screen.findByLabelText("New tag"), "Boot camp");
    await user.click(screen.getByRole("button", { name: "Add tag" }));
    expect(await screen.findByText("Boot camp")).toBeInTheDocument();

    await user.type(screen.getByLabelText("New tag"), "boot camp");
    await user.click(screen.getByRole("button", { name: "Add tag" }));
    expect(
      await screen.findByText('There is already a tag called "boot camp".'),
    ).toBeInTheDocument();
  });

  it("deleting says how many people it comes off before it does", async () => {
    const user = userEvent.setup();
    renderInToasts(<TagsScreen />);
    await screen.findByText("Strong CV");
    await user.click(screen.getByRole("button", { name: "Delete Strong CV" }));
    const dialog = await screen.findByRole("dialog", {
      name: 'Delete "Strong CV"?',
    });
    expect(dialog).toHaveTextContent(/It comes off \d+ (person|people)\./);
    expect(dialog).toHaveTextContent("Nobody is rejected, moved or changed");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete tag" }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Strong CV")).not.toBeInTheDocument(),
    );
    expect(
      demoPipeline.current().apps.some((a) => a.tagIds.includes("tag-1")),
    ).toBe(false);
  });
});
