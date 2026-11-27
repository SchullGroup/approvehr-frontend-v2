import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiCycleParticipants } from "@/lib/api/performance";

/**
 * The period page (owner, 27 Nov 2026): no Overview tab, the stage bar and one
 * next step on top, tabs only for what has something in them, a menu for the
 * places it links to, and a redirect for somebody it has nothing to show.
 */

type Fixture = {
  stage: string;
  loading: boolean;
  perms: Record<string, boolean>;
  flagged: number;
  undecided: number;
  lock: string | null;
  questionCount: number;
  participants: ApiCycleParticipants | null;
  register: unknown;
};

const fx = vi.hoisted(
  () =>
    ({
      stage: "SELF",
      loading: false,
      perms: {},
      flagged: 0,
      undecided: 0,
      lock: null,
      questionCount: 4,
      participants: null,
      register: null,
    }) as Fixture,
);
const replace = vi.hoisted(() => vi.fn());
const advance = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace }),
  usePathname: () => "/performance/periods/cycle-1",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: (permission: string) => fx.perms[permission] ?? false,
  usePermissions: () => ({ loading: fx.loading }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: [] }),
}));
vi.mock("@/lib/store/performance", () => ({
  useKpis: () => ({
    goals: [],
    cascade: [],
    loading: false,
    error: null,
    reload: () => {},
  }),
  useReviewFlags: () => ({
    flags: fx.flagged > 0 ? {} : null,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useCycleQuestions: () => ({
    questions: [],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useFramework: () => ({
    competencies: [],
    groups: [],
    loading: false,
    error: null,
    source: "api",
    reload: () => {},
  }),
  useFrameworkActions: () => ({ editable: false }),
  useCycleMutations: () => ({ advance, updateCycle: vi.fn() }),
  useCycleRegister: () => ({
    cycle: {
      id: "cycle-1",
      name: "H2 2026 Appraisal",
      stage: fx.stage,
      stageLabel: fx.stage.toLowerCase(),
      dueDate: "2026-12-05",
      scoringFrozen: true,
      departmentIds: [],
      periodStart: null,
      periodEnd: null,
      managersCanAddQuestions: false,
      appraiseOwner: false,
      appraiseHrManager: false,
      questionCount: fx.questionCount,
      reviewCount: 6,
    },
    participants: fx.participants,
    register: fx.register,
    revisionRequests: [],
    revisionsUnavailable: false,
    available: true,
    refusal: null,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));
vi.mock("@/app/(app)/performance/period-dialogs", () => ({
  QuestionsDialog: () => null,
}));
vi.mock("@/app/(app)/performance/periods/[id]/ask-peers", () => ({
  AskPeersDialog: () => null,
}));
vi.mock(
  "@/app/(app)/performance/periods/[id]/fairness/calibration-audit",
  () => ({
    CalibrationAudit: () => <div>the calibration audit</div>,
  }),
);
vi.mock("@/app/(app)/performance/periods/[id]/fairness/publish-lock", () => ({
  publishLock: () => fx.lock,
  undecidedScores: () => fx.undecided,
}));
vi.mock(
  "@/app/(app)/performance/periods/[id]/fairness/people-to-review",
  () => ({
    flaggedCount: () => fx.flagged,
  }),
);
vi.mock("@/app/(app)/performance/periods/[id]/period-weights-section", () => ({
  PeriodWeightsSection: () => <div>the weights</div>,
}));
vi.mock("@/components/performance/calibrate-dialog", () => ({
  CalibrateDialog: () => null,
}));

const { PeriodScreen } =
  await import("@/app/(app)/performance/periods/[id]/period-screen");
const { ToastProvider } = await import("@/components/ui");

const mount = () =>
  render(
    <ToastProvider>
      <PeriodScreen cycleId="cycle-1" />
    </ToastProvider>,
  );

const person = (name: string, self: boolean) => ({
  employeeId: name,
  employeeName: name,
  departmentId: null,
  self: { reviewId: `s-${name}`, submitted: self },
  managers: [],
  peers: { asked: 0, answered: 0 },
});
const people = (waiting: number, done = 1): ApiCycleParticipants =>
  ({
    cycleId: "cycle-1",
    cycleName: "H2 2026 Appraisal",
    stage: "SELF",
    rows: [
      ...Array.from({ length: waiting }, (_, i) =>
        person(`Late ${String(i)}`, false),
      ),
      ...Array.from({ length: done }, (_, i) =>
        person(`Done ${String(i)}`, true),
      ),
    ],
    counts: { people: waiting + done, selfDone: done, managerDone: 0 },
  }) as unknown as ApiCycleParticipants;

const row = (name: string, over: Record<string, unknown> = {}) => ({
  employeeId: name,
  employeeName: name,
  jobTitle: "Analyst",
  departmentName: "Finance",
  objectives: { agreed: 2, awaitingApproval: 0 },
  scoreBp: 7200,
  scoreOutOf5: 3.6,
  computedBp: 7200,
  components: [],
  calibration: null,
  signOff: {
    submitted: false,
    finalised: false,
    acknowledged: false,
    disputed: false,
    reviewId: null,
  },
  ...over,
});

beforeEach(() => {
  fx.stage = "SELF";
  fx.loading = false;
  fx.perms = { EDIT_RECORDS: true, MANAGE_SETTINGS: true, VIEW_FAIRNESS: true };
  fx.flagged = 0;
  fx.undecided = 0;
  fx.lock = null;
  fx.questionCount = 4;
  fx.participants = people(2);
  fx.register = null;
  replace.mockClear();
  advance.mockReset().mockResolvedValue({});
});

const tabNames = () => screen.getAllByRole("tab").map((tab) => tab.textContent);

describe("the tabs", () => {
  it("has no Overview, and opens on People while the period runs", () => {
    mount();
    expect(tabNames()).toEqual(["People", "Questions", "Scores", "Settings"]);
    expect(screen.getByRole("tab", { name: "People" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByText("Self-reviews")).toBeNull();
    expect(screen.queryByText("Manager reviews")).toBeNull();
  });

  it("opens on Scores once published, and has no Settings tab", () => {
    fx.stage = "PUBLISHED";
    fx.register = {
      rows: [row("Ada")],
      counts: {},
      weightsFrom: "frozen",
      weightsTotalBp: 10000,
    };
    mount();
    expect(tabNames()).toEqual(["People", "Questions", "Scores"]);
    expect(screen.getByRole("tab", { name: "Scores" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("leaves out the Questions tab of a started period that has none", () => {
    fx.questionCount = 0;
    mount();
    expect(tabNames()).not.toContain("Questions");
  });

  it("opens a draft on its questions, with nothing to measure", () => {
    fx.stage = "DRAFT";
    mount();
    expect(tabNames()).toEqual(["Questions", "Settings"]);
    expect(
      screen.queryByRole("progressbar", { name: "H2 2026 Appraisal progress" }),
    ).toBeNull();
  });
});

describe("the bar and the one next step", () => {
  it("shows the sectioned bar and a reminder while anybody owes a form", () => {
    mount();
    expect(
      screen.getByRole("progressbar", { name: "H2 2026 Appraisal progress" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 still to send")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remind" })).toBeInTheDocument();
    expect(screen.queryByText("Everyone has finished this stage")).toBeNull();
  });

  it("moves on once nobody owes anything, and says Move to score review at the end of manager reviews", async () => {
    fx.participants = people(0);
    mount();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Open manager reviews" }));
    /* It cannot be undone, so it asks first. */
    expect(advance).not.toHaveBeenCalled();
    await userEvent.setup().click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Move it",
      }),
    );
    expect(advance).toHaveBeenCalledWith("cycle-1", "MANAGER");
  });

  it("calls the move into the score review by that word", () => {
    fx.stage = "MANAGER";
    fx.participants = people(0);
    mount();
    expect(
      screen.getByRole("button", { name: "Move to score review" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check scores" })).toBeNull();
  });

  it("keeps the move reachable from the menu while somebody still owes a form", async () => {
    mount();
    expect(
      screen.queryByRole("button", { name: "Open manager reviews" }),
    ).toBeNull();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "More for this period" }));
    await userEvent
      .setup()
      .click(screen.getByRole("menuitem", { name: "Open manager reviews" }));
    await userEvent.setup().click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Move it",
      }),
    );
    expect(advance).toHaveBeenCalledWith("cycle-1", "MANAGER");
  });

  it("says flagged scores need a decision, instead of a button that cannot publish", () => {
    fx.stage = "CALIBRATION";
    fx.participants = people(0);
    fx.undecided = 2;
    fx.lock = "2 scores flagged by the fairness check still need a decision.";
    mount();
    expect(
      screen.getByText("2 flagged scores need a decision"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute(
      "href",
      "/performance/periods/cycle-1/fairness?tab=people",
    );
    expect(
      screen.queryByRole("button", { name: /Publish|Share results/ }),
    ).toBeNull();
  });

  it("offers Publish, never Share results, once nothing is waiting", () => {
    fx.stage = "CALIBRATION";
    fx.participants = people(0);
    mount();
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(screen.queryByText("Share results")).toBeNull();
  });

  it("offers nothing to somebody who cannot manage settings", () => {
    fx.perms = { EDIT_RECORDS: true };
    mount();
    expect(
      screen.getByRole("progressbar", { name: "H2 2026 Appraisal progress" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remind" })).toBeNull();
  });
});

describe("the header", () => {
  it("keeps the fairness check as an icon only while something is flagged", () => {
    fx.flagged = 3;
    mount();
    expect(
      screen.getByRole("link", { name: "Fairness check, 3 flagged" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Who appraises whom" }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "Talent map" })).toBeNull();
  });

  it("puts the places it links to in a menu as words", async () => {
    mount();
    expect(screen.queryByRole("link", { name: "Fairness check" })).toBeNull();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "More for this period" }));
    const menu = screen
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(menu).toEqual(
      expect.arrayContaining([
        "Who appraises whom",
        "Talent map",
        "Report",
        "Fairness check",
      ]),
    );
    expect(menu).not.toContain("Download report");
  });
});

describe("somebody the page has nothing to show", () => {
  it("is sent to their own Performance page", () => {
    fx.perms = {};
    const { container } = mount();
    expect(replace).toHaveBeenCalledWith("/performance");
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("This page covers the whole company")).toBeNull();
  });

  it("is not sent anywhere while who they are is still being worked out", () => {
    fx.perms = {};
    fx.loading = true;
    mount();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("the Scores tab", () => {
  const open = async () => {
    fx.stage = "CALIBRATION";
    fx.participants = people(0);
    fx.register = {
      weightsFrom: "frozen",
      weightsTotalBp: 10000,
      counts: { unscored: 1, awaitingAcknowledgement: 1, disputed: 1 },
      rows: [
        row("Ada Obi", {
          signOff: {
            submitted: true,
            finalised: false,
            acknowledged: false,
            disputed: false,
            reviewId: "r1",
          },
        }),
        row("Bayo Ade", {
          signOff: {
            submitted: true,
            finalised: true,
            acknowledged: false,
            disputed: false,
            reviewId: "r2",
          },
        }),
        row("Chi Eze", {
          signOff: {
            submitted: true,
            finalised: true,
            acknowledged: true,
            disputed: false,
            reviewId: "r3",
          },
        }),
        row("Dayo Ola", {
          signOff: {
            submitted: true,
            finalised: true,
            acknowledged: false,
            disputed: true,
            reviewId: "r4",
          },
        }),
        row("Efe Ngo", { scoreBp: null, scoreOutOf5: null, computedBp: null }),
      ],
    };
    mount();
    await userEvent.setup().click(screen.getByRole("tab", { name: "Scores" }));
  };

  it("has no heading and no badges over the table", async () => {
    await open();
    expect(screen.queryByText("Where the scores stand")).toBeNull();
    for (const badge of ["1 unscored", "1 unanswered", "1 disputed"]) {
      expect(screen.queryByText(badge)).toBeNull();
    }
    expect(screen.queryByText("Objectives agreed")).toBeNull();
  });

  it("says Not recorded for no score, and one word for each sign-off", async () => {
    await open();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Not recorded")).toBeInTheDocument();
    expect(within(table).queryByText("No score")).toBeNull();
    for (const word of ["Written", "Final", "Acknowledged", "Disputed"]) {
      expect(within(table).getByText(word)).toBeInTheDocument();
    }
    for (const old of [
      "Written, not final",
      "Not answered yet",
      "Not written yet",
      "No manager review",
    ]) {
      expect(within(table).queryByText(old)).toBeNull();
    }
    expect(within(table).queryByText("Finalise")).toBeNull();
  });

  it("shows the calibration audit only when a score was moved", async () => {
    await open();
    expect(screen.queryByText("the calibration audit")).toBeNull();
  });

  it("shows the calibration audit once a score has been moved", async () => {
    fx.stage = "CALIBRATION";
    fx.participants = people(0);
    fx.register = {
      weightsFrom: "frozen",
      weightsTotalBp: 10000,
      counts: {},
      rows: [
        row("Ada Obi", {
          calibration: {
            originalBp: 7000,
            calibratedBp: 6200,
            reason: "Agreed",
          },
        }),
      ],
    };
    mount();
    await userEvent.setup().click(screen.getByRole("tab", { name: "Scores" }));
    expect(screen.getByText("the calibration audit")).toBeInTheDocument();
  });
});

describe("Settings", () => {
  it("has no Name or Delete card, and a Who is appraised card on a draft", async () => {
    fx.stage = "DRAFT";
    mount();
    await userEvent
      .setup()
      .click(screen.getByRole("tab", { name: "Settings" }));
    expect(screen.queryByText("Delete this period")).toBeNull();
    expect(screen.queryByText("Who is included")).toBeNull();
    expect(screen.getByText("Who is appraised")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Appraise the Owner in this period"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Managers say how far each person could go"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Off for both by default/)).toBeNull();
  });
});
