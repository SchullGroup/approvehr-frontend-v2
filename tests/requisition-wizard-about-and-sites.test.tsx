import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The new-role wizard asks what the job is, and offers the company's own sites
 * (UAT 23 Nov, U98 / PERF-18 and U100 / PERF-20).
 *
 * An advert could go public as one generated line, because nothing asked for a
 * description, and the location list was fixed: an invented Port Harcourt, no
 * Abeokuta, and "Remote" beside a work-mode choice that already says remote.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/hiring/requisitions/new",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/permissions", () => ({
  usePermissions: () => ({ can: () => true, loading: false }),
  useCan: () => true,
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true, isLoading: false }),
  useOrgTimezone: () => "Africa/Lagos",
}));
const departments = vi.hoisted(() => ({
  flat: [] as { id: string; name: string }[],
}));
const sites = vi.hoisted(() => ({
  locations: [] as { id: string; name: string }[],
}));
vi.mock("@/lib/store/work-locations", () => ({
  useWorkLocations: () => ({
    locations: sites.locations,
    loading: false,
    error: null,
    source: "api",
    create: vi.fn(),
  }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({
    flat: departments.flat,
    loading: false,
    error: null,
  }),
}));
const staff = vi.hoisted(() => ({
  employees: [] as {
    id: string;
    firstName: string;
    lastName: string;
    jobTitle: string;
  }[],
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({ employees: staff.employees, loading: false }),
}));

const createRequisition = vi.fn();
const createStage = vi.fn();
vi.mock("@/lib/store/recruitment", () => ({
  useRequisitionMutations: () => ({ create: createRequisition }),
  useStageMutations: () => ({ create: createStage }),
}));
const createAdvert = vi.fn();
vi.mock("@/lib/store/hiring", () => ({
  useAdvertCreation: () => ({ editable: true, create: createAdvert }),
}));
vi.mock("@/lib/api/careers", async (original) => {
  const real = await original<typeof import("@/lib/api/careers")>();
  return {
    ...real,
    careersApi: {
      ...real.careersApi,
      putForm: vi.fn(),
      getSettings: vi.fn().mockResolvedValue(null),
    },
  };
});
vi.mock("@/lib/api/client", async (original) => {
  const real = await original<typeof import("@/lib/api/client")>();
  return { ...real, tokens: { ...real.tokens, has: () => true } };
});
vi.mock("@/lib/hiring/pipeline/use-pipeline", () => ({
  useTemplates: () => ({
    items: [],
    loading: false,
    error: null,
    reload: () => undefined,
  }),
}));

const { RequisitionWizard } =
  await import("@/app/(app)/hiring/requisitions/new/wizard");

beforeEach(() => {
  push.mockReset();
  createRequisition.mockReset().mockResolvedValue({ id: "req-9" });
  createStage.mockReset().mockResolvedValue({});
  createAdvert
    .mockReset()
    .mockResolvedValue({ id: "advert-9", title: "Payroll Analyst" });
  departments.flat = [];
  staff.employees = [];
  sites.locations = [
    { id: "loc-hq", name: "Lagos HQ" },
    { id: "loc-abj", name: "Abuja office" },
    { id: "loc-abk", name: "Abeokuta site" },
  ];
});

const next = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /Continue/ }));

const ABOUT =
  "Runs the monthly payroll and answers staff questions about their pay.";

describe("what the job is", () => {
  it("will not move on until somebody says what the job is", async () => {
    const user = userEvent.setup();
    render(<RequisitionWizard />);
    await user.type(screen.getByLabelText(/Job title/), "Payroll Analyst");
    await user.selectOptions(screen.getByLabelText(/Location/), "Lagos HQ");
    expect(screen.getByRole("button", { name: /Continue/ })).toBeDisabled();

    await user.type(screen.getByLabelText(/About the role/), ABOUT);
    expect(screen.getByRole("button", { name: /Continue/ })).toBeEnabled();
  });

  it("opens the advert with it", async () => {
    const user = userEvent.setup();
    render(<RequisitionWizard />);
    await user.type(screen.getByLabelText(/Job title/), "Payroll Analyst");
    await user.type(screen.getByLabelText(/About the role/), ABOUT);
    await user.selectOptions(
      screen.getByLabelText(/Location/),
      "Abeokuta site",
    );
    await next(user);
    await user.type(screen.getByLabelText(/Band minimum/), "650000");
    await user.type(screen.getByLabelText(/Band maximum/), "900000");
    await next(user);
    await next(user);
    await next(user);
    await user.click(
      screen.getByRole("button", { name: /Save as draft advert/ }),
    );

    await waitFor(() => expect(createAdvert).toHaveBeenCalledTimes(1));
    const advert = createAdvert.mock.calls[0]?.[0] as {
      description: string;
      location: string;
    };
    expect(advert.description.startsWith(ABOUT)).toBe(true);
    expect(advert.location).toBe("Abeokuta site");
  });
});

describe("where the job is", () => {
  it("offers the company's own sites and nothing invented", () => {
    render(<RequisitionWizard />);
    const options = Array.from(
      (screen.getByLabelText(/Location/) as HTMLSelectElement).options,
    )
      .map((option) => option.textContent)
      .filter((text) => text !== "Select a location");
    expect(options).toEqual(["Lagos HQ", "Abuja office", "Abeokuta site"]);
  });

  it("takes a typed place when the company has no sites", async () => {
    sites.locations = [];
    const user = userEvent.setup();
    render(<RequisitionWizard />);
    const box = screen.getByLabelText(/Location/);
    expect(box.tagName).toBe("INPUT");
    await user.type(box, "Ibadan");
    expect(box).toHaveValue("Ibadan");
  });
});

/* UAT 23 Nov, L17 / PERF-40: the wizard said the hiring manager approves the
   role, which the API refuses while somebody else can, and offered a note "shown
   in the approval request" that was saved nowhere. */
describe("who approves the role", () => {
  it("does not say the hiring manager approves it", async () => {
    staff.employees = [
      { id: "emp-1", firstName: "Halima", lastName: "Sani", jobTitle: "Lead" },
    ];
    const user = userEvent.setup();
    render(<RequisitionWizard />);
    await user.type(screen.getByLabelText(/Job title/), "Payroll Analyst");
    await user.type(screen.getByLabelText(/About the role/), ABOUT);
    await user.selectOptions(screen.getByLabelText(/Location/), "Lagos HQ");
    await next(user);
    await user.type(screen.getByLabelText(/Band minimum/), "650000");
    await user.type(screen.getByLabelText(/Band maximum/), "900000");
    await next(user);
    await next(user);
    expect(screen.queryByText(/Approves the requisition/)).toBeNull();
    expect(
      screen.getAllByText(/not the hiring manager when someone else can/)
        .length,
    ).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/Note for approvers/)).toBeNull();
  });
});
