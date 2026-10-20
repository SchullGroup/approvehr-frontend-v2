import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineTemplate } from "@/lib/hiring/pipeline/model";

/**
 * The wizard picks the role's pipeline from the company's templates.
 *
 * It used to offer five checkboxes and create the role's stages one request at a
 * time. A company with templates now chooses one — the default is already chosen —
 * and the API copies it, so the wizard sends the template's id and creates no
 * stages itself. A company with no templates still gets the five it always had.
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

let templates: PipelineTemplate[] = [];
vi.mock("@/lib/hiring/pipeline/use-pipeline", () => ({
  useTemplates: () => ({
    items: templates,
    loading: false,
    error: null,
    reload: () => undefined,
  }),
}));

const { RequisitionWizard } =
  await import("@/app/(app)/hiring/requisitions/new/wizard");

const stage = (
  id: string,
  name: string,
  type: PipelineTemplate["stages"][number]["type"],
) => ({
  id,
  name,
  type,
  requiresScorecards: false,
});

const TEMPLATES: PipelineTemplate[] = [
  {
    id: "t-std",
    name: "Standard hiring",
    isDefault: true,
    stages: [
      stage("1", "Applied", "APPLIED"),
      stage("2", "Interview", "INTERVIEW"),
      stage("3", "Hired", "HIRED"),
    ],
  },
  {
    id: "t-camp",
    name: "Boot camp intake",
    isDefault: false,
    stages: [
      stage("4", "Applied", "APPLIED"),
      stage("5", "Online assessment", "TEST"),
      stage("6", "Admitted", "HIRED"),
    ],
  },
];

async function toProcess(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Job title/), "Payroll Analyst");
  await user.click(screen.getByRole("combobox", { name: /Department/ }));
  await user.click(await screen.findByRole("option", { name: /Finance/ }));
  await user.selectOptions(screen.getByLabelText(/Location/), "Lagos, NG");
  await user.click(screen.getByRole("button", { name: /Continue/ }));
  await user.type(screen.getByLabelText(/Band minimum/), "650000");
  await user.type(screen.getByLabelText(/Band maximum/), "900000");
  await user.click(screen.getByRole("button", { name: /Continue/ }));
}

async function save(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Continue/ }));
  await user.selectOptions(
    await screen.findByLabelText(/Hiring manager/),
    "emp-1",
  );
  await user.selectOptions(screen.getByLabelText(/^Recruiter/), "emp-1");
  await user.click(screen.getByRole("button", { name: /Continue/ }));
  await user.click(
    screen.getByRole("button", { name: /Save as draft advert/ }),
  );
}

beforeEach(() => {
  push.mockReset();
  createRequisition.mockReset().mockResolvedValue({ id: "req-9" });
  createStage.mockReset().mockResolvedValue({});
  createAdvert
    .mockReset()
    .mockResolvedValue({ id: "advert-9", title: "Payroll Analyst" });
  templates = TEMPLATES;
});

describe("the pipeline step", () => {
  it("offers the company's templates, with the default already chosen", async () => {
    const user = userEvent.setup();
    render(<RequisitionWizard />);
    await toProcess(user);
    const standard = screen.getByRole("radio", {
      name: /Standard hiring \(default\)/,
    });
    expect(standard).toBeChecked();
    expect(
      screen.getByRole("radio", { name: /Boot camp intake/ }),
    ).not.toBeChecked();
    expect(
      screen.getByText("Applied → Online assessment → Admitted"),
    ).toBeInTheDocument();
  });

  it("says the role copies it, and that later changes to the template leave the role alone", async () => {
    const user = userEvent.setup();
    render(<RequisitionWizard />);
    await toProcess(user);
    /* The help is on the legend twice: once for a screen reader, once on hover. */
    expect(
      screen.getAllByText(/The role copies this pipeline when it is created/)
        .length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        /changing the template later does not change this role/,
      ).length,
    ).toBeGreaterThan(0);
  });

  it("no longer offers the five fixed checkboxes", async () => {
    const user = userEvent.setup();
    render(<RequisitionWizard />);
    await toProcess(user);
    expect(
      screen.queryByRole("checkbox", { name: /Pre-screening/ }),
    ).not.toBeInTheDocument();
  });
});

describe("saving", () => {
  it("sends the chosen template's id and creates no stages itself", async () => {
    const user = userEvent.setup();
    render(<RequisitionWizard />);
    await toProcess(user);
    await user.click(screen.getByRole("radio", { name: /Boot camp intake/ }));
    await save(user);
    await waitFor(() => expect(createRequisition).toHaveBeenCalledTimes(1));
    expect(createRequisition.mock.calls[0]?.[0]).toMatchObject({
      pipelineTemplateId: "t-camp",
    });
    expect(createStage).not.toHaveBeenCalled();
  });

  it("sends the default's id when nothing was changed", async () => {
    const user = userEvent.setup();
    render(<RequisitionWizard />);
    await toProcess(user);
    await save(user);
    await waitFor(() => expect(createRequisition).toHaveBeenCalledTimes(1));
    expect(createRequisition.mock.calls[0]?.[0]).toMatchObject({
      pipelineTemplateId: "t-std",
    });
  });

  it("shows the chosen template on the review step", async () => {
    const user = userEvent.setup();
    render(<RequisitionWizard />);
    await toProcess(user);
    await user.click(screen.getByRole("radio", { name: /Boot camp intake/ }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await user.selectOptions(
      await screen.findByLabelText(/Hiring manager/),
      "emp-1",
    );
    await user.selectOptions(screen.getByLabelText(/^Recruiter/), "emp-1");
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(
      screen.getAllByText(
        /Boot camp intake: Applied → Online assessment → Admitted/,
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe("a company with no templates", () => {
  it("is given the five stages it always had, and they are made one by one", async () => {
    templates = [];
    const user = userEvent.setup();
    render(<RequisitionWizard />);
    await toProcess(user);
    expect(
      screen.getByRole("checkbox", { name: /Pre-screening/ }),
    ).toBeInTheDocument();
    await save(user);
    await waitFor(() => expect(createStage).toHaveBeenCalledTimes(5));
    expect(createRequisition.mock.calls[0]?.[0]).not.toHaveProperty(
      "pipelineTemplateId",
    );
  });
});
