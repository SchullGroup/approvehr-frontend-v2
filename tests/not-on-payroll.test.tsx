import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  missingForPayroll,
  payrollFieldsForDisplay,
  payrollGapsFor,
  type Employee,
} from "@/lib/types";

/**
 * "Not paid through payroll": the company's own administrator, a director who draws nothing, a
 * consultant paid elsewhere. A permanent flag, set by hand on the record.
 *
 * The same sentence is true in four places and each had its own way of being wrong: the record's
 * "details missing" banner, the directory's incomplete counts, the dashboard headcount and the
 * payroll run. The API owns the run and the counts; this file is the web half: nothing is "missing"
 * for them, and the card that sets it says what it does and only offers it to somebody who may.
 */

const state = vi.hoisted(() => ({ can: true }));
const push = vi.hoisted(() => vi.fn());

vi.mock("@/lib/permissions", () => ({
  useCan: () => state.can,
  usePermissions: () => ({ can: () => state.can, loading: false }),
}));
vi.mock("@/components/ui", async (original) => ({
  ...(await original<typeof import("@/components/ui")>()),
  useToast: () => ({ push }),
}));

const { PayrollStatusCard } =
  await import("@/components/people/payroll-status-card");

const person = (over: Partial<Employee> = {}) =>
  ({
    id: "e-1",
    firstName: "Crafwell",
    lastName: "Admin",
    bankAccount: null,
    pensionPin: null,
    tin: null,
    ...over,
  }) as Employee;

beforeEach(() => {
  state.can = true;
  push.mockClear();
});

describe("what is missing for payroll", () => {
  it("is everything, for somebody paid through payroll with nothing on file", () => {
    expect(missingForPayroll(person())).toEqual([
      "Bank account",
      "Pension PIN",
      "Tax identification number",
    ]);
    expect(payrollGapsFor(person()).map((g) => g.field)).toEqual([
      "bankAccount",
      "pensionPin",
      "tin",
    ]);
  });

  it("is nothing, for somebody who is not paid through payroll", () => {
    const admin = person({ notOnPayroll: true });
    expect(missingForPayroll(admin)).toEqual([]);
    expect(payrollGapsFor(admin)).toEqual([]);
  });

  it("is nothing for them on a directory row too, where the three fields are redacted", () => {
    const row = person({
      notOnPayroll: true,
      hasBankAccount: false,
      hasPensionPin: false,
      hasTin: false,
    });
    expect(payrollGapsFor(payrollFieldsForDisplay(row))).toEqual([]);
    /* And a person paid through payroll on the same kind of row is still named. */
    const paid = person({
      hasBankAccount: false,
      hasPensionPin: true,
      hasTin: true,
    });
    expect(
      payrollGapsFor(payrollFieldsForDisplay(paid)).map((g) => g.field),
    ).toEqual(["bankAccount"]);
  });
});

describe("the card", () => {
  it("offers to leave somebody off payroll, and says what that does once they choose it", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<PayrollStatusCard employee={person()} onSave={onSave} />);

    expect(
      screen.getByText(/Paid through payroll\. Payroll needs/),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Not paid through payroll" }),
    );
    expect(screen.getByText(/stop counting as staff/)).toBeVisible();

    await userEvent.type(
      screen.getByRole("textbox"),
      "  Company administrator ",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Leave off payroll" }),
    );

    expect(onSave).toHaveBeenCalledWith({
      notOnPayroll: true,
      notOnPayrollReason: "Company administrator",
    });
    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Not paid through payroll" }),
    );
  });

  it("works without a reason, which is optional", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<PayrollStatusCard employee={person()} onSave={onSave} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Not paid through payroll" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Leave off payroll" }),
    );
    expect(onSave).toHaveBeenCalledWith({
      notOnPayroll: true,
      notOnPayrollReason: "",
    });
  });

  it("shows the state and the reason, and can put them back on payroll", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <PayrollStatusCard
        employee={person({
          notOnPayroll: true,
          notOnPayrollReason: "Company administrator",
        })}
        onSave={onSave}
      />,
    );

    expect(screen.getByText("Not paid through payroll")).toBeVisible();
    expect(screen.getByText("Company administrator")).toBeVisible();
    expect(screen.getByText(/leaves them out of every run/i)).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Pay through payroll again" }),
    );
    expect(onSave).toHaveBeenCalledWith({
      notOnPayroll: false,
      notOnPayrollReason: "",
    });
  });

  it("is not there at all for somebody who cannot edit records and is paid through payroll", () => {
    state.can = false;
    const { container } = render(
      <PayrollStatusCard employee={person()} onSave={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("tells somebody who cannot edit records why nothing is asked of this person, with no buttons", () => {
    state.can = false;
    render(
      <PayrollStatusCard
        employee={person({ notOnPayroll: true })}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText("Not paid through payroll")).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says so when the save is refused, and does not claim it worked", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("nope"));
    render(<PayrollStatusCard employee={person()} onSave={onSave} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Not paid through payroll" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Leave off payroll" }),
    );
    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "danger", title: "That was not saved" }),
    );
    expect(push).not.toHaveBeenCalledWith(
      expect.objectContaining({ tone: "success" }),
    );
  });
});
