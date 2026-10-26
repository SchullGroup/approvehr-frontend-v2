import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiForm, ApiFormQuestion } from "@/lib/api/careers";

/**
 * An advert's screen against the API: the form it reads, the body it writes, and
 * what it does with a refusal. The API is the only fake; the screen is real.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/hiring/postings/post-1",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api/client", async (original) => {
  const real = await original<typeof import("@/lib/api/client")>();
  return { ...real, tokens: { ...real.tokens, has: () => true } };
});

vi.mock("@/lib/permissions", () => ({
  usePermissions: () => ({ can: () => true, loading: false }),
  useCan: () => true,
}));

const getPosting = vi.fn();
const getForm = vi.fn();
const putForm = vi.fn();
const getSettings = vi.fn();
const shareLinks = vi.fn();

vi.mock("@/lib/api/careers", async (original) => {
  const real = await original<typeof import("@/lib/api/careers")>();
  return {
    ...real,
    careersApi: {
      ...real.careersApi,
      getPosting: (...a: unknown[]) => getPosting(...a),
      getForm: (...a: unknown[]) => getForm(...a),
      putForm: (...a: unknown[]) => putForm(...a),
      getSettings: (...a: unknown[]) => getSettings(...a),
      shareLinks: (...a: unknown[]) => shareLinks(...a),
    },
  };
});

const { PostingScreen } =
  await import("@/app/(app)/hiring/postings/[id]/posting-screen");

const Q1 = "0198c0de-0000-7000-8000-000000000001";
const Q2 = "0198c0de-0000-7000-8000-000000000002";
const NEW = "0198c0de-0000-7000-8000-000000000003";

const apiQ = (over: Partial<ApiFormQuestion> = {}): ApiFormQuestion => ({
  id: Q1,
  order: 0,
  kind: "YES_NO",
  label: "Right to work in Nigeria?",
  helpText: null,
  required: true,
  maxWords: null,
  minValue: null,
  maxValue: null,
  choices: null,
  knockout: { flagWhen: false },
  origin: null,
  answerCount: 7,
  ...over,
});

const form = (
  questions: ApiFormQuestion[] = [
    apiQ(),
    apiQ({
      id: Q2,
      kind: "SHORT_TEXT",
      label: "Job title",
      required: false,
      knockout: null,
      answerCount: 0,
    }),
  ],
): ApiForm => ({
  postingId: "post-1",
  formVersion: 4,
  applications: 7,
  settings: {
    phoneMode: "OPTIONAL",
    cvMode: "OPTIONAL",
    coverNoteMode: "OPTIONAL",
  },
  questions,
  limits: {
    maxQuestions: 20,
    maxFileQuestions: 3,
    maxChoices: 30,
    labelChars: 300,
    helpTextChars: 500,
    choiceLabelChars: 120,
    longTextMaxWords: 1000,
  },
  kinds: [],
});

const settings = (over: Record<string, unknown> = {}) => ({
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
    required: true,
    text: "We keep it.",
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
  deployment: { fileUploads: true },
  ...over,
});

const posting = (over: Record<string, unknown> = {}) => ({
  id: "post-1",
  slug: "payroll-analyst",
  title: "Payroll Analyst",
  summary: "Run payroll.",
  description: "Run payroll for four hundred people every month.",
  descriptionHtml: null,
  location: "Lagos",
  employmentType: "FULL_TIME",
  showSalary: false,
  salaryMinKobo: null,
  salaryMaxKobo: null,
  status: "PUBLISHED",
  publishedAt: "2026-10-01T09:00:00.000Z",
  closesOn: null,
  acceptingApplications: true,
  requisitionId: null,
  requisitionReference: null,
  requisitionStatus: null,
  applicationCount: 7,
  publicPath: "/acme/payroll-analyst",
  createdAt: "2026-10-01T09:00:00.000Z",
  applications: { waiting: 1, advanced: 0, declined: 0, withdrawn: 0 },
  ...over,
});

const links = (live = true) => ({
  postingId: "post-1",
  live,
  page: "https://approvehr.io/careers/acme/payroll-analyst",
  links: [
    {
      channel: "careers-page",
      label: "Your careers page",
      url: "https://approvehr.io/careers/acme/payroll-analyst?src=careers-page",
      shareUrl: null,
    },
    {
      channel: "linkedin",
      label: "LinkedIn",
      url: "https://approvehr.io/careers/acme/payroll-analyst?src=linkedin",
      shareUrl: "https://www.linkedin.com/sharing/share-offsite/?url=x",
    },
  ],
});

const mount = () =>
  render(
    <ToastProvider>
      <PostingScreen id="post-1" />
    </ToastProvider>,
  );

const cards = () => screen.getAllByTestId("form-question");

beforeEach(() => {
  for (const fn of [getPosting, getForm, putForm, getSettings, shareLinks])
    fn.mockReset();
  getPosting.mockResolvedValue(posting());
  getForm.mockResolvedValue(form());
  getSettings.mockResolvedValue(settings());
  shareLinks.mockResolvedValue(links());
});

describe("reading the form", () => {
  it("shows the API's questions, their order and how many people answered each", async () => {
    mount();
    await screen.findAllByTestId("form-question");
    expect(cards()).toHaveLength(2);
    expect(within(cards()[0]!).getByLabelText(/^Question/)).toHaveValue(
      "Right to work in Nigeria?",
    );
    expect(
      within(cards()[0]!).getByText("Knockout", { selector: "span" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/7 people have applied/)).toBeInTheDocument();
  });

  it("fixes the kind of a question people have answered, and explains it", async () => {
    mount();
    await screen.findAllByTestId("form-question");
    const answered = within(cards()[0]!).getByLabelText("Kind of answer");
    expect(answered).toBeDisabled();
    expect(answered).toHaveAccessibleDescription(
      /7 applications have answered this/,
    );
    expect(within(cards()[1]!).getByLabelText("Kind of answer")).toBeEnabled();
  });

  it("reads a knockout that flags a No as 'flag when the answer is No'", async () => {
    mount();
    await screen.findAllByTestId("form-question");
    expect(
      within(cards()[0]!).getByLabelText("Flag it when the answer is"),
    ).toHaveValue("NO");
  });

  it("shows the API's links, and an Open link only where the site has a share page", async () => {
    mount();
    const rows = await screen.findAllByTestId("share-link");
    expect(rows).toHaveLength(2);
    expect(
      within(rows[0]!).queryByRole("link", { name: /Open/ }),
    ).not.toBeInTheDocument();
    expect(
      within(rows[1]!).getByRole("link", { name: /Open/ }),
    ).toHaveAttribute(
      "href",
      "https://www.linkedin.com/sharing/share-offsite/?url=x",
    );
    expect(
      within(rows[1]!).getByRole("link", { name: /Open/ }),
    ).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("offers the spreadsheet of applications only when connected", async () => {
    mount();
    await screen.findAllByTestId("form-question");
    expect(
      screen.getByRole("button", { name: "Export applications" }),
    ).toBeInTheDocument();
  });

  it("says a refused read was refused, in the API's own sentence", async () => {
    getForm.mockRejectedValueOnce(
      new ApiError(
        403,
        "forbidden",
        "You need the following to do that: Manage hiring.",
      ),
    );
    mount();
    expect(
      await screen.findByText(
        /You need the following to do that: Manage hiring\./,
      ),
    ).toBeInTheDocument();
  });
});

describe("saving the form", () => {
  it("sends the whole list in order, with the ids it knows and none for what is new", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findAllByTestId("form-question");
    putForm.mockResolvedValue(
      form([
        apiQ(),
        apiQ({
          id: Q2,
          kind: "SHORT_TEXT",
          label: "Job title",
          required: false,
          knockout: null,
          answerCount: 0,
        }),
        apiQ({
          id: NEW,
          kind: "LONG_TEXT",
          label: "Why us?",
          required: false,
          knockout: null,
          maxWords: 150,
          answerCount: 0,
        }),
      ]),
    );

    await user.click(
      within(screen.getByRole("group", { name: "Add a question" })).getByRole(
        "button",
        { name: /^Long answer/ },
      ),
    );
    await user.type(within(cards()[2]!).getByLabelText(/^Question/), "Why us?");
    await user.click(screen.getByRole("button", { name: /Save form/ }));

    await waitFor(() => expect(putForm).toHaveBeenCalledTimes(1));
    const [postingId, body] = putForm.mock.calls[0] as [
      string,
      { settings: unknown; questions: Record<string, unknown>[] },
    ];
    expect(postingId).toBe("post-1");
    expect(body.settings).toEqual({
      phoneMode: "OPTIONAL",
      cvMode: "OPTIONAL",
      coverNoteMode: "OPTIONAL",
    });
    expect(body.questions.map((x) => x["label"])).toEqual([
      "Right to work in Nigeria?",
      "Job title",
      "Why us?",
    ]);
    expect(body.questions[0]).toMatchObject({
      id: Q1,
      kind: "YES_NO",
      required: true,
      knockout: { flagWhen: false },
    });
    expect(body.questions[1]).toMatchObject({ id: Q2, kind: "SHORT_TEXT" });
    expect(body.questions[2]).not.toHaveProperty("id");
    expect(body.questions[2]).toMatchObject({
      kind: "LONG_TEXT",
      maxWords: 150,
    });
  });

  it("shows the form as the API now holds it, new ids and all, and is not left looking unsaved", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findAllByTestId("form-question");
    const after = form([
      apiQ(),
      apiQ({
        id: Q2,
        kind: "SHORT_TEXT",
        label: "Job title",
        required: false,
        knockout: null,
        answerCount: 0,
      }),
      apiQ({
        id: NEW,
        kind: "URL",
        label: "Portfolio",
        required: false,
        knockout: null,
        answerCount: 0,
      }),
    ]);
    putForm.mockResolvedValue(after);
    /* What a read after the write returns: the form as it now stands. */
    getForm.mockResolvedValue(after);
    await user.click(
      within(screen.getByRole("group", { name: "Add a question" })).getByRole(
        "button",
        { name: /^Web link/ },
      ),
    );
    await user.type(
      within(cards()[2]!).getByLabelText(/^Question/),
      "Portfolio",
    );
    await user.click(screen.getByRole("button", { name: /Save form/ }));

    await waitFor(() =>
      expect(screen.queryAllByText("Unsaved changes")).toHaveLength(0),
    );
    expect(cards()).toHaveLength(3);
    expect(screen.getByRole("button", { name: /Save form/ })).toBeDisabled();
  });

  it("keeps showing what was just saved while the re-read is still on its way", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findAllByTestId("form-question");
    const after = form([
      apiQ(),
      apiQ({
        id: Q2,
        kind: "SHORT_TEXT",
        label: "Job title",
        required: false,
        knockout: null,
        answerCount: 0,
      }),
      apiQ({
        id: NEW,
        kind: "URL",
        label: "Portfolio",
        required: false,
        knockout: null,
        answerCount: 0,
      }),
    ]);
    putForm.mockResolvedValue(after);
    let answer: (value: ApiForm) => void = () => {};
    getForm.mockImplementation(
      () =>
        new Promise<ApiForm>((resolve) => {
          answer = resolve;
        }),
    );
    await user.click(
      within(screen.getByRole("group", { name: "Add a question" })).getByRole(
        "button",
        { name: /^Web link/ },
      ),
    );
    await user.type(
      within(cards()[2]!).getByLabelText(/^Question/),
      "Portfolio",
    );
    await user.click(screen.getByRole("button", { name: /Save form/ }));

    /* The old two-question form is what the API would still say if asked this
       instant; the screen must not fall back to it. */
    await waitFor(() => expect(getForm).toHaveBeenCalledTimes(2));
    expect(cards()).toHaveLength(3);
    expect(screen.queryAllByText("Unsaved changes")).toHaveLength(0);
    answer(after);
    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(screen.queryAllByText("Unsaved changes")).toHaveLength(0);
  });

  it("sends nothing and marks the question when it is not finished", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findAllByTestId("form-question");
    await user.click(
      within(screen.getByRole("group", { name: "Add a question" })).getByRole(
        "button",
        { name: /^Short answer/ },
      ),
    );
    await user.click(screen.getByRole("button", { name: /Save form/ }));
    expect(await screen.findByText("Write the question.")).toBeInTheDocument();
    expect(putForm).not.toHaveBeenCalled();
  });

  it("puts the API's refusal under the question it names and keeps the work", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findAllByTestId("form-question");
    putForm.mockRejectedValueOnce(
      new ApiError(400, "validation_failed", "Check the form.", [
        {
          field: "questions.1.label",
          message: "Keep the question under 300 characters.",
        },
      ]),
    );
    await user.click(
      screen.getByRole("button", { name: "Move question 2 up" }),
    );
    await user.click(screen.getByRole("button", { name: /Save form/ }));

    /* After the move the refused question (index 1) is the original first one. */
    expect(
      await screen.findByText("Keep the question under 300 characters."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Unsaved changes").length).toBeGreaterThan(0);
    expect(cards()).toHaveLength(2);
  });

  it("says why when the API refuses the whole thing, and keeps what was typed", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findAllByTestId("form-question");
    putForm.mockRejectedValueOnce(
      new ApiError(
        403,
        "forbidden",
        "You need the following to do that: Manage hiring.",
      ),
    );
    await user.click(
      screen.getByRole("button", { name: "Move question 2 up" }),
    );
    await user.click(screen.getByRole("button", { name: /Save form/ }));
    await waitFor(() => expect(putForm).toHaveBeenCalled());
    expect(screen.getAllByText("Unsaved changes").length).toBeGreaterThan(0);
  });

  it("warns that a live form can be edited, and what that does to answers already given", async () => {
    mount();
    await screen.findAllByTestId("form-question");
    const note = screen.getByText("This advert is live");
    const text = note.closest("div.rounded-lg")?.textContent ?? "";
    expect(text).toContain("Changes apply to the next applicant");
    expect(text).toContain("keep the question as it was asked");
    expect(text).toContain("cannot change its kind");
  });
});
