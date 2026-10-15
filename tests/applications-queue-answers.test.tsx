import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiApplication } from "@/lib/api/careers";

/**
 * The queue's three new things: a calm marker on an application that needs a
 * person's look, a marker (never a merge) on a possible duplicate, and the answers
 * and consent behind a row, fetched when somebody asks for them.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/hiring/postings/applications",
}));

vi.mock("@/lib/api/client", async (original) => {
  const real = await original<typeof import("@/lib/api/client")>();
  return { ...real, tokens: { ...real.tokens, has: () => true } };
});

let allowed = true;
vi.mock("@/lib/permissions", () => ({
  usePermissions: () => ({ can: () => true, loading: false }),
  useCan: () => allowed,
}));

vi.mock("@/lib/store/recruitment", () => ({
  useRequisitions: () => ({
    requisitions: [],
    total: 0,
    loading: false,
    error: null,
    connected: true,
    reload: () => {},
  }),
}));

vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
  useSession: () => ({ isConnected: true, isLoading: false }),
}));

const listApplications = vi.fn();
const listPostings = vi.fn();
const analytics = vi.fn();
const getApplication = vi.fn();
const openAnswerFile = vi.fn();

vi.mock("@/lib/api/careers", async (original) => {
  const real = await original<typeof import("@/lib/api/careers")>();
  return {
    ...real,
    careersApi: {
      ...real.careersApi,
      listApplications: (...a: unknown[]) => listApplications(...a),
      listPostings: (...a: unknown[]) => listPostings(...a),
      analytics: (...a: unknown[]) => analytics(...a),
      getApplication: (...a: unknown[]) => getApplication(...a),
      openAnswerFile: (...a: unknown[]) => openAnswerFile(...a),
    },
  };
});

const { ApplicationsScreen } =
  await import("@/app/(app)/hiring/postings/applications/applications-screen");

const application = (n: number, over: Partial<ApiApplication> = {}) =>
  ({
    id: `app-${n}`,
    postingId: "post-1",
    postingTitle: "Payroll Analyst",
    firstName: "Applicant",
    lastName: String(n),
    name: `Applicant ${n}`,
    email: `applicant${n}@example.com`,
    phone: null,
    coverNote: null,
    source: null,
    status: "RECEIVED",
    screenedAt: null,
    declineReason: null,
    candidateId: null,
    cv: null,
    appliedAt: "2026-10-01T09:00:00.000Z",
    reference: `APP-${n}`,
    knockoutCount: 0,
    duplicate: null,
    ...over,
  }) as ApiApplication;

const serve = (rows: ApiApplication[]) =>
  listApplications.mockResolvedValue({
    data: rows,
    meta: {
      total: rows.length,
      nextCursor: null,
      page: 1,
      pageSize: 50,
      totalPages: 1,
      hasMore: false,
    },
  });

const rowOf = (name: string) =>
  screen.getByText(name).closest("div.rounded-md") as HTMLElement;

const open = () => render(<ApplicationsScreen initialStatus="ALL" />);

beforeEach(() => {
  allowed = true;
  for (const fn of [
    listApplications,
    listPostings,
    analytics,
    getApplication,
    openAnswerFile,
  ])
    fn.mockReset();
  listPostings.mockResolvedValue({
    data: [
      {
        id: "post-1",
        title: "Payroll Analyst",
        requisitionId: "r",
        requisitionReference: "REQ-1",
        requisitionStatus: "OPEN",
      },
    ],
    meta: { total: 1 },
  });
  analytics.mockResolvedValue({
    totals: {},
    perPosting: [],
    perSource: [{ source: "linkedin", applications: 2, share: 100 }],
    cvNote: null,
  });
});

describe("what the row says before anything is opened", () => {
  it("marks one that needs a look, calmly, and one that may be a duplicate, with a way to the earlier one", async () => {
    serve([
      application(3, { knockoutCount: 1 }),
      application(2, {
        duplicate: { ofId: "earlier-1", reason: "SAME_PHONE" },
      }),
      application(1),
    ]);
    open();
    await screen.findByText("Applicant 3");

    const flagged = rowOf("Applicant 3");
    expect(within(flagged).getByText("Needs a look")).toBeInTheDocument();
    expect(
      within(flagged).queryByText("Possible duplicate"),
    ).not.toBeInTheDocument();
    /* It does not change the row's status or take its buttons away. */
    expect(within(flagged).getByText("Waiting")).toBeInTheDocument();
    expect(
      within(flagged).getByRole("button", { name: "Advance" }),
    ).toBeEnabled();

    const duplicate = rowOf("Applicant 2");
    expect(
      within(duplicate).getByText("Possible duplicate"),
    ).toBeInTheDocument();
    expect(duplicate).toHaveTextContent(
      "Gave the same phone number as an earlier application.",
    );
    expect(
      within(duplicate).getByRole("link", { name: "See the earlier one" }),
    ).toHaveAttribute("href", "/hiring/candidates/earlier-1");

    const plain = rowOf("Applicant 1");
    expect(within(plain).queryByText("Needs a look")).not.toBeInTheDocument();
    expect(
      within(plain).queryByText("Possible duplicate"),
    ).not.toBeInTheDocument();
  });

  it("shows the reference they were given and where they came from, by name", async () => {
    serve([application(1, { source: "linkedin", reference: "APP-7K2M9Q3X" })]);
    open();
    await screen.findByText("Applicant 1");
    const row = rowOf("Applicant 1");
    expect(row).toHaveTextContent("Ref APP-7K2M9Q3X");
    expect(row).toHaveTextContent("Heard: LinkedIn");
  });

  it("does not mention a flag or a duplicate for an API that predates them", async () => {
    const old = application(1);
    delete (old as Partial<ApiApplication>).reference;
    delete (old as Partial<ApiApplication>).knockoutCount;
    delete (old as Partial<ApiApplication>).duplicate;
    serve([old]);
    open();
    await screen.findByText("Applicant 1");
    const row = rowOf("Applicant 1");
    expect(row).not.toHaveTextContent("Needs a look");
    expect(row).not.toHaveTextContent("Ref ");
  });
});

describe("filtering to the ones that need a look", () => {
  it("asks the API for flagged ones only, and for duplicates only, and says which it is showing", async () => {
    const user = userEvent.setup();
    serve([application(1)]);
    open();
    await screen.findByText("Applicant 1");
    expect(listApplications.mock.calls.at(-1)?.[0]).not.toHaveProperty(
      "flagged",
    );

    /* The controls are behind the bar's own Filters button. */
    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(screen.getByRole("checkbox", { name: /Needs a look/ }));
    await waitFor(() =>
      expect(listApplications.mock.calls.at(-1)?.[0]).toMatchObject({
        flagged: true,
      }),
    );
    /* Applied filters stay visible outside the closed panel, as chips. */
    expect(screen.getAllByText("Needs a look").length).toBeGreaterThan(1);

    await user.click(
      screen.getByRole("checkbox", { name: /Possible duplicates/ }),
    );
    await waitFor(() =>
      expect(listApplications.mock.calls.at(-1)?.[0]).toMatchObject({
        flagged: true,
        duplicate: true,
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: /Clear all|Clear the search and filters/,
      }),
    );
    await waitFor(() =>
      expect(listApplications.mock.calls.at(-1)?.[0]).not.toHaveProperty(
        "flagged",
      ),
    );
  });

  it("lists sources by their proper names in the filter", async () => {
    const user = userEvent.setup();
    serve([application(1)]);
    open();
    await screen.findByText("Applicant 1");
    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "LinkedIn" })).toHaveValue(
        "linkedin",
      ),
    );
  });
});

describe("the answers behind a row", () => {
  const detail = () => ({
    ...application(1, {
      knockoutCount: 1,
      reference: "APP-1",
      source: "linkedin",
    }),
    otherApplications: [],
    answers: [
      {
        id: "ans-1",
        questionId: "q1",
        position: 0,
        kind: "YES_NO",
        question: "Right to work in Nigeria?",
        value: false,
        display: "No",
        flagged: true,
        flagReason: 'Answered No to "Right to work in Nigeria?"',
        file: null,
      },
      {
        id: "ans-2",
        questionId: "q2",
        position: 1,
        kind: "FILE",
        question: "Certificate",
        value: null,
        display: "Attached file (application/pdf, 54 KB)",
        flagged: false,
        flagReason: null,
        file: {
          contentType: "application/pdf",
          sizeBytes: 55_296,
          scanStatus: "NOT_SCANNED",
          openPath: "/careers/applications/app-1/answers/ans-2/file",
        },
      },
    ],
    consent: {
      noticeRef: "default-1",
      noticeText: "We keep it.",
      noticeUrl: null,
      acceptedAt: "2026-10-01T09:00:00.000Z",
      postingId: "post-1",
      postingTitle: "Payroll Analyst",
    },
    likelyDuplicates: [],
  });

  it("does not fetch them until somebody asks, and then fetches once", async () => {
    const user = userEvent.setup();
    serve([application(1, { knockoutCount: 1 })]);
    getApplication.mockResolvedValue(detail());
    open();
    await screen.findByText("Applicant 1");
    expect(getApplication).not.toHaveBeenCalled();

    const toggle = within(rowOf("Applicant 1")).getByRole("button", {
      name: /Their answers and what they agreed to/,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(
      await screen.findByText("Right to work in Nigeria?"),
    ).toBeInTheDocument();
    expect(getApplication).toHaveBeenCalledTimes(1);
    expect(getApplication.mock.calls[0]?.[0]).toBe("app-1");

    await user.click(
      within(rowOf("Applicant 1")).getByRole("button", {
        name: /Hide their answers/,
      }),
    );
    await user.click(
      within(rowOf("Applicant 1")).getByRole("button", {
        name: /Their answers and what they agreed to/,
      }),
    );
    expect(getApplication).toHaveBeenCalledTimes(1);
  });

  it("shows the flag with its reason, the consent record, and a file to open", async () => {
    const user = userEvent.setup();
    serve([application(1, { knockoutCount: 1 })]);
    getApplication.mockResolvedValue(detail());
    openAnswerFile.mockResolvedValue({
      url: null,
      note: "No file store is set up.",
    });
    open();
    await screen.findByText("Applicant 1");
    await user.click(
      within(rowOf("Applicant 1")).getByRole("button", {
        name: /Their answers and what they agreed to/,
      }),
    );
    await screen.findByText("Right to work in Nigeria?");
    expect(
      screen.getByText('Answered No to "Right to work in Nigeria?"'),
    ).toBeInTheDocument();
    expect(screen.getByTestId("consent-record")).toHaveTextContent(
      "Agreed to the privacy notice on 2026-10-01",
    );

    await user.click(screen.getByRole("button", { name: /Open file/ }));
    await waitFor(() =>
      expect(openAnswerFile).toHaveBeenCalledWith("app-1", "ans-2"),
    );
    expect(
      await screen.findByText("No file store is set up."),
    ).toBeInTheDocument();
  });

  it("does not offer to open a file to somebody who may not", async () => {
    allowed = false;
    const user = userEvent.setup();
    serve([application(1)]);
    getApplication.mockResolvedValue(detail());
    open();
    await screen.findByText("Applicant 1");
    await user.click(
      within(rowOf("Applicant 1")).getByRole("button", {
        name: /Their answers and what they agreed to/,
      }),
    );
    await screen.findByText("Right to work in Nigeria?");
    expect(
      screen.queryByRole("button", { name: /Open file/ }),
    ).not.toBeInTheDocument();
  });

  it("says so when an advert asked nothing beyond the basics", async () => {
    const user = userEvent.setup();
    serve([application(1)]);
    getApplication.mockResolvedValue({
      ...application(1, { reference: null }),
      otherApplications: [],
      answers: [],
      consent: null,
      likelyDuplicates: [],
    });
    open();
    await screen.findByText("Applicant 1");
    await user.click(
      within(rowOf("Applicant 1")).getByRole("button", {
        name: /Their answers and what they agreed to/,
      }),
    );
    expect(
      await screen.findByText(/asked nothing beyond the basics/),
    ).toBeInTheDocument();
  });

  it("says why they did not load and lets the person try again", async () => {
    const { ApiError } = await import("@/lib/api/client");
    const user = userEvent.setup();
    serve([application(1)]);
    getApplication
      .mockRejectedValueOnce(
        new ApiError(
          403,
          "forbidden",
          "You need the following to do that: Manage hiring.",
        ),
      )
      .mockResolvedValueOnce(detail());
    open();
    await screen.findByText("Applicant 1");
    const toggle = () =>
      within(rowOf("Applicant 1")).getByRole("button", {
        name: /Their answers and what they agreed to|Hide their answers/,
      });
    await user.click(toggle());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You need the following to do that: Manage hiring.",
    );

    await user.click(toggle());
    await user.click(toggle());
    expect(
      await screen.findByText("Right to work in Nigeria?"),
    ).toBeInTheDocument();
  });
});
