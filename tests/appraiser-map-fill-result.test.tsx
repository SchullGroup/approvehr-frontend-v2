import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type {
  ApiAppraiser,
  ApiAppraiserMap,
  ApiAppraiserMapRow,
  ApiAutoAssigned,
} from "@/lib/api/performance";

/**
 * What "Fill in from the reporting line" says it did.
 *
 * The press can write the mapping, write manager forms on a running period, and
 * hand somebody their department head because nobody is recorded as their manager.
 * It used to answer with a count and a clamped toast line. Two things are worth
 * reading on screen: that the names are somewhere a person can read and act on (a
 * toast keeps two lines for six seconds), and that a field the server did not send
 * makes no claim.
 */

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

const row = (
  name: string,
  appraisers: ApiAppraiser[] = [],
): ApiAppraiserMapRow => ({
  employeeId: `e-${name}`,
  employeeName: name,
  jobTitle: "Analyst",
  departmentId: null,
  departmentName: null,
  lineManagerId: null,
  lineManagerName: null,
  appraisers,
  totalWeightBp: appraisers.length > 0 ? 10_000 : 0,
  submittedWeightBp: 0,
  weightedRating: null,
  exceptions: [],
});

/* The live map after the press: Pat has been given Hana, Ola and Fin have nobody. */
const MAP: ApiAppraiserMap = {
  cycleId: "cy1",
  cycleName: "H2 2026",
  stage: "SELF",
  started: true,
  rows: [
    row("Pat Test", [appraiser("Hana Test")]),
    row("Ola Test"),
    row("Fin Test"),
  ],
  counts: {
    people: 3,
    simple: 1,
    multiAppraiser: 0,
    unassigned: 2,
    blockers: 2,
    warnings: 0,
  },
};

let result: ApiAutoAssigned;
const reload = vi.fn();

vi.mock("@/lib/store/performance", () => ({
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
    reload,
  }),
  useAppraiserMutations: () => ({
    editable: true,
    refusal: "",
    autoAssign: () => Promise.resolve(result),
    setAppraisers: vi.fn(),
  }),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({ employees: [], people: [] }),
}));

const { AppraiserMapTab } =
  await import("@/app/(app)/performance/appraiser-map");

const press = async (response: ApiAutoAssigned) => {
  result = response;
  render(
    <ToastProvider>
      <AppraiserMapTab />
    </ToastProvider>,
  );
  await userEvent.click(
    screen.getByRole("button", { name: /Fill in from the reporting line/ }),
  );
};

beforeEach(() => {
  reload.mockClear();
});

describe("after filling in on a running period", () => {
  it("says how many forms were written, and names who was given their department head", async () => {
    await press({
      cycleId: "cy1",
      created: 2,
      formsCreated: 3,
      withoutManager: [],
      viaDepartmentHead: ["Pat Test", "Fia Test"],
    });

    expect(
      await screen.findByText("2 people given an appraiser"),
    ).toBeVisible();
    expect(
      screen.getByText("3 forms written for managers to answer."),
    ).toBeVisible();
    /* On the page, not in a toast that clamps and goes: a person has to be able to
       read who they are to check them. */
    expect(
      screen.getByText(
        "Pat Test and Fia Test were given their department head as appraiser, because nobody is recorded as their manager.",
      ),
    ).toBeVisible();
    expect(reload).toHaveBeenCalled();
  });

  it("says nothing about forms for a server that does not send the count, or sends none", async () => {
    await press({
      cycleId: "cy1",
      created: 1,
      withoutManager: [],
      viaDepartmentHead: [],
    });

    expect(
      await screen.findByText("1 person given an appraiser"),
    ).toBeVisible();
    expect(
      screen.queryByText(/written for managers to answer/),
    ).not.toBeInTheDocument();
    /* And an empty list says nobody was, which is not a sentence. */
    expect(
      screen.queryByText(/department head as appraiser/),
    ).not.toBeInTheDocument();
  });

  it("says nothing about forms when none were written", async () => {
    await press({
      cycleId: "cy1",
      created: 0,
      formsCreated: 0,
      withoutManager: [],
      viaDepartmentHead: [],
    });

    expect(
      await screen.findByText("Everybody already has an appraiser"),
    ).toBeVisible();
    expect(
      screen.queryByText(/written for managers to answer/),
    ).not.toBeInTheDocument();
  });

  it("says a repair, where the mapping was whole and the forms were missing", async () => {
    await press({
      cycleId: "cy1",
      created: 0,
      formsCreated: 2,
      withoutManager: [],
      viaDepartmentHead: [],
    });

    expect(
      await screen.findByText("Everybody already has an appraiser"),
    ).toBeVisible();
    expect(
      screen.getByText("2 forms written for managers to answer."),
    ).toBeVisible();
  });
});

describe("who is still without an appraiser", () => {
  it("is read against the live map, so somebody assigned since the press drops off", async () => {
    await press({
      cycleId: "cy1",
      created: 1,
      withoutManager: ["Ola Test", "Pat Test"],
      viaDepartmentHead: [],
    });

    /* Pat has an appraiser in the map now, so the line is about Ola alone. */
    expect(
      await screen.findByText(
        "Still nobody appraising Ola Test. Nobody is recorded as their manager and no department head can stand in. Assign somebody by hand.",
      ),
    ).toBeVisible();
  });

  it("keeps the old reason for a server that has no department-head rule", async () => {
    await press({ cycleId: "cy1", created: 1, withoutManager: ["Ola Test"] });

    expect(
      await screen.findByText(
        "Still nobody appraising Ola Test. They have no manager either. Assign somebody by hand.",
      ),
    ).toBeVisible();
    /* It cannot say a department head was looked for. */
    expect(screen.queryByText(/department head/)).not.toBeInTheDocument();
  });

  it("is not a line at all once everybody it named has somebody", async () => {
    await press({
      cycleId: "cy1",
      created: 1,
      withoutManager: ["Pat Test"],
      viaDepartmentHead: [],
    });

    await waitFor(() =>
      expect(screen.getByText("1 person given an appraiser")).toBeVisible(),
    );
    expect(
      screen.queryByText(/Still nobody appraising/),
    ).not.toBeInTheDocument();
  });
});
