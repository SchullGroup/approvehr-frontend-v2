/**
 * L4 (PAY-29): "Pay somebody outside this payroll" was offered on a month that
 * was still a draft, where ticking it changed nothing on screen and quietly
 * changed what calculating again would do. It is offered only on an approved
 * month, and a tick left over from one never applies to a draft.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { offCycleApplies } from "@/app/(app)/payroll/runs/new/off-cycle";

describe("paying somebody outside this payroll", () => {
  it("applies only to a month that is approved or paid", () => {
    expect(offCycleApplies(true, "APPROVED")).toBe(true);
    expect(offCycleApplies(true, "PAID")).toBe(true);
    expect(offCycleApplies(true, "IN_REVIEW")).toBe(false);
    expect(offCycleApplies(true, "DRAFT")).toBe(false);
    expect(offCycleApplies(true, null)).toBe(false);
    expect(offCycleApplies(false, "APPROVED")).toBe(false);
  });

  it("is offered only on an approved month", () => {
    const wizard = readFileSync(
      "src/app/(app)/payroll/runs/new/wizard.tsx",
      "utf8",
    );
    expect(wizard).toContain("offCycleApplies(");
    const box = wizard.indexOf('label="Pay somebody outside this payroll"');
    const before = wizard.slice(Math.max(0, box - 900), box);
    expect(before).toMatch(/existingApproved && \(/);
  });
});
