import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiScoreHistory } from "@/lib/api/performance";
import { ScoreHistoryScreen } from "@/app/(app)/performance/history/[employeeId]/history-screen";

/**
 * A person's history page has two tabs, and both have to open something.
 *
 * Found by clicking it: **Work record** highlighted and the page under it did
 * not change. The tab strip, the state that remembers which tab is open and the
 * panel itself were all still in the file; the two lines that put the panel on
 * the page when its tab is chosen were not. Merging `staging` into `dev` (#455)
 * took staging's version of the body, which had never had them, and kept dev's
 * strip. Nothing in `tsc`, lint or the build can see a control that is wired to
 * nothing: every part of it was correct, and the page still did nothing.
 *
 * The panel is a real `tabpanel` named by the tab that opened it, which is what
 * `aria-controls` on each tab points at; the screens that use `Tabs` with
 * children all get that, and this one now does too.
 */

const state = vi.hoisted(() => ({
  history: null as unknown,
  error: null as unknown,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/performance/history/emp-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/store/performance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/performance")>()),
  useScoreHistory: () => ({
    history: state.history,
    loading: false,
    error: state.error,
    available: true,
    refusal: "",
    reload: () => {},
  }),
}));
/* The panel has its own tests (`work-record.test.tsx`). Here it only has to
   appear, and to be asked about the right person. */
vi.mock("@/components/performance/work-record", () => ({
  WorkRecordPanel: ({ employeeId }: { employeeId?: string }) => (
    <div data-testid="work-record-panel" data-employee-id={employeeId ?? ""}>
      The work record
    </div>
  ),
}));

const history = (over: Partial<ApiScoreHistory> = {}): ApiScoreHistory => ({
  employeeId: "emp-1",
  employeeName: "Emeka Anyanwu",
  jobTitle: "Engineer",
  departmentId: null,
  departmentName: "Product",
  points: [],
  counts: { cycles: 0, scored: 0, unscored: 0 },
  unscoredCycles: [],
  trend: null,
  truncated: false,
  limit: 12,
  withheldCycles: 0,
  withheldNote: null,
  ...over,
});

const FORBIDDEN =
  "You can read your own history, your direct reports', or anyone's with the records permission.";

beforeEach(() => {
  state.history = history();
  state.error = null;
});
afterEach(cleanup);

const open = () => render(<ScoreHistoryScreen employeeId="emp-1" />);
const tab = (name: string) => screen.getByRole("tab", { name });

describe("the history page's two tabs", () => {
  it("opens on the appraisal history, with no work record on the page", () => {
    open();

    expect(tab("Appraisal history")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Latest mark")).toBeInTheDocument();
    expect(screen.queryByTestId("work-record-panel")).not.toBeInTheDocument();
  });

  it("Work record puts the work record on the page, for this person, in place of the history", async () => {
    open();

    await userEvent.click(tab("Work record"));

    expect(tab("Work record")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("work-record-panel")).toHaveAttribute(
      "data-employee-id",
      "emp-1",
    );
    expect(screen.queryByText("Latest mark")).not.toBeInTheDocument();
  });

  it("Appraisal history brings the history back and takes the work record off", async () => {
    open();
    await userEvent.click(tab("Work record"));

    await userEvent.click(tab("Appraisal history"));

    expect(tab("Appraisal history")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Latest mark")).toBeInTheDocument();
    expect(screen.queryByTestId("work-record-panel")).not.toBeInTheDocument();
  });

  it("the keyboard reaches the work record as well", async () => {
    open();
    tab("Appraisal history").focus();

    await userEvent.keyboard("{ArrowRight}");

    expect(screen.getByTestId("work-record-panel")).toBeInTheDocument();
    expect(tab("Work record")).toHaveFocus();
  });

  it("the panel is a tabpanel named by the tab that opened it", async () => {
    open();
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName(
      "Appraisal history",
    );

    await userEvent.click(tab("Work record"));

    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Work record");
    expect(screen.getByRole("tabpanel")).toContainElement(
      screen.getByTestId("work-record-panel"),
    );
  });
});

describe("the work record and a history that did not load", () => {
  /* The history read can be refused on purpose (an appraiser assigned to one
     period may not read a whole trend) while the work record is a different
     question with its own answer. The failure belongs to the history tab. */
  it("the failure is on the history tab, and the work record is still there", async () => {
    state.history = null;
    state.error = new ApiError(403, "forbidden", FORBIDDEN);
    open();

    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument();
    expect(screen.queryByTestId("work-record-panel")).not.toBeInTheDocument();

    await userEvent.click(tab("Work record"));

    expect(screen.getByTestId("work-record-panel")).toBeInTheDocument();
    expect(screen.queryByText(FORBIDDEN)).not.toBeInTheDocument();
  });
});
