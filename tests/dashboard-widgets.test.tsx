import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WIDGET_COMPONENTS } from "@/app/(app)/dashboard/widgets";
import { WIDGETS, widgetById } from "@/app/(app)/dashboard/catalogue";
import type {
  DashboardData,
  MyOverview as Data,
  ReportsData,
} from "@/lib/api/insights";

/**
 * Absent is not zero, asserted by rendering rather than by reading.
 *
 * This rule appears in a dozen places in `HANDOVER.md` and every instance of it
 * being got wrong was found by a person looking at a screen — a `₦0.00` where a
 * figure does not belong, a "0 of 0" where nothing is ready. `tsc` cannot see
 * any of them: `netKobo: number` is satisfied by a zero, and so is the type of
 * every wrong claim this file exists to stop.
 *
 * The three personal widgets are the right first subject because between them
 * they carry all three shapes: an absence that must draw nothing, an absence
 * that must draw nothing for a different reason, and a zero that is a real and
 * useful answer.
 *
 * They were one component (`my-overview.tsx`) and are three catalogue entries
 * now, because the owner's dashboard should not open with their own leave
 * balance and a single card could not be split. Every assertion below survived
 * that move unchanged, which is the point of writing them against rendered
 * output rather than against a component's internals.
 */

const base: Data = { leave: [], waitingOnMe: 0 };

/** Everything else the dashboard payload carries, absent. */
const EMPTY: DashboardData = {
  asOf: "2026-09-07T09:00:00.000Z",
  announcements: { notices: [], total: 0 },
};

const REPORTS: ReportsData | null = null;

/** One widget, rendered with a `me` block and nothing else. */
function renderWidget(id: string, me?: Data) {
  const Widget = WIDGET_COMPONENTS[id];
  if (!Widget) throw new Error(`No component for ${id}`);
  return render(
    <Widget
      dashboard={me ? { ...EMPTY, me } : EMPTY}
      reports={REPORTS}
      reportsLoading={false}
    />,
  );
}

describe("what an employee's own card says", () => {
  it("renders NOTHING for a person no payroll has included", () => {
    const { container } = renderWidget("my-pay", base);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders NOTHING when the company has configured no leave", () => {
    /* No entitlement is a company that has not set leave up, not a person with
       no days left. */
    const { container } = renderWidget("my-leave", base);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders NOTHING at all for an account with no staff record", () => {
    /* `me` absent, which is a real state: an account can exist with no employee
       behind it. All three must draw nothing rather than zeroes. */
    for (const id of ["my-pay", "my-leave", "my-queue"]) {
      const { container } = renderWidget(id);
      expect(container).toBeEmptyDOMElement();
    }
  });

  it("never prints ₦0.00 for somebody no payroll has included", () => {
    renderWidget("my-leave", {
      ...base,
      leave: [{ leaveType: "Annual", entitled: 20, taken: 3, remaining: 17 }],
    });
    /* "The company paid you nothing" is a different and much worse claim than
       "there is nothing to show yet". */
    expect(screen.queryByText(/₦0\.00/)).toBeNull();
    expect(screen.queryByText(/Last payslip/)).toBeNull();
  });

  it("draws a genuine nil differently from an absence", () => {
    /* A payslip that came to zero is a fact about a payroll that ran. It is
       shown, where an absent one is not. */
    renderWidget("my-pay", {
      ...base,
      pay: { period: "2026-08", netKobo: 0, paid: true },
    });
    expect(screen.getByText("₦0.00")).toBeInTheDocument();
  });

  it("says approved, not paid, until the money has actually left", () => {
    renderWidget("my-pay", {
      ...base,
      pay: { period: "2026-08", netKobo: 137363144, paid: false },
    });
    /* Approving is a decision; paying is money that left. Telling an employee
       they have been paid when the batch has not settled is the green Paid
       button aimed at the person it would hurt. */
    expect(screen.getByText(/approved, not yet paid/)).toBeInTheDocument();
    expect(screen.getByText("₦1,373,631.44")).toBeInTheDocument();
  });

  it("names the month rather than printing the period key", () => {
    renderWidget("my-pay", {
      ...base,
      pay: { period: "2026-08", netKobo: 100, paid: true },
    });
    /* Short, because this label is an axis label as often as it is prose. */
    expect(screen.getByText(/Aug 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-08/)).toBeNull();
  });

  it("lists every leave type and asserts none of them is 'your leave'", () => {
    /* The API deliberately does not pick one, because nothing on a leave type
       says which is the ordinary annual one — the version that did pick showed
       a man 84 days of maternity leave. The card must not re-introduce the
       guess by rendering only the first. */
    renderWidget("my-leave", {
      ...base,
      leave: [
        { leaveType: "Maternity", entitled: 84, taken: 0, remaining: 84 },
        { leaveType: "Annual", entitled: 20, taken: 3, remaining: 12 },
      ],
    });
    expect(screen.getByText("Maternity")).toBeInTheDocument();
    expect(screen.getByText("Annual")).toBeInTheDocument();
  });

  it("draws zero for a queue, because 'nothing needs you' is a real answer", () => {
    /* The one place a zero belongs on this card, and the distinction the whole
       file is about: an absent figure and a nil figure are different claims. */
    renderWidget("my-queue", base);
    expect(screen.getByText("Nothing needs you")).toBeInTheDocument();
  });

  it("counts in words that agree with the number", () => {
    const { unmount } = renderWidget("my-queue", { ...base, waitingOnMe: 1 });
    expect(screen.getByText("1 thing to decide")).toBeInTheDocument();
    unmount();
    renderWidget("my-queue", { ...base, waitingOnMe: 4 });
    /* "1 things" on the first screen of the module is the pluralisation defect
       HANDOVER records for `EXCEPTION_CODE_SUMMARY`, one screen along. */
    expect(screen.getByText("4 things to decide")).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */

describe("the catalogue and the components agree", () => {
  /**
   * The one thing neither `tsc` nor a reviewer reliably catches.
   *
   * `WIDGETS` is a list of ids and `WIDGET_COMPONENTS` is a map keyed by id, and
   * nothing connects them but a string typed twice. An entry with no component
   * is a card somebody adds from the drawer that then draws nothing and cannot
   * be diagnosed; a component with no entry is dead code nobody can reach.
   */
  it("every catalogue entry has a component", () => {
    const missing = WIDGETS.filter((widget) => !WIDGET_COMPONENTS[widget.id]);
    expect(missing.map((widget) => widget.id)).toEqual([]);
  });

  it("every component is in the catalogue", () => {
    const orphans = Object.keys(WIDGET_COMPONENTS).filter(
      (id) => !widgetById(id),
    );
    expect(orphans).toEqual([]);
  });

  it("every id is one the API will accept", () => {
    /* `dashboardLayoutBody` refuses anything but lower-case letters, digits and
       hyphens. An id with an underscore in it would save nowhere and the drawer
       would silently stop persisting — so the vocabulary is checked here rather
       than discovered by a 422. */
    const bad = WIDGETS.filter((widget) => !/^[a-z0-9-]+$/.test(widget.id));
    expect(bad.map((widget) => widget.id)).toEqual([]);
  });

  it("does not put the owner's own leave balance on their dashboard", () => {
    /* The product owner's own words: "The owner does not need to see leave
       left." Every other tier keeps it — an HR manager is also somebody with
       days to book — and the owner can add it from the drawer. */
    expect(widgetById("my-leave")?.defaultFor).not.toContain("owner");
    expect(widgetById("my-leave")?.defaultFor).toContain("staff");
    expect(widgetById("my-leave")?.defaultFor).toContain("admin");
  });

  it("gives the owner appraisals as a card rather than a header button", () => {
    expect(widgetById("appraisals")?.defaultFor).toContain("owner");
    expect(widgetById("appraisals")?.feature).toBe("appraisals");
  });
});
