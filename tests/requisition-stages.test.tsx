import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RequisitionStages } from "@/components/hiring/requisition-stages";
import type { ApiStage } from "@/lib/api/recruitment";

/**
 * One role's own stages, with what each is for.
 *
 * The type-based rules show where they bite — the Applied stage cannot be removed
 * or moved, an ending stays last — and anything that depends on who is in a stage
 * is left to the API, which is why Remove is not disabled for an occupied one.
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

describe("the stages of a role", () => {
  it("show what each is for, and that the role owns them", () => {
    render(<RequisitionStages stages={typed()} {...props()} />);
    const list = screen.getByRole("list");
    const rows = within(list).getAllByRole("listitem");
    expect(
      within(rows[0] as HTMLElement).getByText("Applied", {
        selector: "span.inline-flex",
      }),
    ).toBeInTheDocument();
    expect(
      within(rows[1] as HTMLElement).getByText("Interview", {
        selector: "span.inline-flex",
      }),
    ).toBeInTheDocument();
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

  it("cannot lose the Applied stage, and says why", () => {
    render(<RequisitionStages stages={typed()} {...props()} />);
    expect(
      screen.getByRole("button", { name: "Remove Applied" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        /Cannot be removed: this is the Applied stage, where new applicants land/,
      ),
    ).toBeInTheDocument();
  });

  it("does not move the Applied stage, or let an ending up into the middle", () => {
    render(<RequisitionStages stages={typed()} {...props()} />);
    expect(
      screen.getByRole("button", { name: "Move Applied down" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move Interview up" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move Hired up" }),
    ).toBeDisabled();
  });

  it("leaves 'is anybody in it' to the API: an occupied stage can still be asked to go", async () => {
    const user = userEvent.setup();
    const p = props();
    render(
      <RequisitionStages
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
    const remove = screen.getByRole("button", { name: "Remove Phone chat" });
    expect(remove).toBeEnabled();
    await user.click(remove);
    expect(p.onRemove).toHaveBeenCalledWith(
      expect.objectContaining({ id: "s" }),
    );
  });

  it("add a stage with a type, and only an interview offers scorecards", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<RequisitionStages stages={typed()} {...p} />);
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
    render(<RequisitionStages stages={typed()} {...p} />);
    await user.click(screen.getByRole("button", { name: "Edit Interview" }));
    await user.selectOptions(
      screen.getByLabelText("What Interview is for"),
      "Test",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(p.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "i" }),
      { type: "TEST", requiresScorecards: false },
    );
  });

  it("a role made before stage types shows no type and sends none", async () => {
    const user = userEvent.setup();
    const p = props();
    render(
      <RequisitionStages
        stages={[
          stage("x", "Sourcing", 0, undefined),
          stage("y", "Offer", 1, undefined),
        ]}
        {...p}
      />,
    );
    expect(
      screen.queryByTitle(/Where a new applicant lands/),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit Sourcing" }));
    expect(
      screen.queryByLabelText("What Sourcing is for"),
    ).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Rename Sourcing"));
    await user.type(screen.getByLabelText("Rename Sourcing"), "Applications");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(p.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "x" }),
      { name: "Applications" },
    );
  });

  it("offers nothing to change to somebody who cannot manage hiring", () => {
    render(
      <RequisitionStages stages={typed()} {...props()} canManage={false} />,
    );
    expect(
      screen.queryByRole("button", { name: /Remove|Edit|Add stage|Move/ }),
    ).not.toBeInTheDocument();
  });
});
