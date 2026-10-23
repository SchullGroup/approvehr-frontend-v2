import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ScheduledNote,
  allowanceLine,
} from "@/app/(app)/payroll/runs/new/scheduled-note";
import type {
  ApiScheduledAllowance,
  ApiScheduledAllowances,
  ApiScheduleStatus,
} from "@/lib/api/pay-components";
import type { ScheduledAllowancesState } from "@/lib/store/scheduled-allowances";

/**
 * What a payroll run says about allowances on a schedule.
 *
 * Two things matter here and neither is the arithmetic, which is the API's. The
 * line is quiet and says only what it knows: no answer, a run that is not open
 * and a run with nothing on a schedule all render nothing, never "no allowances
 * held back". And the figure printed is the payment the API reported, and only
 * when there is one: an allowance that is a percentage reports no amount.
 */

const due: ApiScheduleStatus = {
  due: true,
  occurrence: 1,
  text: "Due this month",
  nextDue: null,
  reason: null,
};

const later: ApiScheduleStatus = {
  due: false,
  occurrence: null,
  text: "Next due Mar 2028",
  nextDue: "2028-03-01",
  reason: "BETWEEN_PAYMENTS",
};

const allowance = (
  over: Partial<ApiScheduledAllowance> = {},
): ApiScheduledAllowance => ({
  componentId: "c1",
  assignmentId: null,
  code: "long_service",
  name: "Long-service allowance",
  schedule: {
    qualifyingMonths: 36,
    serviceClock: "START_DATE",
    frequency: "EVERY_N_MONTHS",
    intervalMonths: 36,
    maxPayments: null,
    durationMonths: null,
    isEveryMonth: false,
    summary: "After 3 years of service, then every 3 years",
  },
  amountKobo: 120_000_000,
  rate: null,
  basis: "FIXED",
  status: later,
  ...over,
});

function state(
  people: ApiScheduledAllowances["people"],
  over: Partial<ApiScheduledAllowances> = {},
  available = true,
): ScheduledAllowancesState {
  const answer: ApiScheduledAllowances = {
    runId: "r1",
    period: "2026-10-01",
    sequence: 1,
    status: "IN_REVIEW",
    open: true,
    people,
    ...over,
  };
  return {
    available,
    loading: false,
    answer,
    byEmployee: new Map(people.map((p) => [p.employeeId, p.allowances])),
  };
}

const names = new Map([
  ["e1", "Halimat Akande"],
  ["e2", "Tunde Bakare"],
]);

/** The mark's accessible name is its whole message. */
const markText = () =>
  screen
    .getByRole("button", { name: /follows the schedules/ })
    .getAttribute("aria-label") ?? "";

describe("one line, said once", () => {
  it("says a line for what is held back, and puts the detail behind the mark", () => {
    render(
      <ScheduledNote
        mode="held"
        names={names}
        scheduled={state([
          { employeeId: "e1", allowances: [allowance()] },
          { employeeId: "e2", allowances: [allowance({ status: due })] },
        ])}
      />,
    );
    /* Tunde's allowance falls due, so it is the other mode's; only Halimat is held. */
    expect(
      screen.getByText(
        "1 person has an allowance that is not due this month, so it is not on their payslip.",
      ),
    ).toBeInTheDocument();
    const text = markText();
    expect(text).toContain(
      "Halimat Akande: Long-service allowance, next due Mar 2028",
    );
    expect(text).not.toContain("Tunde Bakare");
  });

  it("says a line for what falls due, with the payment the API reported", () => {
    render(
      <ScheduledNote
        mode="due"
        names={names}
        scheduled={state([
          { employeeId: "e2", allowances: [allowance({ status: due })] },
        ])}
      />,
    );
    expect(
      screen.getByText("1 person has an allowance falling due this month."),
    ).toBeInTheDocument();
    expect(markText()).toContain(
      "Tunde Bakare: Long-service allowance, due this month, ₦1,200,000.00",
    );
  });

  it("counts people, not allowances, and says so in the plural", () => {
    render(
      <ScheduledNote
        mode="held"
        names={names}
        scheduled={state([
          {
            employeeId: "e1",
            allowances: [allowance(), allowance({ componentId: "c2" })],
          },
          { employeeId: "e2", allowances: [allowance()] },
        ])}
      />,
    );
    expect(
      screen.getByText(
        "2 people have an allowance that is not due this month, so it is not on their payslip.",
      ),
    ).toBeInTheDocument();
  });

  it("says it follows the schedule as it stands, and not the last calculation", () => {
    render(
      <ScheduledNote
        mode="held"
        names={names}
        scheduled={state([{ employeeId: "e1", allowances: [allowance()] }])}
      />,
    );
    expect(markText()).toContain("calculate again so the payslips match");
  });

  it("stops after a dozen, and says how many more", () => {
    const people = Array.from({ length: 15 }, (_, index) => ({
      employeeId: `x${String(index)}`,
      allowances: [allowance()],
    }));
    render(
      <ScheduledNote mode="held" names={names} scheduled={state(people)} />,
    );
    expect(markText()).toContain("and 3 more.");
  });

  it("does not name somebody it was not told the name of as a stranger's", () => {
    render(
      <ScheduledNote
        mode="held"
        names={new Map()}
        scheduled={state([{ employeeId: "zz", allowances: [allowance()] }])}
      />,
    );
    expect(markText()).toContain("Somebody on this payroll:");
  });
});

describe("what it does not say", () => {
  const render_ = (scheduled: ScheduledAllowancesState) =>
    render(<ScheduledNote mode="held" names={names} scheduled={scheduled} />);

  it("says nothing with no answer, rather than that nothing is held back", () => {
    const { container } = render_({
      available: false,
      loading: false,
      answer: null,
      byEmployee: new Map(),
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("says nothing while the answer is still on its way", () => {
    const { container } = render_({
      available: false,
      loading: true,
      answer: null,
      byEmployee: new Map(),
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("says nothing for a run that is not open: its payslips are the record", () => {
    const { container } = render_(
      state([{ employeeId: "e1", allowances: [allowance()] }], { open: false }),
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("says nothing when nobody is on a schedule", () => {
    const { container } = render_(state([]));
    expect(container).toBeEmptyDOMElement();
  });

  it("says nothing in a mode when everything is the other one", () => {
    const { container } = render(
      <ScheduledNote
        mode="held"
        names={names}
        scheduled={state([
          { employeeId: "e1", allowances: [allowance({ status: due })] },
        ])}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the line for one allowance", () => {
  it("reads in lower case after the name, and leaves a status that starts with a capital word alone", () => {
    expect(
      allowanceLine({
        name: "Long-service allowance",
        status: later,
        amountKobo: 120_000_000,
      }),
    ).toBe("Long-service allowance, next due Mar 2028");
    expect(
      allowanceLine({
        name: "Long-service allowance",
        status: { ...later, text: "PAYE year end" },
        amountKobo: null,
      }),
    ).toBe("Long-service allowance, PAYE year end");
  });

  it("gives the payment only when it falls due and the API reported one", () => {
    expect(
      allowanceLine({ name: "Bonus", status: due, amountKobo: 5_000_000 }),
    ).toBe("Bonus, due this month, ₦50,000.00");
    /* A percentage reports no amount, and then none is shown. */
    expect(
      allowanceLine({ name: "Bonus", status: due, amountKobo: null }),
    ).toBe("Bonus, due this month");
    /* Not due: no figure, however much the allowance is. */
    expect(
      allowanceLine({ name: "Bonus", status: later, amountKobo: 5_000_000 }),
    ).toBe("Bonus, next due Mar 2028");
  });
});
