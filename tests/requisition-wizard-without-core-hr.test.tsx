import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A company that hires with recruitment alone has no departments and no staff list.
 *
 * The wizard used to ask for a department and then for a hiring manager and a
 * recruiter picked from the staff, all required: with nothing to choose from, the
 * role could never be made. Where there is nothing to choose from, the box is not
 * required and the step says why; the people who will hire are invited to the role
 * afterwards.
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
});

const next = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /Continue/ }));

describe("a company with no departments and no staff on file", () => {
  it("can be finished: department and the hiring team are not asked for, and it says why", async () => {
    const user = userEvent.setup();
    render(<RequisitionWizard />);

    await user.type(screen.getByLabelText(/Job title/), "Payroll Analyst");
    /* The help is on the label twice: once for a screen reader, once on hover. */
    expect(
      screen.getAllByText(/Your company has no departments set up/).length,
    ).toBeGreaterThan(0);
    await user.selectOptions(screen.getByLabelText(/Location/), "Lagos, NG");
    await next(user);
    await user.type(screen.getByLabelText(/Band minimum/), "650000");
    await user.type(screen.getByLabelText(/Band maximum/), "900000");
    await next(user);
    await next(user);

    expect(
      await screen.findByText("There is no staff list to choose from"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/invite the people who will hire for it, by email/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Hiring manager/)).not.toBeInTheDocument();
    await next(user);
    await user.click(
      screen.getByRole("button", { name: /Save as draft advert/ }),
    );

    await waitFor(() => expect(createRequisition).toHaveBeenCalledTimes(1));
    const body = createRequisition.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({ jobTitle: "Payroll Analyst" });
    expect(body).not.toHaveProperty("departmentId");
    expect(body).not.toHaveProperty("hiringManagerId");
  });

  it("still asks for all of it where the company has departments and staff", async () => {
    departments.flat = [{ id: "dept-1", name: "Finance" }];
    staff.employees = [
      { id: "emp-1", firstName: "Ada", lastName: "Obi", jobTitle: "Head" },
    ];
    const user = userEvent.setup();
    render(<RequisitionWizard />);
    await user.type(screen.getByLabelText(/Job title/), "Payroll Analyst");
    await user.selectOptions(screen.getByLabelText(/Location/), "Lagos, NG");
    expect(
      screen.queryByText(/Your company has no departments set up/),
    ).not.toBeInTheDocument();
    /* No department chosen, so the first step is not complete and Continue does not go on. */
    await next(user);
    expect(screen.getByLabelText(/Job title/)).toBeInTheDocument();
  });
});

describe("a confidential search", () => {
  const toTeamStep = async (user: ReturnType<typeof userEvent.setup>) => {
    render(<RequisitionWizard />);
    await user.type(screen.getByLabelText(/Job title/), "Payroll Analyst");
    await user.selectOptions(screen.getByLabelText(/Location/), "Lagos, NG");
    await next(user);
    await user.type(screen.getByLabelText(/Band minimum/), "650000");
    await user.type(screen.getByLabelText(/Band maximum/), "900000");
    await next(user);
    await next(user);
    await screen.findByText("There is no staff list to choose from");
  };

  it("is off unless somebody turns it on, and saying so is sent in the same request that makes the role", async () => {
    const user = userEvent.setup();
    await toTeamStep(user);
    const toggle = screen.getByRole("switch", { name: /Confidential search/ });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(toggle).toBeChecked();
    await next(user);
    await user.click(
      screen.getByRole("button", { name: /Save as draft advert/ }),
    );
    await waitFor(() => expect(createRequisition).toHaveBeenCalledTimes(1));
    expect(createRequisition.mock.calls[0]?.[0]).toMatchObject({
      restricted: true,
    });
  });

  it("sends nothing about it when it is left off", async () => {
    const user = userEvent.setup();
    await toTeamStep(user);
    await next(user);
    await user.click(
      screen.getByRole("button", { name: /Save as draft advert/ }),
    );
    await waitFor(() => expect(createRequisition).toHaveBeenCalledTimes(1));
    expect(createRequisition.mock.calls[0]?.[0]).not.toHaveProperty(
      "restricted",
    );
  });

  it("says who keeps sight of it and what changing it later involves", async () => {
    const user = userEvent.setup();
    await toTeamStep(user);
    expect(
      screen.getAllByText(/You are added, so you keep access/).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/under Who can see this job/).length,
    ).toBeGreaterThan(0);
  });
});
