import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SchedulesPanel } from "@/app/(app)/settings/attendance/schedules";
import { ToastProvider } from "@/components/ui";
import type { ApiWorkSchedule } from "@/lib/api/attendance";
import { ApiError } from "@/lib/api/client";

/**
 * The schedules list and its editor, pressed.
 *
 * The API is mocked at `attendanceApi`, so the real `useWorkSchedules` runs: what
 * is asserted is the body that would go over the wire, which is the half of this
 * the server cannot check for us. Departments and the directory are stubbed at
 * their hooks, because what they fetch is somebody else's screen.
 */

const state = vi.hoisted(() => ({ can: true }));
const api = vi.hoisted(() => ({
  schedules: vi.fn(),
  createSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
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

const weekdays = (start: string, end: string, ...days: number[]) =>
  days.map((weekday) => ({ weekday, start, end }));

const production: ApiWorkSchedule = {
  id: "s1",
  name: "Production",
  days: [
    ...weekdays("08:00", "17:00", 1, 2, 3, 4, 5),
    ...weekdays("07:30", "14:00", 6),
  ],
  departments: [{ id: "d1", name: "Production" }],
  people: [
    { id: "e1", name: "Ada Obi", departmentId: "d1" },
    { id: "zed", name: "Zed Out", departmentId: null },
  ],
};

function mount() {
  return render(
    <ToastProvider>
      <SchedulesPanel hours={hours} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  state.can = true;
  api.schedules.mockReset().mockResolvedValue([production]);
  api.createSchedule.mockReset().mockResolvedValue(production);
  api.updateSchedule.mockReset().mockResolvedValue(production);
  api.deleteSchedule.mockReset().mockResolvedValue(undefined);
});

const time = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("the schedules list", () => {
  it("says the name, the week in a line, and who it is for", async () => {
    mount();
    expect(await screen.findByText("Production · 2 people")).toBeTruthy();
    expect(
      screen.getByText("Mon–Fri 08:00–17:00 · Sat 07:30–14:00"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Edit Production" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Delete Production" }),
    ).toBeTruthy();
  });

  it("is one link and no paragraph when there are none", async () => {
    api.schedules.mockResolvedValue([]);
    mount();
    const link = await screen.findByRole("button", { name: "Add schedule" });
    expect(link).toBeTruthy();
    expect(screen.queryByText(/schedules let you/i)).toBeNull();
    // The header has no second add button beside the link.
    expect(
      screen.getAllByRole("button", { name: "Add schedule" }),
    ).toHaveLength(1);
  });

  it("offers no controls to somebody who cannot change settings", async () => {
    state.can = false;
    mount();
    await screen.findByText("Production · 2 people");
    expect(screen.queryByRole("button", { name: /add schedule/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /edit production/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /delete production/i }),
    ).toBeNull();
  });
});

describe("adding a schedule", () => {
  it("starts as the company's week, and saves exactly what was set", async () => {
    api.schedules.mockResolvedValue([]);
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Add schedule" }),
    );

    await user.type(screen.getByLabelText(/^Name/), "  Production  ");
    // The company's Monday to Friday is already on, at the company's hours.
    expect(screen.getByRole("switch", { name: "Monday" })).toHaveProperty(
      "checked",
      true,
    );
    expect(screen.getByRole("switch", { name: "Saturday" })).toHaveProperty(
      "checked",
      false,
    );
    expect(screen.queryByLabelText("Saturday starts")).toBeNull();

    await user.click(screen.getByRole("switch", { name: "Saturday" }));
    // A newly switched-on day starts from the company's shift.
    expect(
      (screen.getByLabelText("Saturday starts") as HTMLInputElement).value,
    ).toBe("08:00");
    time("Saturday starts", "07:30");
    time("Saturday ends", "14:00");

    await user.click(screen.getByRole("checkbox", { name: "Production" }));
    await user.click(screen.getByRole("checkbox", { name: "Bayo Eze" }));

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.createSchedule).toHaveBeenCalledTimes(1));
    expect(api.createSchedule).toHaveBeenCalledWith({
      name: "Production",
      days: [
        ...weekdays("08:00", "17:00", 1, 2, 3, 4, 5),
        ...weekdays("07:30", "14:00", 6),
      ],
      departmentIds: ["d1"],
      employeeIds: ["e2"],
    });
    // Closes on success, and the list is read again rather than trusted.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.schedules.mock.calls.length).toBeGreaterThan(1);
  });

  it("will not save without a name, and says so beside it", async () => {
    api.schedules.mockResolvedValue([]);
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Add schedule" }),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Give it a name")).toBeTruthy();
    expect(api.createSchedule).not.toHaveBeenCalled();
  });

  it("will not save with every day off", async () => {
    api.schedules.mockResolvedValue([]);
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Add schedule" }),
    );
    await user.type(screen.getByLabelText(/^Name/), "Nobody");
    for (const day of [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
    ]) {
      await user.click(screen.getByRole("switch", { name: day }));
    }
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Switch on at least one day")).toBeTruthy();
    expect(api.createSchedule).not.toHaveBeenCalled();
  });

  it("will not save a day that ends before it starts", async () => {
    api.schedules.mockResolvedValue([]);
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Add schedule" }),
    );
    await user.type(screen.getByLabelText(/^Name/), "Backwards");
    time("Monday ends", "07:00");
    expect(screen.getByText("End must be after start")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(api.createSchedule).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and shows the API's own words when it refuses", async () => {
    api.schedules.mockResolvedValue([]);
    api.createSchedule.mockRejectedValue(
      new ApiError(
        409,
        "conflict",
        "There is already a schedule called Production.",
      ),
    );
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Add schedule" }),
    );
    await user.type(screen.getByLabelText(/^Name/), "Production");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("There is already a schedule called Production."),
    ).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("editing a schedule", () => {
  it("opens as it was saved, and sends the whole set back", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Edit Production" }),
    );

    const dialog = screen.getByRole("dialog");
    expect(
      (within(dialog).getByLabelText(/^Name/) as HTMLInputElement).value,
    ).toBe("Production");
    expect(
      within(dialog).getByRole("switch", { name: "Saturday" }),
    ).toHaveProperty("checked", true);
    expect(
      within(dialog).getByRole("switch", { name: "Sunday" }),
    ).toHaveProperty("checked", false);
    expect(
      (within(dialog).getByLabelText("Saturday starts") as HTMLInputElement)
        .value,
    ).toBe("07:30");
    expect(
      within(dialog).getByRole("checkbox", { name: "Production" }),
    ).toHaveProperty("checked", true);
    expect(
      within(dialog).getByRole("checkbox", { name: "Ada Obi" }),
    ).toHaveProperty("checked", true);
    // Somebody the directory did not return is still listed, still ticked.
    expect(
      within(dialog).getByRole("checkbox", { name: "Zed Out" }),
    ).toHaveProperty("checked", true);

    const name = within(dialog).getByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, "Production crew");
    await user.click(within(dialog).getByRole("switch", { name: "Sunday" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Ada Obi" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.updateSchedule).toHaveBeenCalledTimes(1));
    expect(api.updateSchedule).toHaveBeenCalledWith("s1", {
      name: "Production crew",
      days: [
        ...weekdays("08:00", "17:00", 1, 2, 3, 4, 5),
        ...weekdays("07:30", "14:00", 6),
        ...weekdays("08:00", "17:00", 7),
      ],
      departmentIds: ["d1"],
      // Ada was unticked; the person who is not in the directory stays.
      employeeIds: ["zed"],
    });
  });

  it("opens each schedule as itself, not as the one edited before it", async () => {
    const sales: ApiWorkSchedule = {
      id: "s2",
      name: "Sales",
      days: weekdays("09:00", "18:00", 1, 2),
      departments: [],
      people: [],
    };
    api.schedules.mockResolvedValue([production, sales]);
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Edit Production" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("button", { name: "Edit Sales" }));
    const dialog = screen.getByRole("dialog");
    expect(
      (within(dialog).getByLabelText(/^Name/) as HTMLInputElement).value,
    ).toBe("Sales");
    expect(
      (within(dialog).getByLabelText("Monday starts") as HTMLInputElement)
        .value,
    ).toBe("09:00");
    expect(
      within(dialog).getByRole("switch", { name: "Saturday" }),
    ).toHaveProperty("checked", false);
  });
});

describe("deleting a schedule", () => {
  it("asks first, then deletes by id and reads the list again", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Delete Production" }),
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Delete Production?")).toBeTruthy();
    expect(api.deleteSchedule).not.toHaveBeenCalled();

    api.schedules.mockResolvedValue([]);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.deleteSchedule).toHaveBeenCalledWith("s1"));
    expect(
      await screen.findByRole("button", { name: "Add schedule" }),
    ).toBeTruthy();
  });

  it("leaves it alone when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Delete Production" }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(api.deleteSchedule).not.toHaveBeenCalled();
  });
});
