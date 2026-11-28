import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpecialDaysPanel } from "@/app/(app)/settings/attendance/special-days";
import { ToastProvider } from "@/components/ui";
import type { ApiSpecialDay } from "@/lib/api/attendance";

/**
 * Special days, pressed: the list, and the form that adds, changes and removes
 * one. As with the schedules test, the API is mocked at `attendanceApi` so the
 * real `useSpecialDays` runs and what is asserted is the body that goes out.
 *
 * Dates are 2000 and 2099 rather than "next week" so the order on screen does not
 * depend on the day the suite is run.
 */

const state = vi.hoisted(() => ({ can: true }));
const api = vi.hoisted(() => ({
  specialDays: vi.fn(),
  createSpecialDay: vi.fn(),
  updateSpecialDay: vi.fn(),
  deleteSpecialDay: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  useCan: () => state.can,
  usePermissions: () => ({ can: () => state.can, loading: false }),
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
  useSession: () => ({ isConnected: true, isLoading: false }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({
    flat: [
      { id: "d1", name: "Production" },
      { id: "d2", name: "Sales" },
    ],
  }),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({
    loading: false,
    people: [
      {
        id: "e1",
        fullName: "Ada Obi",
        jobTitle: "Operator",
        department: "Production",
        departmentId: "d1",
      },
      {
        id: "e2",
        fullName: "Bayo Eze",
        jobTitle: "Rep",
        department: "Sales",
        departmentId: "d2",
      },
    ],
  }),
}));
vi.mock("@/lib/api/attendance", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api/attendance")>();
  return { ...real, attendanceApi: { ...real.attendanceApi, ...api } };
});

const hours = { start: "08:00", end: "17:00", weekdays: [1, 2, 3, 4, 5] };

const special = (over: Partial<ApiSpecialDay>): ApiSpecialDay => ({
  id: "x1",
  date: "2099-12-26",
  scope: "COMPANY",
  departmentId: null,
  departmentName: null,
  employeeId: null,
  employeeName: null,
  working: false,
  start: null,
  end: null,
  note: null,
  ...over,
});

const saturday = special({
  id: "x2",
  date: "2099-12-05",
  scope: "DEPARTMENT",
  departmentId: "d1",
  departmentName: "Production",
  working: true,
  start: "07:30",
  end: "12:00",
  note: "Stock count",
});
const boxing = special({ id: "x1", date: "2099-12-26", note: null });
const gone = special({ id: "x0", date: "2000-01-03" });

function mount() {
  return render(
    <ToastProvider>
      <SpecialDaysPanel hours={hours} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  state.can = true;
  api.specialDays.mockReset().mockResolvedValue([gone, boxing, saturday]);
  api.createSpecialDay.mockReset().mockResolvedValue(boxing);
  api.updateSpecialDay.mockReset().mockResolvedValue(saturday);
  api.deleteSpecialDay.mockReset().mockResolvedValue(undefined);
});

const setDate = (value: string) =>
  fireEvent.change(screen.getByLabelText(/^Date/), { target: { value } });
const setTime = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("the special days list", () => {
  it("puts upcoming days first, soonest at the top, and the earlier ones after", async () => {
    mount();
    await screen.findByText("Sat 5 Dec 2099");
    const dates = screen
      .getAllByRole("listitem")
      .map((row) => within(row).getAllByText(/\d{4}$/)[0]?.textContent);
    expect(dates).toEqual([
      "Sat 5 Dec 2099",
      "Sat 26 Dec 2099",
      "Mon 3 Jan 2000",
    ]);
  });

  it("says who, then Off or the hours, with the note small beneath", async () => {
    mount();
    expect(await screen.findByText("Production · 07:30–12:00")).toBeTruthy();
    expect(screen.getByText("Stock count")).toBeTruthy();
    expect(screen.getAllByText("Everybody · Off")).toHaveLength(2);
  });

  it("is one link and no paragraph when there are none", async () => {
    api.specialDays.mockResolvedValue([]);
    mount();
    await screen.findByRole("button", { name: "Add a special day" });
    expect(
      screen.getAllByRole("button", { name: "Add a special day" }),
    ).toHaveLength(1);
  });

  it("offers no controls to somebody who cannot change settings", async () => {
    state.can = false;
    mount();
    await screen.findByText("Production · 07:30–12:00");
    expect(
      screen.queryByRole("button", { name: /add a special day/i }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /^edit/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^delete/i })).toBeNull();
  });
});

describe("adding a special day", () => {
  it("a day off for everybody sends neither hours nor an id", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Add a special day" }),
    );
    setDate("2099-12-27");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.createSpecialDay).toHaveBeenCalledTimes(1));
    expect(api.createSpecialDay).toHaveBeenCalledWith({
      date: "2099-12-27",
      working: false,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("custom hours for a department send the department, the range and the note", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Add a special day" }),
    );
    setDate("2099-12-12");
    await user.click(screen.getByRole("radio", { name: "A department" }));
    await user.selectOptions(screen.getByLabelText(/^Department/), "d1");
    await user.click(screen.getByRole("radio", { name: "Custom hours" }));
    // Starts from the company's shift.
    expect((screen.getByLabelText("Starts") as HTMLInputElement).value).toBe(
      "08:00",
    );
    setTime("Starts", "07:30");
    setTime("Ends", "14:00");
    await user.type(screen.getByLabelText(/^Note/), "  Saturday shift  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.createSpecialDay).toHaveBeenCalledTimes(1));
    expect(api.createSpecialDay).toHaveBeenCalledWith({
      date: "2099-12-12",
      departmentId: "d1",
      working: true,
      start: "07:30",
      end: "14:00",
      note: "Saturday shift",
    });
  });

  it("a person is chosen from everybody grouped under their department", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Add a special day" }),
    );
    setDate("2099-12-13");
    await user.click(screen.getByRole("radio", { name: "A person" }));
    const select = screen.getByLabelText(/^Person/);
    expect(
      within(select).getByRole("group", { name: "Production" }),
    ).toBeTruthy();
    expect(within(select).getByRole("group", { name: "Sales" })).toBeTruthy();
    await user.selectOptions(select, "e2");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.createSpecialDay).toHaveBeenCalledTimes(1));
    expect(api.createSpecialDay).toHaveBeenCalledWith({
      date: "2099-12-13",
      employeeId: "e2",
      working: false,
    });
  });

  it("will not save without a date, or a department once one is asked for", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Add a special day" }),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Choose a date")).toBeTruthy();

    setDate("2099-12-14");
    await user.click(screen.getByRole("radio", { name: "A department" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Choose a department")).toBeTruthy();
    expect(api.createSpecialDay).not.toHaveBeenCalled();
  });

  it("will not save custom hours that end before they start", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Add a special day" }),
    );
    setDate("2099-12-15");
    await user.click(screen.getByRole("radio", { name: "Custom hours" }));
    setTime("Ends", "07:00");
    expect(screen.getByText("End must be after start")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(api.createSpecialDay).not.toHaveBeenCalled();
  });
});

describe("editing a special day", () => {
  it("shows who it is for as text, and sends only what can change", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Edit Sat 5 Dec 2099" }),
    );
    const dialog = screen.getByRole("dialog");

    // Not a control: nothing here could be refused.
    expect(
      within(dialog).queryByRole("radio", { name: "A department" }),
    ).toBeNull();
    expect(within(dialog).getByText("Production")).toBeTruthy();
    expect(
      (within(dialog).getByLabelText("Starts") as HTMLInputElement).value,
    ).toBe("07:30");

    fireEvent.change(within(dialog).getByLabelText("Ends"), {
      target: { value: "13:00" },
    });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.updateSpecialDay).toHaveBeenCalledTimes(1));
    expect(api.updateSpecialDay).toHaveBeenCalledWith("x2", {
      date: "2099-12-05",
      working: true,
      start: "07:30",
      end: "13:00",
      note: "Stock count",
    });
  });

  it("a note that is emptied is sent as an empty one, so it is cleared", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Edit Sat 5 Dec 2099" }),
    );
    await user.clear(screen.getByLabelText(/^Note/));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.updateSpecialDay).toHaveBeenCalledTimes(1));
    expect(api.updateSpecialDay.mock.calls[0]![1]).toMatchObject({ note: "" });
  });

  it("turning custom hours into a day off drops the hours", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Edit Sat 5 Dec 2099" }),
    );
    await user.click(screen.getByRole("radio", { name: "Off" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.updateSpecialDay).toHaveBeenCalledTimes(1));
    expect(api.updateSpecialDay).toHaveBeenCalledWith("x2", {
      date: "2099-12-05",
      working: false,
      note: "Stock count",
    });
  });

  it("opens each day as itself, not as the one edited before it", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Edit Sat 5 Dec 2099" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(
      screen.getByRole("button", { name: "Edit Sat 26 Dec 2099" }),
    );
    expect((screen.getByLabelText(/^Date/) as HTMLInputElement).value).toBe(
      "2099-12-26",
    );
    expect(
      screen.getByRole("radio", { name: "Off" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.queryByLabelText("Starts")).toBeNull();
  });
});

describe("deleting a special day", () => {
  it("asks first, then deletes by id", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Delete Sat 5 Dec 2099" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(api.deleteSpecialDay).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(api.deleteSpecialDay).toHaveBeenCalledWith("x2"),
    );
  });
});
