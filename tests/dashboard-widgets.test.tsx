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

/* ==========================================================================
 * A report that arrived without one of its sections
 * ======================================================================== */

describe("a widget survives a report missing a section", () => {
  /**
   * From production, on a real customer's dashboard:
   *
   *     TypeError: Cannot read properties of undefined (reading 'trend')
   *       at chart-headcount-trend
   *
   * `reports?.workforce.trend` — the `?.` guarded `reports`, which is null
   * while loading, and **nothing guarded the section**. An API that does not
   * send `workforce` therefore threw from inside a render, and the whole
   * dashboard went behind the error boundary: not one broken card, the
   * screen.
   *
   * A browser cannot pin the version of the API it is talking to. A deploy
   * puts a new bundle in front of people while the API behind it is whatever
   * it is, so *any* section this client treats as guaranteed is a promise it
   * cannot keep. `DashboardData` already models that — `pay?`, `headcount?`,
   * `approvals?` are optional because the API omits them by permission — and
   * `ReportsData` was written as though the same module answered differently.
   *
   * `tsc` could not help while the type lied. The moment the sections were
   * marked optional it found **26** unguarded reads across two screens: these
   * five, and twenty-one more in `/reports`, which would have gone the same
   * way for the same company on the next click.
   *
   * These assertions are deliberately about **not throwing** rather than about
   * output. A widget with no data to draw renders nothing, which is already
   * covered above; what this file could not previously catch is the render
   * that takes the page down with it.
   */
  const SECTIONS = [
    "workforce",
    "headcount",
    "operationalLoad",
  ] as const satisfies readonly (keyof ReportsData)[];

  /** A complete report, then one section deleted. */
  function reportWithout(missing: (typeof SECTIONS)[number]): ReportsData {
    const full: ReportsData = {
      period: "2026-09",
      payrollByDepartment: null,
      grossBreakdown: null,
      headcount: {
        byDepartment: [{ name: "Engineering", count: 4 }],
        byEmploymentType: [{ type: "FULL_TIME", count: 4 }],
      },
      operationalLoad: {
        leaveRequests: 1,
        ticketsOpen: 0,
        approvalsPending: 2,
        attendanceCorrections: 0,
      },
      workforce: {
        trend: [
          { month: "2026-07", headcount: 3, joiners: 1, leavers: 0 },
          { month: "2026-08", headcount: 4, joiners: 1, leavers: 0 },
        ],
        turnoverBp: null,
        turnoverWindowMonths: 12,
        averageTenureMonths: null,
        headcountNow: 4,
      },
    };
    /* `delete` rather than `undefined`, because that is what a JSON body from
       an older API actually looks like: the key is not there at all. */
    const partial: ReportsData = { ...full };
    delete partial[missing];
    return partial;
  }

  /** Every widget in the catalogue that reads the reports payload. */
  const reportWidgets = WIDGETS.filter((widget) => widget.source === "reports");

  it("has report-backed widgets to test", () => {
    /* If this ever hits zero the loop below is asserting nothing, which is the
       way a test like this rots without failing. */
    expect(reportWidgets.length).toBeGreaterThan(0);
  });

  for (const section of SECTIONS) {
    it(`renders every report widget with no \`${section}\``, () => {
      const reports = reportWithout(section);
      for (const widget of reportWidgets) {
        const Widget = WIDGET_COMPONENTS[widget.id];
        if (!Widget) throw new Error(`No component for ${widget.id}`);
        /* The assertion is the absence of a throw. `render` propagates one, so
           a regression here fails this test rather than a browser three weeks
           later. */
        expect(() =>
          render(
            <Widget
              dashboard={EMPTY}
              reports={reports}
              reportsLoading={false}
            />,
          ),
        ).not.toThrow();
      }
    });
  }

  it("renders them all with an entirely empty report", () => {
    /* The floor: a body with nothing but the period. Nothing here should draw
       a figure, and nothing should throw reaching for one. */
    const bare = {
      period: "2026-09",
      payrollByDepartment: null,
      grossBreakdown: null,
    } as ReportsData;
    for (const widget of reportWidgets) {
      const Widget = WIDGET_COMPONENTS[widget.id];
      if (!Widget) throw new Error(`No component for ${widget.id}`);
      expect(() =>
        render(
          <Widget dashboard={EMPTY} reports={bare} reportsLoading={false} />,
        ),
      ).not.toThrow();
    }
  });
});
