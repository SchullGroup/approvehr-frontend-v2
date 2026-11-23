import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";

/**
 * The requisition wizard no longer holds the advert's application form (UAT 23
 * Nov, U99 / PERF-19). The same editor was on the wizard's process step and on
 * the advert, two places for one set of questions. It is on the advert only, and
 * the wizard says so. Every hook the wizard reads is faked.
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

vi.mock("@/lib/store/work-locations", () => ({
  useWorkLocations: () => ({
    locations: [
      { id: "loc-hq", name: "Lagos HQ" },
      { id: "loc-abk", name: "Abeokuta site" },
    ],
    loading: false,
    error: null,
    source: "api",
    create: vi.fn(),
  }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({
    flat: [{ id: "dept-1", name: "Finance" }],
    loading: false,
    error: null,
  }),
}));

vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({
    employees: [
      {
        id: "emp-1",
        firstName: "Ada",
        lastName: "Obi",
        jobTitle: "Head of Finance",
      },
    ],
  }),
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

const putForm = vi.fn();
const getSettings = vi.fn();
vi.mock("@/lib/api/careers", async (original) => {
  const real = await original<typeof import("@/lib/api/careers")>();
  return {
    ...real,
    careersApi: {
      ...real.careersApi,
      putForm: (...a: unknown[]) => putForm(...a),
      getSettings: (...a: unknown[]) => getSettings(...a),
    },
  };
});

vi.mock("@/lib/api/client", async (original) => {
  const real = await original<typeof import("@/lib/api/client")>();
  return { ...real, tokens: { ...real.tokens, has: () => true } };
});

const { RequisitionWizard } =
  await import("@/app/(app)/hiring/requisitions/new/wizard");

const settings = (fileUploads = true) => ({
  branding: {
    displayName: null,
    name: "Acme Ltd",
    companyName: "Acme Ltd",
    description: null,
    websiteUrl: null,
    accentColor: null,
    logoUrl: null,
  },
  contact: { replyToEmail: null },
  consent: {
    required: false,
    text: "",
    customText: null,
    url: null,
    version: "default-1",
    isDefault: true,
    needsReview: true,
    reviewNote: null,
    standardText: "",
  },
  acknowledgement: { enabled: true, willSend: false, blockedBy: [] },
  search: { indexable: true },
  deployment: { fileUploads },
});

const pick = async (
  user: ReturnType<typeof userEvent.setup>,
  combobox: RegExp | string,
  option: string,
) => {
  await user.click(screen.getByRole("combobox", { name: combobox }));
  await user.click(
    await screen.findByRole("option", { name: new RegExp(option) }),
  );
};

/** Fill the first two steps and arrive at the process step. */
async function toProcess(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Job title/), "Payroll Analyst");
  await user.type(
    screen.getByLabelText(/About the role/),
    "Runs the monthly payroll and answers staff questions about pay.",
  );
  await pick(user, /Department/, "Finance");
  await user.selectOptions(screen.getByLabelText(/Location/), "Lagos HQ");
  await user.click(screen.getByRole("button", { name: /Continue/ }));
  await user.type(screen.getByLabelText(/Band minimum/), "650000");
  await user.type(screen.getByLabelText(/Band maximum/), "900000");
  await user.click(screen.getByRole("button", { name: /Continue/ }));
}

async function toReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Continue/ })); // process -> team
  await user.selectOptions(
    await screen.findByLabelText(/Hiring manager/),
    "emp-1",
  );
  await user.selectOptions(screen.getByLabelText(/^Recruiter/), "emp-1");
  await user.click(screen.getByRole("button", { name: /Continue/ }));
}

beforeEach(() => {
  push.mockReset();
  for (const fn of [
    createRequisition,
    createStage,
    createAdvert,
    putForm,
    getSettings,
  ])
    fn.mockReset();
  getSettings.mockResolvedValue(settings());
  createRequisition.mockResolvedValue({ id: "req-9" });
  createStage.mockResolvedValue({});
  createAdvert.mockResolvedValue({ id: "advert-9", title: "Payroll Analyst" });
  putForm.mockResolvedValue({});
});

describe("the process step", () => {
  it("holds no second editor for the application form", async () => {
    const user = userEvent.setup();
    render(<RequisitionWizard />);
    await toProcess(user);
    expect(screen.queryByRole("group", { name: "Add a question" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Preview the form/ }),
    ).toBeNull();
    expect(
      screen.getByText(/What applicants are asked is set on the advert/),
    ).toBeInTheDocument();
  });
});

describe("saving", () => {
  it("writes the role and its draft advert, and no form", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <RequisitionWizard />
      </ToastProvider>,
    );
    await toProcess(user);
    await toReview(user);
    await user.click(
      screen.getByRole("button", { name: /Save as draft advert/ }),
    );

    await waitFor(() => expect(createAdvert).toHaveBeenCalledTimes(1));
    expect(putForm).not.toHaveBeenCalled();
    expect(createRequisition.mock.calls[0]?.[0]).not.toHaveProperty(
      "screeningQuestions",
    );
    expect(
      await screen.findByText(
        /Set the advert's application questions on the advert/,
      ),
    ).toBeInTheDocument();
    expect(push).toHaveBeenCalledWith("/hiring/requisitions/req-9");
  });
});
