import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * The requisition wizard's process step used to collect screening questions and
 * send them nowhere ("Not asked of applicants yet, and not saved"). It now holds
 * the real form builder, and once the role and its draft advert exist, the form
 * goes onto the advert. Every hook the wizard reads is faked; what is under test
 * is what the wizard does with the form.
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
  await pick(user, /Department/, "Finance");
  await user.selectOptions(screen.getByLabelText(/Location/), "Lagos, NG");
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

/** The question box of the n-th question card. */
const questionBox = (n: number) =>
  within(
    screen.getByRole("region", { name: new RegExp(`^Question ${n}:`) }),
  ).getByLabelText(/^Question/);

const addQuestion = async (
  user: ReturnType<typeof userEvent.setup>,
  kind: RegExp,
) =>
  user.click(
    within(screen.getByRole("group", { name: "Add a question" })).getByRole(
      "button",
      { name: kind },
    ),
  );

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
  it("holds the real builder, not a note saying questions go nowhere", async () => {
    const user = userEvent.setup();
    render(<RequisitionWizard />);
    await toProcess(user);

    expect(screen.getByText("The application form")).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Add a question" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Not asked of applicants yet/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/the application form takes no questions today/),
    ).not.toBeInTheDocument();
  });

  it("states what a knockout is where the switch is", async () => {
    const user = userEvent.setup();
    render(<RequisitionWizard />);
    await toProcess(user);
    await addQuestion(user, /^Yes or no/);
    expect(
      screen.getByRole("switch", { name: "Knockout question" }),
    ).toHaveAccessibleDescription(
      "A knockout flags the application for a person to review. It never rejects anyone.",
    );
  });

  it("previews the form as an applicant sees it, and says nothing is sent", async () => {
    const user = userEvent.setup();
    render(<RequisitionWizard />);
    await toProcess(user);
    await addQuestion(user, /^Short answer/);
    await user.type(questionBox(1), "Current job title");
    await user.click(screen.getByRole("button", { name: "Preview the form" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByLabelText(/Current job title/),
    ).toBeInTheDocument();
    expect(within(dialog).getByTestId("apply-mode-note")).toHaveTextContent(
      /Nothing you do here is sent or saved/,
    );
  });

  it("marks an unfinished question when Continue is pressed, instead of silently doing nothing", async () => {
    const user = userEvent.setup();
    render(<RequisitionWizard />);
    await toProcess(user);
    await addQuestion(user, /^Short answer/);

    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(await screen.findByText("Write the question.")).toBeInTheDocument();
    expect(screen.getByText("The application form")).toBeInTheDocument();

    await user.type(questionBox(1), "Current job title");
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(await screen.findByLabelText(/Hiring manager/)).toBeInTheDocument();
  });

  it("will not offer a file question where there is nowhere to store the file", async () => {
    getSettings.mockResolvedValue(settings(false));
    const user = userEvent.setup();
    render(<RequisitionWizard />);
    await toProcess(user);
    await waitFor(() =>
      expect(
        within(screen.getByRole("group", { name: "Add a question" })).getByRole(
          "button",
          { name: /^File/ },
        ),
      ).toBeDisabled(),
    );
  });
});

describe("saving the role", () => {
  it("puts the form on the advert once it exists, in the order built, and says the advert's form is real", async () => {
    const user = userEvent.setup();
    render(<RequisitionWizard />);
    await toProcess(user);
    await addQuestion(user, /^Yes or no/);
    await user.type(questionBox(1), "Right to work in Nigeria?");
    await user.click(screen.getByRole("switch", { name: "Required" }));
    await user.click(screen.getByRole("switch", { name: "Knockout question" }));
    await addQuestion(user, /^Long answer/);
    await user.type(questionBox(2), "Why this job?");
    await toReview(user);

    expect(screen.getByText("Form questions")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Save as draft advert/ }),
    );

    await waitFor(() => expect(putForm).toHaveBeenCalledTimes(1));
    const [postingId, body] = putForm.mock.calls[0] as [
      string,
      { questions: Record<string, unknown>[] },
    ];
    expect(postingId).toBe("advert-9");
    expect(body.questions.map((q) => q["label"])).toEqual([
      "Right to work in Nigeria?",
      "Why this job?",
    ]);
    expect(body.questions[0]).toMatchObject({
      kind: "YES_NO",
      required: true,
      knockout: { flagWhen: false },
    });
    expect(body.questions[0]).not.toHaveProperty("id");
    expect(body.questions[1]).toMatchObject({
      kind: "LONG_TEXT",
      maxWords: 150,
    });
    /* The form is written after the advert it belongs to exists. */
    expect(createAdvert.mock.invocationCallOrder[0]!).toBeLessThan(
      putForm.mock.invocationCallOrder[0]!,
    );
    expect(push).toHaveBeenCalledWith("/hiring/requisitions/req-9");
  });

  it("sends no form at all when it was left as the API would start it", async () => {
    const user = userEvent.setup();
    render(<RequisitionWizard />);
    await toProcess(user);
    await toReview(user);
    await user.click(
      screen.getByRole("button", { name: /Save as draft advert/ }),
    );
    await waitFor(() => expect(createAdvert).toHaveBeenCalled());
    expect(putForm).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/hiring/requisitions/req-9");
  });

  it("sends the standard switches too, even with no questions, when they were changed", async () => {
    const user = userEvent.setup();
    render(<RequisitionWizard />);
    await toProcess(user);
    await user.click(
      within(
        screen.getByRole("radiogroup", { name: "Phone number" }),
      ).getByRole("radio", { name: "Required" }),
    );
    await toReview(user);
    await user.click(
      screen.getByRole("button", { name: /Save as draft advert/ }),
    );
    await waitFor(() => expect(putForm).toHaveBeenCalledTimes(1));
    expect(putForm.mock.calls[0]?.[1]).toMatchObject({
      settings: {
        phoneMode: "REQUIRED",
        cvMode: "OPTIONAL",
        coverNoteMode: "OPTIONAL",
      },
      questions: [],
    });
  });

  it("keeps the role and the advert when the form is refused, says so, and sends them to the advert to set it up again", async () => {
    const user = userEvent.setup();
    putForm.mockRejectedValueOnce(
      new ApiError(
        400,
        "validation_failed",
        "A form can have at most 20 questions.",
      ),
    );
    render(<RequisitionWizard />);
    await toProcess(user);
    await addQuestion(user, /^Short answer/);
    await user.type(questionBox(1), "Current job title");
    await toReview(user);
    await user.click(
      screen.getByRole("button", { name: /Save as draft advert/ }),
    );

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/hiring/postings/advert-9"),
    );
    expect(createRequisition).toHaveBeenCalledTimes(1);
    expect(createAdvert).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalledWith("/hiring/requisitions/req-9");
  });
});
