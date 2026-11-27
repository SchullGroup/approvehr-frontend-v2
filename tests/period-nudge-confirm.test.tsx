import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ApiCycleParticipants } from "@/lib/api/performance";

/**
 * "Nudge who is late" asks first and names who it reaches (UAT 23 Nov, U92 /
 * PERF-12). One press used to send every reminder at once, by email as well as
 * in the app, while the toast said no emails were sent.
 */

let remindCycle: Mock<(...args: unknown[]) => Promise<unknown>>;
let participants: ApiCycleParticipants | null;

const person = (
  name: string,
  self: boolean | null,
  managers: { name: string; submitted: boolean }[],
  peers = { asked: 0, answered: 0 },
) => ({
  employeeId: name,
  employeeName: name,
  departmentId: null,
  self: self === null ? null : { reviewId: `self-${name}`, submitted: self },
  managers: managers.map((manager) => ({
    reviewId: `mgr-${name}-${manager.name}`,
    submitted: manager.submitted,
    finalised: false,
    managerName: manager.name,
    rating: null,
  })),
  peers,
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/performance/periods/cycle-1",
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/lib/store/performance", () => ({
  useKpis: () => ({
    goals: [],
    cascade: [],
    loading: false,
    error: null,
    reload: () => {},
  }),
  outstandingIn: (p: ApiCycleParticipants | null) =>
    (p?.rows ?? []).flatMap((r) => [
      ...(r.self && !r.self.submitted
        ? [
            {
              employeeId: r.employeeId,
              employeeName: r.employeeName,
              what: `${r.employeeName} self`,
              reviewId: r.self.reviewId,
            },
          ]
        : []),
      ...r.managers
        .filter((m) => !m.submitted)
        .map((m) => ({
          employeeId: r.employeeId,
          employeeName: r.employeeName,
          what: `${r.employeeName} manager`,
          reviewId: m.reviewId,
        })),
    ]),
  useCycleQuestions: () => ({
    questions: [],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useRatingScale: () => ({ scale: { levels: [], max: 5, source: "default" } }),
  useReviewFlags: () => ({
    flags: null,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useCycleRegister: () => ({
    cycle: {
      id: "cycle-1",
      name: "H2 2026 Appraisal",
      stage: "SELF",
      stageLabel: "self-review",
      dueDate: "2026-11-30",
      scoringFrozen: true,
      departmentIds: [],
      periodStart: null,
      periodEnd: null,
      managersCanAddQuestions: false,
      appraiseOwner: false,
      appraiseHrManager: false,
      questionCount: 3,
      reviewCount: 6,
    },
    participants,
    register: null,
    revisionRequests: [],
    revisionsUnavailable: false,
    available: true,
    refusal: null,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useCycleMutations: () => ({
    remind: (...args: unknown[]) => remindCycle(...args),
  }),
}));
vi.mock("@/app/(app)/performance/period-dialogs", () => ({
  QuestionsDialog: () => null,
}));
vi.mock("@/app/(app)/performance/sections-dialog", () => ({
  SectionsDialog: () => null,
}));
vi.mock("@/app/(app)/performance/periods/[id]/ask-peers", () => ({
  AskPeersButton: () => null,
}));
vi.mock(
  "@/app/(app)/performance/periods/[id]/fairness/calibration-audit",
  () => ({ CalibrationAudit: () => null }),
);
vi.mock(
  "@/app/(app)/performance/periods/[id]/fairness/publish-lock",
  () => ({ publishLock: () => null, undecidedScores: () => 0 }),
);
vi.mock("@/app/(app)/performance/periods/[id]/period-weights-section", () => ({
  PeriodWeightsSection: () => null,
}));
vi.mock("@/components/performance/calibrate-dialog", () => ({
  CalibrateDialog: () => null,
}));

const { PeriodScreen } =
  await import("@/app/(app)/performance/periods/[id]/period-screen");
const { ToastProvider } = await import("@/components/ui");
const { nudgeAudience } =
  await import("@/app/(app)/performance/periods/[id]/nudge");

const mount = () =>
  render(
    <ToastProvider>
      <PeriodScreen cycleId="cycle-1" />
    </ToastProvider>,
  );

const withRows = (rows: ReturnType<typeof person>[]): ApiCycleParticipants => ({
  cycleId: "cycle-1",
  cycleName: "H2 2026 Appraisal",
  stage: "SELF",
  rows,
  counts: { people: rows.length, selfDone: 0, managerDone: 0 },
});

beforeEach(() => {
  remindCycle = vi.fn().mockResolvedValue({
    cycleId: "cycle-1",
    outstanding: 3,
    reminded: 3,
    noAccount: 0,
  });
  participants = withRows([
    person("Halima Sani", false, [
      { name: "Adaeze Okonkwo", submitted: false },
    ]),
    person(
      "Tunde Bakare",
      true,
      [{ name: "Adaeze Okonkwo", submitted: true }],
      {
        asked: 3,
        answered: 1,
      },
    ),
    person("Grace Effiong", false, [{ name: "Musa Ibrahim", submitted: true }]),
  ]);
});

/** Reminders sit on the People tab. */
async function openReminder(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: "People" }));
  await user.click(screen.getByRole("button", { name: "Send a reminder" }));
}

describe("Reminding people who are late", () => {
  it("sends nothing on the first press, and names who it will reach", async () => {
    const user = userEvent.setup();
    mount();
    await openReminder(user);

    expect(remindCycle).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Nudge 3 people?")).toBeInTheDocument();
    const list = within(dialog).getByRole("list", {
      name: "Who gets a reminder",
    });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Adaeze Okonkwo", "Grace Effiong", "Halima Sani"]);
    expect(dialog).toHaveTextContent(/by email/);
    expect(dialog).toHaveTextContent(/due 30 Nov 2026/);
    expect(dialog).toHaveTextContent(/2 pieces of peer feedback/);
    expect(dialog).toHaveTextContent(/not named/);
  });

  it("sends the reminders only when confirmed", async () => {
    const user = userEvent.setup();
    mount();
    await openReminder(user);
    await user.click(
      screen.getByRole("button", { name: "Send the reminders" }),
    );
    expect(remindCycle).toHaveBeenCalledWith("cycle-1");
  });

  it("does not claim that no emails go out", async () => {
    remindCycle.mockResolvedValue({
      cycleId: "cycle-1",
      outstanding: 3,
      reminded: 2,
      noAccount: 1,
    });
    const user = userEvent.setup();
    mount();
    await openReminder(user);
    await user.click(
      screen.getByRole("button", { name: "Send the reminders" }),
    );
    expect(await screen.findByText(/no sign-in/)).toBeInTheDocument();
    expect(screen.queryByText(/No emails are sent/)).not.toBeInTheDocument();
  });

  it("offers nothing when nobody owes a review", async () => {
    participants = withRows([
      person("Tunde Bakare", true, [
        { name: "Adaeze Okonkwo", submitted: true },
      ]),
    ]);
    mount();
    await userEvent.setup().click(screen.getByRole("tab", { name: "People" }));
    expect(
      screen.queryByRole("button", { name: "Send a reminder" }),
    ).not.toBeInTheDocument();
  });
});

describe("nudgeAudience", () => {
  it("names each author once, however many forms they owe", () => {
    const audience = nudgeAudience(
      withRows([
        person("A", false, [{ name: "Boss", submitted: false }]),
        person("B", true, [{ name: "Boss", submitted: false }]),
      ]),
    );
    expect(audience).toEqual({ names: ["A", "Boss"], peerForms: 0 });
  });

  it("is null when the participants are not known", () => {
    expect(nudgeAudience(null)).toBeNull();
  });
});
