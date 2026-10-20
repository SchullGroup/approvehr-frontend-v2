import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAttendanceDevice } from "@/lib/api/attendance";
import { deviceUserLabel } from "@/lib/api/attendance";
import { DevicesScreen } from "@/app/(app)/settings/devices/devices-screen";
import { EnrolmentsDrawer } from "@/app/(app)/settings/devices/enrolments-drawer";

/**
 * A Smart Life door is a device with no secret and no agent: the screen says
 * what it is, lets HR make it entry-only, warns when its sync has gone quiet,
 * and names the fingerprint numbers in words.
 */

const device = (
  over: Partial<ApiAttendanceDevice> = {},
): ApiAttendanceDevice => ({
  id: "d1",
  serialNumber: "tuya-abc",
  label: "Front door",
  workLocationId: null,
  workLocationName: null,
  active: true,
  lastSeenAt: null,
  secret: null,
  enrolments: 0,
  unmappedPunches: 0,
  archivedAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  provider: "TUYA",
  entryOnly: true,
  syncStale: false,
  ...over,
});

let devices: ApiAttendanceDevice[] = [];
const update = vi.fn(async () => device());
const reload = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/settings/devices",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => true,
  usePermissions: () => ({ can: () => true, loading: false }),
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
  useSession: () => ({ isConnected: true, isLoading: false }),
}));
vi.mock("@/lib/store/work-locations", () => ({
  useWorkLocationList: () => ({ locations: [], loading: false }),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({
    employees: [
      {
        id: "e1",
        firstName: "Ada",
        lastName: "Obi",
        jobTitle: "Clerk",
        employeeNo: "E1",
      },
    ],
    loading: false,
  }),
}));
vi.mock("@/lib/store/attendance-devices", () => ({
  useAttendanceDevices: () => ({
    devices,
    loading: false,
    error: null,
    source: "api",
    reload,
  }),
  useDeviceMutations: () => ({
    update,
    register: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    rotateSecret: vi.fn(),
    map: vi.fn(),
    unmap: vi.fn(),
  }),
  useDeviceEnrolments: () => ({
    enrolments: [],
    unmapped: [
      { deviceUserId: "fp:3", deviceUserName: "Ada Obi", punches: 4 },
      { deviceUserId: "card:12", deviceUserName: null, punches: 1 },
      { deviceUserId: "face:7", deviceUserName: "Tunde", punches: 2 },
      { deviceUserId: "0047", deviceUserName: null, punches: 1 },
    ],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

beforeEach(() => {
  devices = [];
  update.mockClear();
});

describe("deviceUserLabel", () => {
  it("spells out fingerprints, cards and faces, and leaves anything else alone", () => {
    expect(deviceUserLabel("fp:3")).toBe("Fingerprint 3");
    expect(deviceUserLabel("card:12")).toBe("Card 12");
    expect(deviceUserLabel("face:7")).toBe("Face 7");
    expect(deviceUserLabel("0047")).toBe("0047");
  });
});

describe("the devices screen", () => {
  it("labels a Smart Life device and hides its secret", async () => {
    devices = [device({ syncStale: true })];
    render(<DevicesScreen />);

    expect(screen.getAllByText("Smart Life").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        "Not synced for 5 days — scans older than 7 days are lost",
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /new secret/i })).toBeNull();

    const user = userEvent.setup();
    const [toggle] = screen.getAllByRole("switch", {
      name: "Door entry only",
    });
    await user.click(toggle!);
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("d1", { entryOnly: false }),
    );
  });

  it("keeps the secret controls on an agent device", () => {
    devices = [
      device({ provider: "AGENT", entryOnly: false, secret: "whsec_…abcd" }),
    ];
    render(<DevicesScreen />);
    expect(screen.queryByText("Smart Life")).toBeNull();
    expect(
      screen.getAllByRole("button", { name: /new secret/i }).length,
    ).toBeGreaterThan(0);
  });
});

describe("the enrolments drawer", () => {
  it("shows fingerprint numbers as words beside the Smart Life name", () => {
    render(
      <EnrolmentsDrawer
        device={device()}
        canManage
        open
        onClose={() => {}}
        onChanged={() => {}}
      />,
    );
    const fp = screen.getByText("Fingerprint 3").closest("li")!;
    expect(within(fp).getByText(/Ada Obi/)).toBeTruthy();
    expect(screen.getByText("Card 12")).toBeTruthy();
    expect(screen.getByText("Face 7")).toBeTruthy();
    expect(screen.getByText("0047")).toBeTruthy();
  });
});
