import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectoryPerson, Employee, EmployeeAccess } from "@/lib/types";

/**
 * The staff search on a notice for named people.
 *
 * Two things are pinned. It lists the lookup rows everybody is sent, so somebody
 * who holds `MANAGE_SETTINGS` without `EDIT_RECORDS` (sent no full rows at all)
 * finds people instead of "Nobody matches". And it refuses what the API refuses
 * (no account, archived account) and nothing more: somebody invited and not yet
 * signed in is added.
 */

const directory = vi.hoisted(() => ({
  state: {
    employees: [] as unknown[],
    people: [] as unknown[],
    loading: false,
  },
}));

vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => directory.state,
}));

const { PeoplePicker } =
  await import("@/components/announcements/people-picker");

const lookup = (id: string, fullName: string, jobTitle = "Analyst") =>
  ({
    id,
    fullName,
    jobTitle,
    department: null,
  }) satisfies DirectoryPerson;

const full = (
  id: string,
  firstName: string,
  lastName: string,
  employeeNo: string,
  jobTitle: string,
  access?: EmployeeAccess["state"],
) =>
  ({
    id,
    firstName,
    lastName,
    employeeNo,
    jobTitle,
    ...(access
      ? { access: { state: access, expiresAt: null, roles: [] } }
      : {}),
  }) as unknown as Employee;

beforeEach(() => {
  directory.state = { employees: [], people: [], loading: false };
});

async function search(onChange = vi.fn()) {
  const user = userEvent.setup();
  render(<PeoplePicker value={[]} onChange={onChange} />);
  await user.type(screen.getByLabelText("Search for a person to add"), "ad");
  return { user, onChange };
}

const rowOf = async (name: string) =>
  (await screen.findByText(name)).closest("li") as HTMLElement;

describe("somebody who can change settings but not edit records", () => {
  it("finds people from the lookup rows they are sent", async () => {
    /* No full rows at all: `employees` is empty for this caller. */
    directory.state = {
      employees: [],
      people: [
        lookup("p1", "Ada Okafor", "Accountant"),
        lookup("p2", "Musa Bello", "Driver"),
      ],
      loading: false,
    };
    const { user, onChange } = await search();

    const ada = await rowOf("Ada Okafor");
    expect(within(ada).getByText("Accountant")).toBeInTheDocument();
    expect(await rowOf("Musa Bello")).toBeInTheDocument();
    expect(screen.queryByText(/Nobody on the staff list/)).toBeNull();

    /* Their sign-in state is not known, which is not "cannot sign in". */
    const add = within(ada).getByRole("button", { name: "Add" });
    expect(add).toBeEnabled();
    await user.click(add);
    expect(onChange).toHaveBeenCalledWith([{ id: "p1", name: "Ada Okafor" }]);
  });

  it("still says nobody matches when the answer really is empty", async () => {
    await search();
    expect(
      await screen.findByText("Nobody on the staff list matches “ad”."),
    ).toBeInTheDocument();
  });

  it("says it is searching while the first answer is on its way", async () => {
    directory.state = { employees: [], people: [], loading: true };
    await search();
    expect(await screen.findByText("Searching…")).toBeInTheDocument();
  });
});

describe("somebody who can edit records", () => {
  it("adds the staff number to the row, from the full row", async () => {
    directory.state = {
      employees: [
        full("p1", "Ada", "Okafor", "EMP-014", "Accountant", "ACCEPTED"),
      ],
      people: [lookup("p1", "Ada Okafor", "Accountant")],
      loading: false,
    };
    await search();
    const row = await rowOf("Ada Okafor");
    expect(within(row).getByText("EMP-014 · Accountant")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Add" })).toBeEnabled();
  });

  it.each([
    ["NONE", "No account yet, so cannot be sent a message"],
    ["DISABLED", "Access closed, so cannot be sent a message"],
  ] as const)(
    "refuses somebody whose access is %s, and says why",
    async (state, why) => {
      directory.state = {
        employees: [
          full("p1", "Ada", "Okafor", "EMP-014", "Accountant", state),
        ],
        people: [lookup("p1", "Ada Okafor", "Accountant")],
        loading: false,
      };
      await search();
      const row = await rowOf("Ada Okafor");
      expect(within(row).getByText(why)).toBeInTheDocument();
      expect(within(row).getByRole("button", { name: "Add" })).toBeDisabled();
    },
  );

  it.each([
    ["SENT", "Invited, has not signed in yet"],
    ["EXPIRED", "Invitation expired, has not signed in yet"],
  ] as const)(
    "adds somebody who was invited and has not signed in (%s), as the API does",
    async (state, note) => {
      directory.state = {
        employees: [
          full("p1", "Ada", "Okafor", "EMP-014", "Accountant", state),
        ],
        people: [lookup("p1", "Ada Okafor", "Accountant")],
        loading: false,
      };
      const { user, onChange } = await search();
      const row = await rowOf("Ada Okafor");
      /* Who they are stays on the row, with the note after it. */
      expect(
        within(row).getByText(`EMP-014 · Accountant · ${note}`),
      ).toBeInTheDocument();
      const add = within(row).getByRole("button", { name: "Add" });
      expect(add).toBeEnabled();
      await user.click(add);
      expect(onChange).toHaveBeenCalledWith([{ id: "p1", name: "Ada Okafor" }]);
    },
  );

  it("shows somebody already chosen as added, and does not offer them twice", async () => {
    directory.state = {
      employees: [],
      people: [lookup("p1", "Ada Okafor")],
      loading: false,
    };
    const user = userEvent.setup();
    render(
      <PeoplePicker
        value={[{ id: "p1", name: "Ada Okafor" }]}
        onChange={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText("Search for a person to add"), "ad");
    /* The chip is there at once; the results arrive after the debounce, so wait
       for the button that only a result row has. */
    const added = await screen.findByRole("button", { name: "Added" });
    expect(added).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
  });
});
