import { describe, expect, it } from "vitest";
import {
  advanceApprovedCopy,
  advanceDeclinedToast,
  advanceRequestedCopy,
  policySavedToast,
} from "@/app/(app)/payroll/advances/advance-moments-copy";

/**
 * What is said about drawing pay early.
 *
 * Tested because the sentence that matters most is the one the API is most
 * careful about: approved is not paid. The employee is never promised a
 * deduction before the money has been paid, and the approver is told the money
 * has not been sent.
 */

describe("a request that was just sent", () => {
  const copy = advanceRequestedCopy({ amountKobo: 2_000_000, feeKobo: 0 });

  it("says what happened, about the request", () => {
    expect(copy.title).toBe("Your pay-early request is sent for a decision");
    expect(copy.lead).toBe("₦20,000.00 asked for.");
  });

  it("says it has to be approved and then paid, and that the deduction waits for the payment", () => {
    expect(copy.details).toEqual([
      "Somebody has to approve it, and then it has to be paid.",
      "Once it is paid, ₦20,000.00 comes off your next payslip.",
    ]);
  });

  it("names a fee, and counts it in what comes off the payslip", () => {
    const fee = advanceRequestedCopy({
      amountKobo: 2_000_000,
      feeKobo: 50_000,
    });
    expect(fee.lead).toBe("₦20,000.00 asked for, plus a ₦500.00 fee.");
    expect(fee.details[1]).toBe(
      "Once it is paid, ₦20,500.00 comes off your next payslip, fee included.",
    );
    expect(copy.lead).not.toMatch(/fee/);
  });

  it("never says anybody has been told", () => {
    const all = [copy.title, copy.lead, ...copy.details].join(" ");
    expect(all).not.toMatch(/told|notified|informed|alerted/i);
    expect(all).not.toMatch(/!/);
  });
});

describe("a request an approver just approved", () => {
  const copy = advanceApprovedCopy({
    employeeName: "Chidi Nwosu",
    amountKobo: 2_000_000,
    feeKobo: 0,
  });

  it("names whose, and says approved", () => {
    expect(copy.title).toBe("Chidi Nwosu's pay-early request is approved");
    expect(copy.lead).toBe("₦20,000.00.");
  });

  it("says the money has not been sent, and where to say it has", () => {
    expect(copy.details[0]).toBe(
      "The money has not been sent yet. Press “The money has gone” under Advances once it has.",
    );
  });

  it("says the payslip deduction waits for the payment", () => {
    expect(copy.details[1]).toBe(
      "₦20,000.00 comes off their payslip once it is paid.",
    );
  });

  it("includes the fee in the figure that comes off", () => {
    const fee = advanceApprovedCopy({
      employeeName: "Chidi Nwosu",
      amountKobo: 2_000_000,
      feeKobo: 50_000,
    });
    expect(fee.lead).toBe("₦20,000.00, with a ₦500.00 fee.");
    expect(fee.details[1]).toBe(
      "₦20,500.00 comes off their payslip once it is paid.",
    );
  });
});

describe("a request that was declined", () => {
  it("names whose, and uses the dialog's own wording about the reason", () => {
    expect(advanceDeclinedToast({ employeeName: "Chidi Nwosu" })).toEqual({
      title: "Declined Chidi Nwosu's request",
      detail: "They see your reason.",
    });
  });
});

describe("saving how drawing early works", () => {
  it("says what the policy now is", () => {
    expect(
      policySavedToast({
        enabled: true,
        maxPercent: 50,
        minNaira: 1000,
        feeNaira: 0,
      }),
    ).toEqual({
      title: "Pay-early settings saved",
      detail:
        "Staff can draw up to 50% of what they have earned, from ₦1,000.00.",
    });
  });

  it("never saves a fee silently", () => {
    expect(
      policySavedToast({
        enabled: true,
        maxPercent: 12.5,
        minNaira: 5000,
        feeNaira: 250,
      }).detail,
    ).toBe(
      "Staff can draw up to 12.5% of what they have earned, from ₦5,000.00. The fee is ₦250.00 an advance.",
    );
  });

  it("says so when it is switched off, and does not recite limits nobody can use", () => {
    expect(
      policySavedToast({
        enabled: false,
        maxPercent: 50,
        minNaira: 1000,
        feeNaira: 100,
      }),
    ).toEqual({
      title: "Pay-early settings saved",
      detail: "Staff cannot draw pay early.",
    });
  });
});
