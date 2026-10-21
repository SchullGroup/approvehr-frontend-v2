import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StageEditor } from "@/app/(app)/hiring/requisitions/[id]/stage-editor";
import type { ApiStage } from "@/lib/api/recruitment";

/**
 * One role's own stages, with one menu per stage where there were four icon buttons.
 *
 * The rules are the shared editor's, unchanged: the Applied stage is first and stays,
 * an ending stays last, and who is in a stage is the API's to say. What this pins is
 * that moving them into a menu lost none of it, in particular that a refused action
 * is still listed with its reason instead of vanishing.
 */

const stage = (
  id: string,
  name: string,
  order: number,
  type: ApiStage["type"],
  over: Partial<ApiStage & { currentCount: number }> = {},
): ApiStage & { currentCount: number } => ({
  id,
  requisitionId: "req-1",
  name,
  order,
  requiresScorecards: false,
  currentCount: 0,
  ...(type ? { type } : {}),
  ...over,
});

const typed = () => [
  stage("a", "Applied", 0, "APPLIED", { currentCount: 12 }),
  stage("i", "Interview", 1, "INTERVIEW", { requiresScorecards: true }),
  stage("h", "Hired", 2, "HIRED"),
  stage("r", "Rejected", 3, "REJECTED"),
];

const props = () => ({
  canManage: true,
  busy: false,
  onAdd: vi.fn().mockResolvedValue(true),
  onUpdate: vi.fn().mockResolvedValue(true),
  onMove: vi.fn().mockResolvedValue(undefined),
  onRemove: vi.fn().mockResolvedValue(undefined),
});

const menuOf = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) => {
  await user.click(screen.getByRole("button", { name: `Actions for ${name}` }));
  return screen.getByRole("menu", { name: `Actions for ${name}` });
};

describe("the stages of a role", () => {
  it("show what each is for, and that the role owns them", () => {
    render(<StageEditor stages={typed()} {...props()} />);
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(
      within(rows[1] as HTMLElement).getByText("Needs scorecards to leave"),
    ).toBeInTheDocument();
    expect(
      within(rows[0] as HTMLElement).getByText("12 people here"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Changing the company's templates does not change them/),
    ).toBeInTheDocument();
  });

  it("has one menu per stage and no icon-only buttons left on the row", () => {
    render(<StageEditor stages={typed()} {...props()} />);
    expect(
      screen.getAllByRole("button", { name: /^Actions for / }),
    ).toHaveLength(4);
    expect(
      screen.queryByRole("button", { name: /^(Move|Edit|Remove) / }),
    ).not.toBeInTheDocument();
  });

  it("cannot lose the Applied stage, and says why in the menu and under the row", async () => {
    const user = userEvent.setup();
    render(<StageEditor stages={typed()} {...props()} />);
    const menu = await menuOf(user, "Applied");
    const remove = within(menu).getByRole("menuitem", { name: /Remove stage/ });
    expect(remove).toHaveAttribute("aria-disabled", "true");
    expect(
      within(menu).getByText(
        /this is the Applied stage, where new applicants land/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Cannot be removed: this is the Applied stage, where new applicants land/,
      ),
    ).toBeInTheDocument();
  });

  it("does not move the Applied stage, or let an ending up into the middle", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<StageEditor stages={typed()} {...p} />);

    for (const [stageName, item] of [
      ["Applied", "Move down"],
      ["Interview", "Move up"],
      ["Hired", "Move up"],
    ] as const) {
      const menu = await menuOf(user, stageName);
      const row = within(menu).getByRole("menuitem", {
        name: new RegExp(item),
      });
      expect(row).toHaveAttribute("aria-disabled", "true");
      await user.click(row);
      await user.keyboard("{Escape}");
    }
    expect(p.onMove).not.toHaveBeenCalled();
  });

  it("leaves 'is anybody in it' to the API: an occupied stage can still be asked to go", async () => {
    const user = userEvent.setup();
    const p = props();
    render(
      <StageEditor
        stages={[
          ...typed().slice(0, 1),
          stage("s", "Phone chat", 1, "SCREENING", { currentCount: 4 }),
          ...typed()
            .slice(1)
            .map((s, i) => ({ ...s, order: i + 2 })),
        ]}
        {...p}
      />,
    );
    const menu = await menuOf(user, "Phone chat");
    const remove = within(menu).getByRole("menuitem", { name: /Remove stage/ });
    expect(remove).not.toHaveAttribute("aria-disabled");
    await user.click(remove);
    expect(p.onRemove).toHaveBeenCalledWith(
      expect.objectContaining({ id: "s" }),
    );
  });

  it("moves a middle stage by one place through its menu", async () => {
    const user = userEvent.setup();
    const p = props();
    render(
      <StageEditor
        stages={[
          ...typed().slice(0, 1),
          stage("s", "Phone chat", 1, "SCREENING"),
          stage("t", "Take-home", 2, "TEST"),
          ...typed()
            .slice(1)
            .map((s, i) => ({ ...s, order: i + 3 })),
        ]}
        {...p}
      />,
    );
    const menu = await menuOf(user, "Phone chat");
    await user.click(within(menu).getByRole("menuitem", { name: "Move down" }));
    expect(p.onMove).toHaveBeenCalledWith("s", 1);
  });

  it("add a stage with a type, and only an interview offers scorecards", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<StageEditor stages={typed()} {...p} />);
    await user.click(screen.getByRole("button", { name: "Add stage" }));
    await user.type(screen.getByLabelText("Stage name"), "Case study");
    const type = screen.getByLabelText("What it is for") as HTMLSelectElement;
    expect([...type.options].map((o) => o.text)).toEqual([
      "Screening",
      "Test",
      "Interview",
      "Offer",
    ]);
    expect(
      screen.queryByRole("checkbox", { name: /Requires scorecards/ }),
    ).not.toBeInTheDocument();
    await user.selectOptions(type, "Test");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(p.onAdd).toHaveBeenCalledWith({
      name: "Case study",
      type: "TEST",
      requiresScorecards: false,
    });
  });

  it("change a stage's type and name together, sending only what changed", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<StageEditor stages={typed()} {...p} />);
    const menu = await menuOf(user, "Interview");
    await user.click(
      within(menu).getByRole("menuitem", { name: "Edit stage" }),
    );
    await user.selectOptions(
      screen.getByLabelText("What Interview is for"),
      "Test",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(p.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "i" }),
      {
        type: "TEST",
        requiresScorecards: false,
      },
    );
  });

  it("a role made before stage types shows no type and sends none", async () => {
    const user = userEvent.setup();
    const p = props();
    render(
      <StageEditor
        stages={[
          stage("x", "Sourcing", 0, undefined),
          stage("y", "Offer", 1, undefined),
        ]}
        {...p}
      />,
    );
    const menu = await menuOf(user, "Sourcing");
    await user.click(
      within(menu).getByRole("menuitem", { name: "Edit stage" }),
    );
    expect(
      screen.queryByLabelText("What Sourcing is for"),
    ).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Rename Sourcing"));
    await user.type(screen.getByLabelText("Rename Sourcing"), "Applications");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(p.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "x" }),
      {
        name: "Applications",
      },
    );
  });

  it("offers nothing to change to somebody who cannot manage hiring", () => {
    render(<StageEditor stages={typed()} {...props()} canManage={false} />);
    expect(
      screen.queryByRole("button", { name: /Actions for|Add stage/ }),
    ).not.toBeInTheDocument();
  });
});
