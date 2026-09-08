import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccessRoleCell } from "@/components/people/access-role-cell";

/**
 * Absent is not empty, asserted on the cell that renders it.
 *
 * The rule this repo states in a dozen places and enforces in very few:
 *
 * > Permission-gated and feature-gated data arrives ABSENT, not zeroed. Check
 * > presence, never falsiness.
 *
 * The directory's role column is the newest place it lands, and the failure
 * mode is specific and quiet: `rolesFor` returns `null` when the company's
 * roles could not be read, and a cell that rendered that as **"No role"** would
 * tell an auditor that everybody in the company holds no access — on the
 * strength of one failed request. Every type in the codebase is satisfied by
 * that bug. `EmployeeRoleEntry[] | null` is satisfied by `null`, and "No role"
 * is a perfectly well-typed string.
 *
 * So the assertions below are mostly about what must **not** appear. A test
 * that only checked the happy path would pass against the defect.
 */

const ROLE = { id: "role-admin", name: "Administrator" };
const SECOND = { id: "role-hr", name: "HR manager" };

describe("when the roles could not be read", () => {
  it("renders an absence, and never claims they hold no role", () => {
    render(<AccessRoleCell roles={null} canLogin={true} />);

    expect(screen.getByText("—")).toBeTruthy();
    /* The whole point of the file. */
    expect(screen.queryByText("No role")).toBeNull();
    expect(screen.queryByText("No login")).toBeNull();
  });

  it("says it is unknown rather than empty, so a column of dashes is legible", () => {
    render(<AccessRoleCell roles={null} canLogin={true} />);

    expect(screen.getByTitle(/could not be read/i)).toBeTruthy();
    expect(
      screen.getByTitle(/not an account that holds no role/i),
    ).toBeTruthy();
  });

  it("distinguishes still-loading from a failed read", () => {
    render(<AccessRoleCell roles={null} canLogin={true} loading />);

    expect(screen.getByTitle("Still loading")).toBeTruthy();
    /* Telling somebody a read failed while it is still in flight is its own
       wrong claim, and the one a single "unknown" state would produce. */
    expect(screen.queryByTitle(/could not be read/i)).toBeNull();
  });

  it("does not claim no login either, whatever canLogin says", () => {
    render(<AccessRoleCell roles={null} canLogin={false} />);

    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText("No login")).toBeNull();
  });
});

describe("when the read succeeded and they hold nothing", () => {
  it("says there is no login when there is no account", () => {
    render(<AccessRoleCell roles={[]} canLogin={false} />);

    expect(screen.getByText("No login")).toBeTruthy();
    /* "No role" would be true and useless: of course somebody with no account
       holds no role. The reader needs the cause, not the symptom. */
    expect(screen.queryByText("No role")).toBeNull();
  });

  it("flags an account that can sign in and do nothing", () => {
    render(<AccessRoleCell roles={[]} canLogin={true} />);

    expect(screen.getByText("No role")).toBeTruthy();
    expect(screen.queryByText("No login")).toBeNull();
  });

  it("treats an unknown login state as unknown, not as no login", () => {
    render(<AccessRoleCell roles={[]} canLogin={undefined} />);

    /* `canLogin` is optional on `Employee`, so `undefined` reaches here. A
       confident "No login" from a field nobody set is the same class of wrong
       claim as the rest of this file. */
    expect(screen.queryByText("No login")).toBeNull();
    expect(screen.getByText("No role")).toBeTruthy();
  });
});

describe("when they hold roles", () => {
  it("names the role", () => {
    render(<AccessRoleCell roles={[ROLE]} canLogin={true} />);

    expect(screen.getByText("Administrator")).toBeTruthy();
    expect(screen.queryByText("No role")).toBeNull();
  });

  it("names every one of them, in the order given", () => {
    const { container } = render(
      <AccessRoleCell roles={[ROLE, SECOND]} canLogin={true} />,
    );

    /* Both, not a "primary" one we picked: two roles can each carry a
       permission, so an auditor needs the set. */
    expect(screen.getByText("Administrator")).toBeTruthy();
    expect(screen.getByText("HR manager")).toBeTruthy();

    const rendered = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(rendered.indexOf("Administrator")).toBeLessThan(
      rendered.indexOf("HR manager"),
    );
  });

  it("renders no absence text at all", () => {
    render(<AccessRoleCell roles={[ROLE]} canLogin={false} />);

    /* `canLogin: false` beside a held role is contradictory data, and the role
       is the stronger fact — it came from the roles table. Rendering "No login"
       over the top of a real role would hide it. */
    expect(screen.queryByText("No login")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.getByText("Administrator")).toBeTruthy();
  });
});
