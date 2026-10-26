import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Catalogue } from "@/lib/api/permissions";
import type { RoleView } from "@/lib/store/permissions";

/**
 * Settings, Roles keeps the editor mounted all the time (the drawer has to see
 * `open` go false to run its exit animation), so its first render has no role.
 * The fields used to take their starting values from that render and never
 * again: every role opened with a blank Name and nothing ticked. A custom role
 * could not be saved until its name was retyped, and ticking one box on a
 * built-in role and saving would have replaced all of its permissions with that
 * one box.
 *
 * The matrix is stood in for by a list of what the editor hands it as ticked:
 * what is under test is what the editor seeds, not how the grid draws it.
 */

vi.mock("@/app/(app)/settings/roles/permission-matrix", () => ({
  PermissionMatrix: ({
    draft,
    setDraft,
  }: {
    draft: string[];
    setDraft: (next: string[]) => void;
  }) => (
    <div>
      <p data-testid="ticked">{draft.join(",")}</p>
      <button type="button" onClick={() => setDraft([...draft, "VIEW_AUDIT"])}>
        Tick audit
      </button>
    </div>
  ),
}));

const { RoleEditor } = await import("@/app/(app)/settings/roles/role-editor");

const catalogue = {
  matrix: [],
  sections: [],
  permissions: [],
  separationOfDuties: [],
} as unknown as Catalogue;

const role = (over: Partial<RoleView> = {}): RoleView => ({
  id: "role-payroll",
  name: "Payroll officer",
  description: "Runs the monthly payroll",
  permissions: ["RUN_PAYROLL", "VIEW_SALARIES"],
  labels: ["Run payroll", "See salaries"],
  isSystem: false,
  memberCount: 2,
  warnings: [],
  createdAt: "2026-01-01T00:00:00Z",
  ...over,
});

const noop = () => {};

function editor(props: {
  role: RoleView | null;
  open: boolean;
  onSave?: (patch: Record<string, unknown>) => Promise<boolean>;
}) {
  return (
    <RoleEditor
      role={props.role}
      open={props.open}
      catalogue={catalogue}
      held={new Set(["RUN_PAYROLL", "VIEW_SALARIES", "VIEW_AUDIT"]) as never}
      canManage
      roleIds={[]}
      onClose={noop}
      onSave={props.onSave ?? (() => Promise.resolve(true))}
      onDuplicate={noop}
      onAddPeople={() => Promise.resolve(true)}
      onRemovePerson={() => Promise.resolve(true)}
    />
  );
}

const nameField = () => screen.getByLabelText(/^Name/) as HTMLInputElement;
const ticked = () => screen.getByTestId("ticked").textContent;

describe("the role editor, mounted before any role is chosen", () => {
  it("shows the role's own name and permissions once one is opened", () => {
    const { rerender } = render(editor({ role: null, open: false }));
    rerender(editor({ role: role(), open: true }));

    expect(nameField().value).toBe("Payroll officer");
    expect(ticked()).toBe("RUN_PAYROLL,VIEW_SALARIES");
  });

  it("does the same for a built-in role, whose name is fixed", () => {
    const { rerender } = render(editor({ role: null, open: false }));
    rerender(
      editor({
        role: role({ name: "HR manager", isSystem: true }),
        open: true,
      }),
    );

    expect(nameField().value).toBe("HR manager");
    expect(nameField().disabled).toBe(true);
    expect(ticked()).toBe("RUN_PAYROLL,VIEW_SALARIES");
  });

  it("does not offer Save until something has actually changed", () => {
    const { rerender } = render(editor({ role: null, open: false }));
    rerender(editor({ role: role(), open: true }));

    expect(screen.getByText("No changes")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Save changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("saves one ticked box as an addition, not as the whole set", async () => {
    const onSave = vi.fn(() => Promise.resolve(true));
    const user = userEvent.setup();
    const { rerender } = render(editor({ role: null, open: false, onSave }));
    rerender(editor({ role: role(), open: true, onSave }));

    await user.click(screen.getByRole("button", { name: "Tick audit" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledWith({
      permissions: ["RUN_PAYROLL", "VIEW_SALARIES", "VIEW_AUDIT"],
    });
  });

  it("starts the next role from that role, and a reopened one from what is saved", async () => {
    const user = userEvent.setup();
    const { rerender } = render(editor({ role: null, open: false }));
    rerender(editor({ role: role(), open: true }));
    await user.type(nameField(), " (draft)");
    await user.click(screen.getByRole("button", { name: "Tick audit" }));
    expect(nameField().value).toBe("Payroll officer (draft)");

    /* Cancelled: the parent clears the role and closes the drawer. */
    rerender(editor({ role: null, open: false }));
    /* Opened again: nothing typed in the cancelled session comes back. */
    rerender(editor({ role: role(), open: true }));
    expect(nameField().value).toBe("Payroll officer");
    expect(ticked()).toBe("RUN_PAYROLL,VIEW_SALARIES");

    /* A different role is not seeded from the last one. */
    rerender(
      editor({
        role: role({
          id: "role-finance",
          name: "Finance approver",
          permissions: ["APPROVE_PAYROLL"],
        }),
        open: true,
      }),
    );
    expect(nameField().value).toBe("Finance approver");
    expect(ticked()).toBe("APPROVE_PAYROLL");
  });

  it("keeps what is being typed when the list refreshes underneath an open role", async () => {
    const user = userEvent.setup();
    const { rerender } = render(editor({ role: null, open: false }));
    rerender(editor({ role: role(), open: true }));
    await user.type(nameField(), " Lead");

    /* The roles list reloads on window focus: same role, new object. */
    rerender(editor({ role: role(), open: true }));

    expect(nameField().value).toBe("Payroll officer Lead");
  });

  it("is right on the first render when it is mounted with a role already open", () => {
    render(editor({ role: role(), open: true }));

    expect(nameField().value).toBe("Payroll officer");
    expect(ticked()).toBe("RUN_PAYROLL,VIEW_SALARIES");
  });
});
