import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type {
  ApiAppraiser,
  ApiAppraiserMap,
  ApiAppraiserMapRow,
} from "@/lib/api/performance";

/**
 * The words around the manager's overall mark, now that it can be scored.
 *
 * Four sentences used to say the opposite of what the code did, and then one said
 * what it did only until the part existed: "Your review counts for 100% of the
 * mark", "how much of the mark each one carries", "Each appraiser gets a share of
 * the mark", and "not counted in it". The first three were never true of anything
 * the manager wrote. What is said now is true at every weight, or comes from the
 * API; and a server that predates the part is told nothing about it.
 */

const state = vi.hoisted(() => ({ weights: null as unknown }));

const appraiser = (name: string): ApiAppraiser => ({
  assignmentId: `a-${name}`,
  appraiserId: `id-${name}`,
  appraiserName: name,
  jobTitle: "Lead",
  role: "LINE_MANAGER",
  roleLabel: "Line manager",
  weightBp: 10_000,
  note: null,
  reviewId: null,
  submitted: false,
  rating: null,
  unavailable: false,
});

const row = (name: string): ApiAppraiserMapRow => ({
  employeeId: `e-${name}`,
  employeeName: name,
  jobTitle: "Analyst",
  departmentId: null,
  departmentName: null,
  lineManagerId: null,
  lineManagerName: null,
  appraisers: [appraiser("Hana Test")],
  totalWeightBp: 10_000,
  submittedWeightBp: 0,
  weightedRating: null,
  exceptions: [],
});

const MAP: ApiAppraiserMap = {
  cycleId: "cy1",
  cycleName: "H2 2026",
  stage: "SELF",
  started: true,
  rows: [row("Pat Test")],
  counts: {
    people: 1,
    simple: 1,
    multiAppraiser: 0,
    unassigned: 0,
    blockers: 0,
    warnings: 0,
  },
};

vi.mock("@/lib/store/performance", () => ({
  useScoringWeights: () => ({
    weights: state.weights,
    loading: false,
    error: null,
    source: "api",
  }),
  useFramework: () => ({ loading: false, error: null, groups: [] }),
  useAppraisals: () => ({
    cycles: [
      {
        id: "cy1",
        name: "H2 2026",
        stage: "SELF",
        stageLabel: "Self-appraisal",
      },
    ],
    loading: false,
  }),
  useAppraiserMap: () => ({
    map: MAP,
    loading: false,
    error: null,
    editable: true,
    refusal: "",
    reload: vi.fn(),
  }),
  useAppraiserMutations: () => ({
    editable: true,
    refusal: "",
    autoAssign: vi.fn(),
    setAppraisers: vi.fn(),
  }),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({ employees: [], people: [] }),
}));

const { HowItWorksBody } = await import("@/app/(app)/performance/how-it-works");
const { AppraiserMapTab } =
  await import("@/app/(app)/performance/appraiser-map");
const { FEATURE_COPY } = await import("@/lib/store/features");

const base = [
  {
    component: "OBJECTIVES",
    label: "Delivery against objectives",
    weightBp: 5000,
  },
  { component: "LEADERSHIP", label: "Leadership", weightBp: 5000 },
];
const serve = (managerLabel: string | null, note?: string) => {
  state.weights = {
    source: "saved",
    rows: [
      ...base,
      ...(managerLabel === null
        ? []
        : [
            {
              component: "MANAGER_APPRAISAL",
              label: managerLabel,
              weightBp: 0,
            },
          ]),
    ],
    totalBp: 10000,
    selfAssessmentNote: "THE SELF NOTE",
    ...(note === undefined ? {} : { managerAppraisalNote: note }),
  };
};

beforeEach(() => {
  serve("Manager appraisal", "THE API'S MANAGER NOTE");
});
afterEach(cleanup);

describe("How it works", () => {
  it("explains the part, by the company's own name for it, where the server has it", () => {
    serve("Line view", "THE API'S MANAGER NOTE");
    render(<HowItWorksBody />);
    expect(screen.getByText("Line view can count too")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Line view counts toward the mark only when the period gives it a weight\./,
      ),
    ).toBeInTheDocument();
  });

  it("states the rules that hold at every weight, and none that depends on one", () => {
    render(<HowItWorksBody />);
    const text =
      screen.getByText(/counts toward the mark only when/).textContent ?? "";
    expect(text).toContain(
      "weighted by their share when a person has more than one",
    );
    expect(text).toContain(
      "a manager’s form asks for an overall mark and needs one",
    );
    expect(text).toContain("spread over the other parts");
    expect(text).not.toMatch(/\d+%/);
  });

  it("draws the API's own note about the saved weight, once, and writes none of its own", () => {
    render(<HowItWorksBody />);
    expect(screen.getAllByText("THE API'S MANAGER NOTE")).toHaveLength(1);
  });

  it("says nothing about the part where the server has none", () => {
    serve(null);
    render(<HowItWorksBody />);
    expect(screen.queryByText(/Manager appraisal can count too/)).toBeNull();
    expect(screen.queryByText(/overall mark/i)).toBeNull();
  });
});

describe("the appraiser mapping", () => {
  it("opens the shares from a button that does not call it the mark", async () => {
    render(
      <ToastProvider>
        <AppraiserMapTab />
      </ToastProvider>,
    );
    expect(
      screen.queryByRole("button", { name: /Share the mark for/ }),
    ).toBeNull();
    await userEvent.click(
      screen.getByRole("button", {
        name: "Set several appraisers for Pat Test and their shares",
      }),
    );
    expect(
      screen.getByText(
        "Everybody who has a say, and how much each one's overall mark weighs against the others'. The shares have to make 100%.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/how much of the mark each one carries/),
    ).toBeNull();
  });

  it("describes the feature as deciding how much an appraiser's overall mark weighs, which is true at any weight", () => {
    const line = FEATURE_COPY.multiAppraiser.line;
    expect(line).toContain("share decides how much their overall mark weighs");
    expect(line).not.toMatch(/share of the mark/);
  });
});
