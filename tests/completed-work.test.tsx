import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type {
  CompletedWork as Work,
  Completion,
} from "@/lib/projects/completions";
import { linkedTo } from "./support/objective-fixtures";

/**
 * "Completed work", under an objective or a KPI.
 *
 * What is proved: a team objective lists the tasks by the person who finished
 * them; a person's KPI lists their own, and the ones linked above it say at which
 * level; nothing on it can be graded; a list of objectives asks for nothing until
 * one is opened; and where the API will not answer (a Program reader, a holder of
 * the company-wide grant, somebody who may not read the objective) it draws
 * nothing at all.
 */

const hook = vi.hoisted(() => ({
  read: null as unknown,
  calls: [] as unknown[],
}));
vi.mock("@/lib/store/completions", () => ({
  useCompletedWork: (args: unknown) => {
    hook.calls.push(args);
    return hook.read;
  },
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
}));

const { CompletedWork } =
  await import("@/components/performance/completed-work");

const done = (over: Partial<Completion> = {}): Completion => ({
  id: "i1",
  key: "PRF-1",
  title: "Run the October payroll",
  projectId: "p1",
  projectName: "Payroll v2",
  personal: false,
  personId: "bola",
  personName: "Bola Projects",
  doneAt: "2026-10-12T10:00:00.000Z",
  doneDay: "2026-10-12",
  dueDate: "2026-10-12",
  onTime: true,
  objective: linkedTo("Ship payroll v2", { level: "department" }),
  canOpen: true,
  ...over,
});

const read = (data: Work | null, over: Record<string, unknown> = {}) => ({
  data,
  loading: false,
  error: null,
  reload: vi.fn(),
  ...over,
});

const team: Work = {
  groups: [
    {
      personId: "bola",
      personName: "Bola Projects",
      items: [
        done(),
        done({
          id: "i2",
          key: "PRF-2",
          title: "Close the books",
          onTime: false,
        }),
      ],
    },
    {
      personId: "chi",
      personName: "Chi Ada",
      items: [
        done({
          id: "i3",
          key: "PRF-3",
          title: "Draw the plan",
          personId: "chi",
          personName: "Chi Ada",
        }),
      ],
    },
  ],
  total: 3,
  capped: false,
};

const department = {
  id: "d1",
  ownerId: null,
  parentId: null,
  level: "department" as const,
  reviewCycleId: null,
};
const kpi = {
  id: "k1",
  ownerId: "bola",
  parentId: "d1",
  level: "personal" as const,
  reviewCycleId: null,
};

beforeEach(() => {
  hook.read = read(team);
  hook.calls = [];
});

describe("under a team objective", () => {
  it("names the people, how many tasks each, and what they finished", async () => {
    render(<CompletedWork goal={department} />);
    expect(
      screen.getByRole("button", { name: /Completed work/ }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("3 tasks")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /Completed work/ }),
    );
    const bola = screen
      .getByRole("heading", { name: /Bola Projects/ })
      .closest("section")!;
    expect(within(bola).getByText("2 tasks")).toBeInTheDocument();
    expect(within(bola).getByText("Close the books")).toBeInTheDocument();
    expect(within(bola).getByText("Late")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Chi Ada/ }),
    ).toBeInTheDocument();
  });

  it("has no grade button, word or control", async () => {
    render(<CompletedWork goal={department} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Completed work/ }),
    );
    expect(document.body.textContent).not.toMatch(
      /grade|graded|score|waiting|reject|partly/i,
    );
    for (const b of screen.getAllByRole("button")) {
      expect(b.textContent ?? "").not.toMatch(/grade|mark|done|reject/i);
    }
    expect(document.querySelector("[class*=danger]")).toBeNull();
  });
});

describe("under a person's KPI", () => {
  it("lists their own tasks without a name heading, and marks the ones linked above it", async () => {
    hook.read = read({
      groups: [
        {
          personId: "bola",
          personName: "Bola Projects",
          items: [
            done({
              id: "a",
              key: "PRF-1",
              title: "Own link",
              objective: linkedTo("Bola delivers payroll", {
                level: "personal",
              }),
            }),
            done({
              id: "b",
              key: "PRF-2",
              title: "Department link",
              linkedAt: "department",
            }),
            done({
              id: "c",
              key: "PRF-3",
              title: "Company link",
              linkedAt: "company",
              objective: linkedTo("Grow revenue", { level: "company" }),
            }),
          ],
        },
      ],
      total: 3,
      capped: false,
    });
    render(<CompletedWork goal={kpi} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Completed work/ }),
    );
    expect(screen.queryByRole("heading", { name: /Bola Projects/ })).toBeNull();
    expect(
      screen.getByText("Linked to Bola delivers payroll"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Linked to Ship payroll v2, at the department level"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Linked to Grow revenue, at the company level"),
    ).toBeInTheDocument();
  });

  it("says a closed objective is closed, and does not add a level to it", async () => {
    hook.read = read({
      groups: [
        {
          personId: "bola",
          personName: "Bola Projects",
          items: [
            done({
              linkedAt: "department",
              objective: linkedTo("Old", {
                state: "CLOSED",
                message: "Linked objective is closed",
              }),
            }),
          ],
        },
      ],
      total: 1,
      capped: false,
    });
    render(<CompletedWork goal={kpi} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Completed work/ }),
    );
    expect(screen.getByText("Linked objective is closed")).toBeInTheDocument();
  });
});

describe("when there is nothing", () => {
  it("says so once, plainly, with no warning", async () => {
    hook.read = read({ groups: [], total: 0, capped: false });
    render(<CompletedWork goal={kpi} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Completed work/ }),
    );
    expect(
      screen.getByText("No finished tasks are linked to this yet."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says how many of how many when the list is capped", async () => {
    hook.read = read({ ...team, total: 240, capped: true });
    render(<CompletedWork goal={department} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Completed work/ }),
    );
    expect(screen.getByText("Showing 3 of 240.")).toBeInTheDocument();
  });
});

describe("asking only when wanted", () => {
  it("asks at once in a dialog opened for one objective", () => {
    render(<CompletedWork goal={kpi} />);
    expect(hook.calls.at(-1)).toMatchObject({ enabled: true });
  });

  it("asks nothing in a list until one is opened, then asks", async () => {
    hook.read = read(null);
    render(<CompletedWork goal={kpi} lazy />);
    expect(
      hook.calls.every((c) => (c as { enabled: boolean }).enabled === false),
    ).toBe(true);
    await userEvent.click(
      screen.getByRole("button", { name: /Completed work/ }),
    );
    expect(hook.calls.at(-1)).toMatchObject({ enabled: true });
  });

  it("draws nothing of the answer while it loads", async () => {
    hook.read = read(null, { loading: true });
    render(<CompletedWork goal={kpi} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Completed work/ }),
    );
    expect(screen.queryByText(/Run the October payroll/)).toBeNull();
    expect(screen.queryByText(/No finished tasks/)).toBeNull();
    expect(screen.getByLabelText("Loading completed work")).toBeInTheDocument();
  });
});

describe("who it answers", () => {
  it.each([
    ["a Program Read person", 404],
    ["a holder of the company-wide grant", 404],
    ["somebody who may not read the objective", 404],
    ["somebody refused outright", 403],
  ])("draws nothing at all for %s", (_who, status) => {
    hook.read = read(null, {
      error: new ApiError(status, "x", "That goal could not be found."),
    });
    const { container } = render(<CompletedWork goal={kpi} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says a real failure, with another try", async () => {
    hook.read = read(null, { error: new ApiError(500, "boom", "It broke.") });
    render(<CompletedWork goal={kpi} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Completed work/ }),
    );
    expect(
      screen.getByRole("button", { name: /try again|retry/i }),
    ).toBeInTheDocument();
  });
});
