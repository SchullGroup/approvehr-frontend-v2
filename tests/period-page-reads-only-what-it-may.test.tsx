import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

/**
 * The period page asks only for what the reader may read (UAT 23 Nov, L11 /
 * CRAWL-6). HR without the settings permission got two 403s on every load: the
 * questions (read by the mounted Questions dialog) and the revision requests.
 */

let canManage = true;
const registerCalls: unknown[][] = [];
const questionsMounted = vi.hoisted(() => ({ count: 0 }));
const questionsRead = vi.hoisted(() => ({ count: 0 }));
let updateCycle: Mock<(...args: unknown[]) => Promise<unknown>>;
const reload = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/performance/periods/cycle-1",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: (permission: string) =>
    permission === "MANAGE_SETTINGS" ? canManage : true,
}));
vi.mock("@/lib/store/performance", () => ({
  useKpis: () => ({
    goals: [],
    cascade: [],
    loading: false,
    error: null,
    reload: () => {},
  }),
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
        stage: "DRAFT",
        stageLabel: "not started",
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
      participants: null,
      register: null,
      revisionRequests: [],
      revisionsUnavailable: false,
      available: false,
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

beforeEach(() => {
  registerCalls.length = 0;
  questionsMounted.count = 0;
  questionsRead.count = 0;
  updateCycle = vi.fn();
});

describe("what the period page asks for", () => {
  it("does not ask for the questions or the revision requests without the settings permission", () => {
    canManage = false;
    mount();
    expect(questionsMounted.count).toBe(0);
    expect(questionsRead.count).toBe(0);
    expect(registerCalls.at(-1)?.[2]).toBe(false);
  });

  it("asks for both for whoever may write the questions", () => {
    canManage = true;
    mount();
    expect(questionsMounted.count).toBeGreaterThan(0);
    expect(questionsRead.count).toBeGreaterThan(0);
    expect(registerCalls.at(-1)?.[2]).toBe(true);
  });
});
