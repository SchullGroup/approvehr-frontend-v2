import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MyApplication } from "@/lib/hiring/comms/model";
import type { FitSummary } from "@/lib/hiring/screening/model";
import { renderInToasts } from "./pipeline-workspace-helpers";
import { explanation, fakeGateway } from "./screening-helpers";

/**
 * Who may see a score is the job's choice, and the API's to enforce. Where it says no
 * it leaves the fields **out**. Every place a score is drawn has to treat "left out" as
 * nothing at all: not zero, not "not scored", not a greyed placeholder, not a box that
 * says a score is hidden, and not a filter or sort for something that cannot be seen.
 * A placeholder tells the viewer a score exists.
 *
 * The matrix is surface by surface, each with the score sent and with it left out.
 */

const mail = vi.hoisted(() => ({
  myApplications: vi.fn(),
  myApplication: vi.fn(),
}));
vi.mock("@/lib/api/candidate-email", async (original) => ({
  ...(await original<typeof import("@/lib/api/candidate-email")>()),
  candidateEmailApi: new Proxy(
    {},
    {
      get:
        (_t, name: string) =>
        (...args: unknown[]) =>
          (mail as Record<string, (...a: unknown[]) => unknown>)[name]?.(
            ...args,
          ),
    },
  ),
}));

const current = vi.hoisted(() => ({
  gateway: null as never as ReturnType<
    typeof import("./screening-helpers").fakeGateway
  >,
}));
vi.mock("@/lib/hiring/screening/use-gateway", () => ({
  useScreeningGateway: () => current.gateway,
}));

const mine = vi.hoisted(() => ({
  access: vi.fn(),
  interviews: vi.fn(),
  applications: vi.fn(),
  application: vi.fn(),
  openCv: vi.fn(),
  submitScorecard: vi.fn(),
}));
vi.mock("@/lib/hiring/pipeline/use-pipeline", () => ({
  usePipelineGateway: () => ({ mode: "api", mine }),
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true, isLoading: false, user: null }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/hiring/my-interviews",
  useSearchParams: () => new URLSearchParams(),
}));

const { apiComms } = await import("@/lib/hiring/pipeline/api-comms");
const { MyInterviewsScreen } =
  await import("@/app/(app)/hiring/my-interviews/my-interviews-screen");
const { MyApplicationScreen } =
  await import("@/app/(app)/hiring/my-interviews/[id]/my-application-screen");
const { cardScreeningFromApi, belowRowFromApi } =
  await import("@/lib/hiring/screening/wire");
const { scoresAreSent } = await import("@/lib/hiring/screening/score");
const { PipelineFilters } =
  await import("@/components/hiring/pipeline-filters");
const { useScoreFilterState } =
  await import("@/components/hiring/screening/score-filters");
const { FitBadge, FitBar, ScreeningBadges } =
  await import("@/components/hiring/screening/fit-badge");

const signal = () => new AbortController().signal;

const baseCard = {
  id: "a1",
  requisitionId: "r1",
  requisitionReference: "REQ-0001",
  jobTitle: "Analyst",
  candidateName: "Ada Okafor",
  stageName: "Interview",
  stageType: "INTERVIEW" as const,
  outcome: "IN_PROGRESS" as const,
  stageEnteredAt: "2026-10-01T09:00:00.000Z",
  roles: ["INTERVIEW_PANEL" as const],
  myInterviews: [],
  hasCv: true,
};

const baseDetail = {
  id: "a1",
  requisition: { id: "r1", reference: "REQ-0001", jobTitle: "Analyst" },
  candidate: { firstName: "Ada", lastName: "Okafor", hasCv: true },
  stage: { id: "s2", name: "Interview", type: "INTERVIEW" as const },
  outcome: "IN_PROGRESS" as const,
  stageEnteredAt: "2026-10-01T09:00:00.000Z",
  roles: ["INTERVIEW_PANEL" as const],
  interviews: [],
  scores: null,
};

beforeEach(() => {
  for (const fn of [...Object.values(mail), ...Object.values(mine)])
    fn.mockReset();
});

describe("the narrow door's list, as the API sends it", () => {
  it("carries a fit only when a score and a status were both sent", async () => {
    mail.myApplications.mockResolvedValue({
      data: [
        { ...baseCard, id: "sent", score: 72, scoreStatus: "SCORED" },
        {
          ...baseCard,
          id: "no-text",
          score: null,
          scoreStatus: "NEEDS_READING",
        },
        /* Allowed to see scores, but this person was added by hand: nothing to show. */
        { ...baseCard, id: "by-hand", score: null, scoreStatus: null },
        /* Not allowed: the fields are left out altogether. */
        { ...baseCard, id: "omitted" },
      ],
      meta: { total: 4 },
    });
    const page = await apiComms.mine.applications(
      { includeClosed: false, page: 1, pageSize: 50 },
      signal(),
    );
    const byId = Object.fromEntries(page.rows.map((row) => [row.id, row]));
    expect(byId["sent"]?.fit).toMatchObject({ status: "SCORED", score: 72 });
    expect(byId["no-text"]?.fit).toMatchObject({ status: "NO_TEXT" });
    /* Absent is absent: not a key holding "not scored". */
    expect("fit" in (byId["by-hand"] ?? {})).toBe(false);
    expect("fit" in (byId["omitted"] ?? {})).toBe(false);
  });
});

describe("the narrow door's detail, as the API sends it", () => {
  it("carries the score and its reasons only where they were sent", async () => {
    mail.myApplication.mockResolvedValueOnce({
      ...baseDetail,
      screening: {
        status: "SCORED",
        score: 64,
        coverage: 0.8,
        reasons: "Meets 3 of the 4 must-haves.",
      },
    });
    const sent = await apiComms.mine.application("a1", signal());
    expect(sent.screening?.fit.score).toBe(64);
    expect(sent.screening?.reasons).toBe("Meets 3 of the 4 must-haves.");

    mail.myApplication.mockResolvedValueOnce({ ...baseDetail });
    const omitted = await apiComms.mine.application("a1", signal());
    expect("screening" in omitted).toBe(false);

    mail.myApplication.mockResolvedValueOnce({
      ...baseDetail,
      screening: null,
    });
    const byHand = await apiComms.mine.application("a1", signal());
    expect("screening" in byHand).toBe(false);
  });
});

describe("my interviews, the list", () => {
  const row = (fit?: FitSummary) => ({
    id: "a1",
    candidateName: "Ada Okafor",
    role: "Analyst",
    reference: "REQ-0001",
    stageName: "Interview",
    outcome: "IN_PROGRESS" as const,
    roles: ["Interview panel"],
    interviewsOfMine: 1,
    scorecardsOwed: 0,
    hasCv: true,
    ...(fit ? { fit } : {}),
  });
  const open = async (fit?: FitSummary) => {
    mine.access.mockResolvedValue({
      hasAnyAccess: true,
      managing: [],
      paneling: [],
      interviewsInvitedTo: 1,
    });
    mine.interviews.mockResolvedValue({ rows: [], total: 0 });
    mine.applications.mockResolvedValue({ rows: [row(fit)], total: 1 });
    renderInToasts(<MyInterviewsScreen />);
    await screen.findByText("Ada Okafor");
  };

  it("draws the score when it was sent", async () => {
    await open({ status: "SCORED", score: 72, version: null, stale: false });
    expect(screen.getByText(/Fit 72/)).toBeInTheDocument();
  });

  it("draws nothing for a score that was left out: no badge, no placeholder", async () => {
    await open();
    expect(screen.queryByText(/\bfit\b/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not scored|needs a person/i)).toBeNull();
    expect(screen.queryByText(/out of 100/i)).toBeNull();
  });
});

describe("my interviews, one candidate", () => {
  const detail = (screening?: MyApplication["screening"]): MyApplication => ({
    id: "a1",
    candidateName: "Ada Okafor",
    role: "Analyst",
    reference: "REQ-0001",
    stageName: "Interview",
    outcome: "IN_PROGRESS",
    roles: ["Interview panel"],
    hasCv: true,
    interviews: [],
    score: null,
    ...(screening ? { screening } : {}),
  });

  it("draws the fit score and its reasons when they were sent", async () => {
    mine.application.mockResolvedValue(
      detail({
        fit: { status: "SCORED", score: 64, version: null, stale: false },
        coverage: 0.8,
        reasons: "Meets 3 of the 4 must-haves.",
      }),
    );
    renderInToasts(<MyApplicationScreen id="a1" />);
    expect(await screen.findByText("Fit score")).toBeInTheDocument();
    expect(
      screen.getByText("Meets 3 of the 4 must-haves."),
    ).toBeInTheDocument();
  });

  it("draws no card at all when they were left out, not even a heading", async () => {
    mine.application.mockResolvedValue(detail());
    renderInToasts(<MyApplicationScreen id="a1" />);
    await screen.findByText("Ada Okafor");
    expect(screen.queryByText("Fit score")).not.toBeInTheDocument();
    expect(screen.queryByText(/\bfit\b/i)).toBeNull();
    expect(screen.queryByText(/not scored|out of 100/i)).toBeNull();
    expect(screen.queryByText(/hidden|not shown|restricted/i)).toBeNull();
  });
});

describe("a card on the board, and a row in the table", () => {
  it("has no screening at all when the API sent no status", () => {
    expect(
      cardScreeningFromApi({ jobApplicationId: "j1", fitScore: 55 }),
    ).toBeNull();
    expect(cardScreeningFromApi({ jobApplicationId: "j1" })).toBeNull();
  });

  it("has one when the score was sent, and the components draw nothing without it", () => {
    const sent = cardScreeningFromApi({
      jobApplicationId: "j1",
      fitScore: 55,
      scoreStatus: "SCORED",
    });
    expect(sent?.fit.score).toBe(55);

    const { container } = render(
      <>
        <ScreeningBadges summary={null} />
        <ScreeningBadges summary={undefined} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();

    render(<FitBadge fit={sent!.fit} />);
    expect(screen.getByText(/55/)).toBeInTheDocument();
    render(<FitBar fit={sent!.fit} />);
    expect(screen.getByTestId("fit-bar")).toBeInTheDocument();
  });
});

describe("the list of people below the pass mark", () => {
  const confirmRow = {
    id: "c1",
    reference: null,
    name: "Ada Okafor",
    email: "ada@example.com",
    source: null,
    appliedAt: "2026-10-01T09:00:00.000Z",
    state: "WAITING" as const,
    pipeline: null,
    assessment: null,
    knockoutCount: 0,
    reasons: [{ code: "SCORE" as const, text: "Below the fit mark." }],
    flaggedAt: null,
    hasCv: true,
  };

  it("marks a row whose score was left out, so it draws no badge", () => {
    expect(belowRowFromApi({ ...confirmRow }).fitHidden).toBe(true);
  });

  it("does not mark a row whose score was sent, even a null one", () => {
    expect(
      belowRowFromApi({ ...confirmRow, score: 31, scoreStatus: "SCORED" })
        .fitHidden,
    ).toBeUndefined();
    expect(
      belowRowFromApi({ ...confirmRow, score: null, scoreStatus: "PENDING" })
        .fitHidden,
    ).toBeUndefined();
  });
});

describe("the score filters and sort", () => {
  const scored = { screening: { fit: {} } };
  const byHand = { screening: null };

  it("are offered while any person on screen has a score", () => {
    expect(scoresAreSent([byHand, scored], false)).toBe(true);
    expect(scoresAreSent([{ fit: {} }], false)).toBe(true);
  });

  it("are not offered when nobody on screen has one: they would be controls for what cannot be seen", () => {
    expect(scoresAreSent([byHand, {}, { screening: undefined }], false)).toBe(
      false,
    );
  });

  it("stay while somebody is using one, and while nothing is loaded yet", () => {
    expect(scoresAreSent([byHand], true)).toBe(true);
    expect(scoresAreSent([], false)).toBe(true);
  });
});

describe("the board's filter bar", () => {
  function Bar({ shown }: { shown: boolean }) {
    const score = useScoreFilterState();
    return (
      <PipelineFilters
        search=""
        onSearchChange={() => undefined}
        filters={{}}
        onChange={() => undefined}
        tags={[]}
        score={score}
        scoresShown={shown}
      />
    );
  }
  const openBar = async (shown: boolean) => {
    current.gateway = fakeGateway();
    const user = userEvent.setup();
    renderInToasts(<Bar shown={shown} />);
    await user.click(screen.getByRole("button", { name: /^Filters/ }));
  };

  it("offers the score sort, range and status where scores are sent", async () => {
    await openBar(true);
    expect(
      screen.getByRole("combobox", { name: "Sort by" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Score status" }),
    ).toBeInTheDocument();
  });

  it("leaves all three out where they are not, and keeps the filters that are not about scores", async () => {
    await openBar(false);
    expect(screen.queryByRole("combobox", { name: "Sort by" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Score status" })).toBeNull();
    expect(screen.queryByText(/Fit score/)).toBeNull();
    expect(
      screen.getByRole("combobox", { name: "Flagged answers" }),
    ).toBeInTheDocument();
  });
});

describe("the record and the queue's explanation, where the API gave none", () => {
  it("draws no card on the record, not even its heading", async () => {
    current.gateway = fakeGateway({ explanation: vi.fn(async () => null) });
    const { ScreeningCard } =
      await import("@/components/hiring/screening/screening-card");
    const { container } = render(
      <ScreeningCard subject={{ kind: "application", id: "a1" }} />,
    );
    await waitFor(() => expect(current.gateway.explanation).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("draws the card when there is one", async () => {
    current.gateway = fakeGateway({
      explanation: vi.fn(async () => explanation()),
    });
    const { ScreeningCard } =
      await import("@/components/hiring/screening/screening-card");
    render(<ScreeningCard subject={{ kind: "application", id: "a1" }} />);
    expect(await screen.findByTestId("explanation")).toBeInTheDocument();
  });

  it("takes the queue row's button away once it learns there is nothing to show", async () => {
    current.gateway = fakeGateway({ explanation: vi.fn(async () => null) });
    const { ExplanationDisclosure } =
      await import("@/components/hiring/screening/explanation-panel");
    render(
      <ExplanationDisclosure subject={{ kind: "application", id: "a1" }} />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "How this score was worked out" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /explanation|worked out/ }),
      ).not.toBeInTheDocument(),
    );
  });
});
