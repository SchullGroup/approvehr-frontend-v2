import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

/**
 * The period page names the people nobody is appraising (UAT 23 Nov, U102 /
 * PERF-23). It said they were "listed above" and listed nobody: the list went
 * in a redesign and only its comment stayed. It is back on the Overview, one
 * line per kind of problem, from the appraiser map's own exceptions.
 *
 * (Set-up taken from period-page-reads-only-what-it-may.test.tsx.)
 */

let canManage = true;
const registerCalls: unknown[][] = [];
const questionsMounted = vi.hoisted(() => ({ count: 0 }));
const questionsRead = vi.hoisted(() => ({ count: 0 }));
const updateCycle: Mock<(...args: unknown[]) => Promise<unknown>> = vi.fn();
const reload = vi.fn();
const state = vi.hoisted(() => ({ exceptions: null as unknown }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/performance/periods/cycle-1",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: (permission: string) =>
    permission === "MANAGE_SETTINGS" ? canManage : true,
}));
vi.mock("@/lib/store/performance", () => ({
  outstandingIn: () => [],
  useRatingScale: () => ({ scale: { levels: [], max: 5, source: "default" } }),
  useReviewFlags: () => ({
    flags: null,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useCycleRegister: (...args: unknown[]) => (
    registerCalls.push(args),
    {
      cycle: {
        id: "cycle-1",
        name: "Q1-Q3 Appraisal",
        stage: "SELF",
        stageLabel: "self-review",
        scoringFrozen: false,
        departmentIds: [],
        periodStart: null,
        periodEnd: null,
        managersCanAddQuestions: false,
        appraiseOwner: false,
        appraiseHrManager: false,
        questionCount: 0,
        reviewCount: 0,
      },
      participants: {
        counts: { people: 3 },
        rows: [],
      },
      register: { rows: [] },
      exceptions: state.exceptions,
      revisionRequests: [],
      revisionsUnavailable: false,
      available: true,
      refusal: "Offline.",
      loading: false,
      error: null,
      reload,
    }
  ),
  /* The Questions tab reads them, and `GET .../questions` needs MANAGE_SETTINGS. */
  useCycleQuestions: () => (
    (questionsRead.count += 1),
    { questions: [], loading: false, error: null, reload: vi.fn() }
  ),
  useCycleMutations: () => ({
    updateCycle: (...args: unknown[]) => updateCycle(...args),
  }),
}));
vi.mock("@/app/(app)/performance/period-dialogs", () => ({
  QuestionsDialog: () => {
    questionsMounted.count += 1;
    return null;
  },
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
  "@/app/(app)/performance/periods/[id]/fairness/fairness-status",
  () => ({ FairnessStatus: () => null, publishLock: () => null }),
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

const mount = () =>
  render(
    <ToastProvider>
      <PeriodScreen cycleId="cycle-1" />
    </ToastProvider>,
  );

const person = (name: string, code = "NO_APPRAISER") => ({
  employeeId: name,
  employeeName: name,
  exceptions: [
    { severity: "BLOCKER", code, message: `${name} has no appraiser yet.` },
  ],
});

beforeEach(() => {
  canManage = true;
  state.exceptions = null;
});

describe("the people nobody is appraising", () => {
  it("are named, with a way to assign them", () => {
    state.exceptions = {
      rows: [person("Halima Sani"), person("Musa Ibrahim")],
    };
    mount();
    expect(
      screen.getByText(
        "2 people have no appraiser yet: Halima Sani and Musa Ibrahim.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Assign appraisers" }),
    ).toHaveAttribute("href", "/performance/appraisers?period=cycle-1");
  });

  it("names one person in the singular", () => {
    state.exceptions = { rows: [person("Halima Sani")] };
    mount();
    expect(
      screen.getByText("1 person has no appraiser yet: Halima Sani."),
    ).toBeInTheDocument();
  });

  it("names eight and counts the rest", () => {
    state.exceptions = {
      rows: Array.from({ length: 10 }, (_, i) => person(`Person ${i + 1}`)),
    };
    mount();
    expect(
      screen.getByText(
        /^10 people have no appraiser yet: Person 1, .*Person 8 and 2 others\.$/,
      ),
    ).toBeInTheDocument();
  });

  it("gives another kind of problem its own line", () => {
    state.exceptions = {
      rows: [person("Halima Sani"), person("Tunde Bakare", "NO_LINE_MANAGER")],
    };
    mount();
    expect(
      screen.getAllByRole("link", { name: "Assign appraisers" }),
    ).toHaveLength(2);
  });

  it("draws nothing when everybody has an appraiser", () => {
    state.exceptions = { rows: [] };
    mount();
    expect(
      screen.queryByRole("link", { name: "Assign appraisers" }),
    ).toBeNull();
  });
});
