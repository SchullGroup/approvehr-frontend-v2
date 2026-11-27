import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiReviewDetail } from "@/lib/api/performance";
import { ReviewScreen } from "@/app/(app)/performance/reviews/[id]/review-screen";

/**
 * "Work this cycle" on the record of a review: the Work tab.
 *
 * What is proved: the self review and the manager review carry the panel, about
 * the person the review is about and the cycle it belongs to; peer feedback does
 * not ask for it at all; and the panel is told whether the review is the
 * reader's own, so it speaks to "you" only there.
 *
 * And that the tab is there only when there is work to read: the project boards'
 * list needs Projects, the connected tools' tickets need tickets, and a record
 * with neither has no Work tab, not an empty one.
 */

const state = vi.hoisted(() => ({
  review: null as unknown,
  projects: true,
  evidence: null as unknown,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/performance/reviews/r-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/permissions")>()),
  useCan: () => false,
}));
vi.mock("@/lib/store/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/session")>()),
  useSession: () => ({ actingId: "emp-subject", isConnected: false }),
}));
vi.mock("@/lib/store/project-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/project-session")>()),
  useProjectsGate: () => ({ enabled: state.projects, loading: false }),
}));
vi.mock("@/lib/store/work-trackers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/work-trackers")>()),
  useWorkEvidence: () => ({
    evidence: state.evidence,
    loading: false,
    error: null,
    reload: () => {},
    connected: true,
  }),
}));
vi.mock("@/components/performance/work-evidence", () => ({
  WorkEvidence: () => <div data-testid="work-evidence" />,
}));
vi.mock("@/components/performance/work-this-cycle", () => ({
  WorkThisCycle: (props: Record<string, unknown>) => (
    <div
      data-testid="work-this-cycle"
      data-subject={String(props["subjectId"])}
      data-cycle={String(props["cycleId"])}
      data-own={String(props["own"])}
      data-enabled={String(props["enabled"])}
    />
  ),
}));
vi.mock("@/lib/store/performance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/performance")>()),
  useReview: () => ({
    review: state.review,
    loading: false,
    error: null,
    reload: () => {},
  }),
  useSubjectSelfReview: () => ({ selfReview: null, loading: false }),
  useEmployeeScore: () => ({
    score: null,
    loading: false,
    available: true,
    error: null,
    refusal: "",
    reload: () => {},
  }),
  useReviewFlag: () => ({ flag: null, claims: [] }),
  useSignOff: () => ({
    canFinalise: true,
    finaliseRefusal: "",
    acknowledge: vi.fn(),
    finalise: vi.fn(),
  }),
}));

const review = (over: Partial<ApiReviewDetail> = {}): ApiReviewDetail =>
  ({
    id: "r-1",
    cycleId: "c-1",
    cycleName: "Year-end review 2026",
    cycleStage: "CALIBRATION",
    dueDate: null,
    periodStart: "2026-01-01",
    periodEnd: "2026-06-30",
    kind: "MANAGER",
    kindLabel: "Manager review",
    anonymous: false,
    subjectId: "emp-subject",
    subjectName: "Emeka Anyanwu",
    authorId: "emp-author",
    authorName: "Adaeze Okonkwo",
    rating: null,
    summary: null,
    submitted: true,
    submittedAt: "2026-10-29T08:00:00.000Z",
    answerCount: 0,
    finalised: false,
    finalisedAt: null,
    acknowledged: false,
    acknowledgedAt: null,
    disputed: false,
    disputedAt: null,
    employeeComment: null,
    mine: false,
    questions: [],
    outstanding: [],
    instructions: null,
    guideUrl: null,
    ...over,
  }) as ApiReviewDetail;

beforeEach(() => {
  state.review = review();
  state.projects = true;
  state.evidence = null;
});
afterEach(cleanup);

const openWork = async () =>
  userEvent.click(screen.getByRole("tab", { name: "Work" }));

describe("the record of a review", () => {
  it("carries the panel on a manager review, about the person and the cycle", async () => {
    render(<ReviewScreen reviewId="r-1" />);
    await openWork();
    const panel = screen.getByTestId("work-this-cycle");
    expect(panel).toHaveAttribute("data-subject", "emp-subject");
    expect(panel).toHaveAttribute("data-cycle", "c-1");
    expect(panel).toHaveAttribute("data-enabled", "true");
  });

  it("speaks to the person as 'you' only in their own review", async () => {
    render(<ReviewScreen reviewId="r-1" />);
    await openWork();
    expect(screen.getByTestId("work-this-cycle")).toHaveAttribute(
      "data-own",
      "true",
    );
    cleanup();
    state.review = review({ subjectId: "somebody-else" });
    render(<ReviewScreen reviewId="r-1" />);
    await openWork();
    expect(screen.getByTestId("work-this-cycle")).toHaveAttribute(
      "data-own",
      "false",
    );
  });

  it("carries it on a self review too", async () => {
    state.review = review({
      kind: "SELF",
      kindLabel: "Self-review",
      mine: true,
    });
    render(<ReviewScreen reviewId="r-1" />);
    await openWork();
    expect(screen.getByTestId("work-this-cycle")).toHaveAttribute(
      "data-enabled",
      "true",
    );
  });

  it("does not ask for it on peer feedback, and has no Work tab there", () => {
    state.review = review({ kind: "PEER", kindLabel: "Peer feedback" });
    render(<ReviewScreen reviewId="r-1" />);
    expect(screen.queryByTestId("work-this-cycle")).toBeNull();
    expect(screen.queryByRole("tab", { name: "Work" })).toBeNull();
  });

  it("has the two work components inside the one tab, and nothing of them on the other tabs", async () => {
    render(<ReviewScreen reviewId="r-1" />);
    expect(screen.queryByTestId("work-this-cycle")).toBeNull();
    expect(screen.queryByTestId("work-evidence")).toBeNull();
    await openWork();
    expect(screen.getByTestId("work-this-cycle")).toBeInTheDocument();
    expect(screen.getByTestId("work-evidence")).toBeInTheDocument();
  });
});

describe("whether there is a Work tab", () => {
  it("is not there where the company has no Projects and there are no tickets", () => {
    state.projects = false;
    render(<ReviewScreen reviewId="r-1" />);
    expect(screen.queryByRole("tab", { name: "Work" })).toBeNull();
  });

  it("is there where there are tickets from connected tools, with or without Projects", () => {
    state.projects = false;
    state.evidence = { tasks: [{ id: "t-1" }] };
    render(<ReviewScreen reviewId="r-1" />);
    expect(screen.getByRole("tab", { name: "Work" })).toBeInTheDocument();
  });

  it("is not there where the tools have none, which is an empty section", () => {
    state.projects = false;
    state.evidence = { tasks: [] };
    render(<ReviewScreen reviewId="r-1" />);
    expect(screen.queryByRole("tab", { name: "Work" })).toBeNull();
  });
});
