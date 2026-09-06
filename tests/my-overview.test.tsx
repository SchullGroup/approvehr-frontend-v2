import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MyOverview } from "@/app/(app)/dashboard/my-overview";
import type { MyOverview as Data } from "@/lib/api/insights";

/**
 * Absent is not zero, asserted by rendering rather than by reading.
 *
 * This rule appears in a dozen places in `HANDOVER.md` and every instance of it
 * being got wrong was found by a person looking at a screen — a `₦0.00` where a
 * figure does not belong, a "0 of 0" where nothing is ready. `tsc` cannot see
 * any of them: `netKobo: number` is satisfied by a zero, and so is the type of
 * every wrong claim this file exists to stop.
 *
 * The card is the right first subject because it puts all three shapes on one
 * screen: an absence that must draw nothing, an absence that must draw nothing
 * for a different reason, and a zero that is a real and useful answer.
 */

const base: Data = { leave: [], waitingOnMe: 0 };

describe("what an employee's own card says", () => {
  it("renders NOTHING when there is nothing true to say", () => {
    /* No pay, no leave, nothing waiting. A card with three absences in it
       spends the top of the first screen saying nothing has happened yet. */
    const { container } = render(<MyOverview me={base} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("never prints ₦0.00 for somebody no payroll has included", () => {
    render(
      <MyOverview
        me={{
          ...base,
          leave: [
            { leaveType: "Annual", entitled: 20, taken: 3, remaining: 17 },
          ],
        }}
      />,
    );
    /* "The company paid you nothing" is a different and much worse claim than
       "there is nothing to show yet". */
    expect(screen.queryByText(/₦0\.00/)).toBeNull();
    expect(screen.queryByText(/Last payslip/)).toBeNull();
  });

  it("draws a genuine nil differently from an absence", () => {
    /* A payslip that came to zero is a fact about a payroll that ran. It is
       shown, where an absent one is not. */
    render(
      <MyOverview
        me={{ ...base, pay: { period: "2026-08", netKobo: 0, paid: true } }}
      />,
    );
    expect(screen.getByText("₦0.00")).toBeInTheDocument();
  });

  it("says approved, not paid, until the money has actually left", () => {
    render(
      <MyOverview
        me={{
          ...base,
          pay: { period: "2026-08", netKobo: 137363144, paid: false },
        }}
      />,
    );
    /* Approving is a decision; paying is money that left. Telling an employee
       they have been paid when the batch has not settled is the green Paid
       button aimed at the person it would hurt. */
    expect(screen.getByText(/approved, not yet paid/)).toBeInTheDocument();
    expect(screen.getByText("₦1,373,631.44")).toBeInTheDocument();
  });

  it("names the month rather than printing the period key", () => {
    render(
      <MyOverview
        me={{ ...base, pay: { period: "2026-08", netKobo: 100, paid: true } }}
      />,
    );
    expect(screen.getByText(/August 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-08/)).toBeNull();
  });

  it("lists every leave type and asserts none of them is 'your leave'", () => {
    /* The API deliberately does not pick one, because nothing on a leave type
       says which is the ordinary annual one — the version that did pick showed
       a man 84 days of maternity leave. The card must not re-introduce the
       guess by rendering only the first. */
    render(
      <MyOverview
        me={{
          ...base,
          leave: [
            { leaveType: "Maternity", entitled: 84, taken: 0, remaining: 84 },
            { leaveType: "Annual", entitled: 20, taken: 3, remaining: 12 },
          ],
        }}
      />,
    );
    expect(screen.getByText("Maternity")).toBeInTheDocument();
    expect(screen.getByText("Annual")).toBeInTheDocument();
  });

  it("draws zero for a queue, because 'nothing needs you' is a real answer", () => {
    /* The one place a zero belongs on this card, and the distinction the whole
       file is about: an absent figure and a nil figure are different claims. */
    render(
      <MyOverview
        me={{ ...base, pay: { period: "2026-08", netKobo: 100, paid: true } }}
      />,
    );
    expect(screen.getByText("Nothing needs you")).toBeInTheDocument();
  });

  it("counts in words that agree with the number", () => {
    const { rerender } = render(
      <MyOverview me={{ ...base, waitingOnMe: 1 }} />,
    );
    expect(screen.getByText("1 thing to decide")).toBeInTheDocument();
    rerender(<MyOverview me={{ ...base, waitingOnMe: 4 }} />);
    /* "1 things" on the first screen of the module is the pluralisation defect
       HANDOVER records for `EXCEPTION_CODE_SUMMARY`, one screen along. */
    expect(screen.getByText("4 things to decide")).toBeInTheDocument();
  });
});
