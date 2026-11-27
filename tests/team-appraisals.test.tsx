import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import {
  TeamAppraisals,
  groupedByDepartment,
  personOf,
  type TeamPerson,
} from "@/components/performance/team-appraisals";
import type { ApiProgressPerson } from "@/lib/api/performance";

/**
 * A manager's team list: no card, no filter, one thin bar above it, the people
 * grouped by department where it is known, and per person one status word and
 * one button. A reminder is a quiet link that is gone once it has been used.
 */

const step = (key: string, done: boolean) => ({
  key,
  label: key,
  total: 1,
  answered: done ? 1 : 0,
  done,
});
const person = (over: Partial<ApiProgressPerson>): ApiProgressPerson => ({
  employeeId: "e-1",
  employeeName: "Ada",
  selfSubmitted: true,
  submitted: false,
  overallRating: null,
  locked: false,
  lockedReason: null,
  currentStep: "questions",
  steps: [step("questions", false), step("core", false)],
  ...over,
});

const state = vi.hoisted(() => ({ open: vi.fn(), nudge: vi.fn() }));

const team = (): TeamPerson[] =>
  [
    person({ employeeId: "e-d", employeeName: "Dayo" }),
    person({
      employeeId: "e-e",
      employeeName: "Efe",
      selfSubmitted: false,
      locked: true,
      lockedReason: "Efe has not sent their self review yet.",
    }),
    person({
      employeeId: "e-f",
      employeeName: "Funmi",
      steps: [step("a", true), step("b", false)],
    }),
    person({ employeeId: "e-g", employeeName: "Gbenga", submitted: true }),
  ].map(personOf);

const mount = (people: TeamPerson[] = team(), withNudge = true) =>
  render(
    <ToastProvider>
      <TeamAppraisals
        people={people}
        onOpen={state.open}
        {...(withNudge ? { onNudge: state.nudge } : {})}
      />
    </ToastProvider>,
  );

const rowOf = (name: string) =>
  screen.getByText(name).closest("li") as HTMLElement;

beforeEach(() => {
  state.open = vi.fn();
  state.nudge = vi.fn().mockResolvedValue(undefined);
});

describe("personOf", () => {
  it("is done when submitted, locked when locked, else by steps done", () => {
    expect(personOf(person({ submitted: true })).status).toBe("done");
    expect(personOf(person({ locked: true })).status).toBe("locked");
    expect(personOf(person({})).status).toBe("ready");
    expect(
      personOf(person({ steps: [step("a", true), step("b", false)] })).status,
    ).toBe("in-progress");
  });
});

describe("groupedByDepartment", () => {
  const p = (id: string, department?: string | null): TeamPerson => ({
    id,
    name: id,
    ...(department === undefined ? {} : { department }),
    status: "ready",
    stepsDone: 0,
    stepsTotal: 1,
  });

  it("is one group with no name when nobody has a department, which is what the API gives", () => {
    expect(groupedByDepartment([p("a"), p("b")])).toEqual([
      { department: null, people: [p("a"), p("b")] },
    ]);
  });

  it("groups by department in the order they are met, with the unknown last", () => {
    const groups = groupedByDepartment([
      p("a", "Sales"),
      p("b"),
      p("c", "Engineering"),
      p("d", "Sales"),
    ]);
    expect(groups.map((g) => g.department)).toEqual([
      "Sales",
      "Engineering",
      null,
    ]);
    expect(groups[0]?.people.map((x) => x.id)).toEqual(["a", "d"]);
  });
});

describe("the list", () => {
  it("has no card, no filter and no per-row 'steps' bar except while in progress", () => {
    mount();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByText("Department")).toBeNull();
    expect(screen.queryByText("Status")).toBeNull();
    /* One thin bar above the list and one on the person who is in progress. */
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
    expect(within(rowOf("Funmi")).getAllByRole("progressbar")).toHaveLength(1);
    expect(within(rowOf("Dayo")).queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("1 of 4 people done")).toBeVisible();
  });

  it("says each status once, in one word each", () => {
    mount();
    expect(within(rowOf("Dayo")).getByText("Ready to start")).toBeVisible();
    expect(within(rowOf("Funmi")).getByText("In progress")).toBeVisible();
    expect(within(rowOf("Gbenga")).getByText("Done")).toBeVisible();
    expect(
      within(rowOf("Efe")).getByText("Waiting on their self review"),
    ).toBeVisible();
    /* How much is answered is its own line, so the status stays one word, and
       it is only there once something is (F31). */
    expect(within(rowOf("Funmi")).getByText("1 of 2 answered")).toBeVisible();
    expect(within(rowOf("Dayo")).queryByText(/answered/)).toBeNull();
    /* The API's own sentence adds nothing to that, so it is not drawn. */
    expect(
      screen.queryByText("Efe has not sent their self review yet."),
    ).toBeNull();
  });

  it("has one button per row, and none for a person who is waiting", () => {
    mount();
    expect(within(rowOf("Dayo")).getAllByRole("button")).toHaveLength(1);
    expect(
      within(rowOf("Dayo")).getByRole("button", { name: "Start" }),
    ).toBeVisible();
    expect(
      within(rowOf("Funmi")).getByRole("button", { name: "Continue" }),
    ).toBeVisible();
    expect(
      within(rowOf("Gbenga")).getByRole("button", { name: "View" }),
    ).toBeVisible();
    expect(
      within(rowOf("Efe")).queryByRole("button", {
        name: /Start|Continue|View/,
      }),
    ).toBeNull();
  });

  it("opens a person from their button", async () => {
    mount();
    await userEvent.click(
      within(rowOf("Dayo")).getByRole("button", { name: "Start" }),
    );
    expect(state.open).toHaveBeenCalledWith(
      expect.objectContaining({ id: "e-d" }),
    );
  });

  it("draws no bar and no heading for a team of one with no department", () => {
    mount([team()[0] as TeamPerson]);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("groups by department, with a heading for each, when it is known", () => {
    mount([
      { ...(team()[0] as TeamPerson), department: "Sales" },
      { ...(team()[2] as TeamPerson), department: "Engineering" },
    ]);
    expect(screen.getByRole("heading", { name: "Sales" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Engineering" })).toBeVisible();
  });
});

describe("reminding", () => {
  it("is a quiet link, and calls the API once", async () => {
    mount();
    const row = rowOf("Efe");
    await userEvent.click(within(row).getByRole("button", { name: "Remind" }));
    expect(state.nudge).toHaveBeenCalledWith(
      expect.objectContaining({ id: "e-e" }),
    );
    expect(await screen.findByText("Reminder sent")).toBeVisible();
  });

  it("is gone once it has been used, not a disabled button saying so", async () => {
    mount();
    const row = rowOf("Efe");
    await userEvent.click(within(row).getByRole("button", { name: "Remind" }));
    await screen.findByText("Reminder sent");
    expect(within(row).queryByRole("button")).toBeNull();
    expect(screen.queryByText("Reminded today")).toBeNull();
  });

  it("shows the API's own refusal when it is refused, and keeps the link", async () => {
    state.nudge = vi.fn().mockRejectedValue(
      Object.assign(new Error("Reminded in the last 24 hours."), {
        status: 409,
      }),
    );
    mount();
    const row = rowOf("Efe");
    await userEvent.click(within(row).getByRole("button", { name: "Remind" }));
    expect(await screen.findByText("Not sent")).toBeVisible();
    expect(within(row).getByRole("button", { name: "Remind" })).toBeEnabled();
  });

  it("is not offered where nothing can send one", () => {
    mount(team(), false);
    expect(within(rowOf("Efe")).queryByRole("button")).toBeNull();
  });
});
