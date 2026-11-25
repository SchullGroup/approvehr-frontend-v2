/**
 * U13 (PAY-25), web part: a payroll analyst could hand-set her own PAYE,
 * pension and bonus, and hand-set PAYE needed no reason. Her own payslip is
 * read-only in the Adjust panel, saying somebody else adjusts it, and the PAYE
 * form asks why before it saves.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AmountForm } from "@/app/(app)/payroll/runs/new/adjust-forms";

describe("the PAYE form", () => {
  it("will not save without a reason, and sends the reason", () => {
    const onSave = vi.fn();
    render(
      <AmountForm
        label="PAYE"
        intro="x"
        now="y"
        valueKobo={1_000_000}
        saveLabel="Enter it by hand"
        saving={false}
        error={null}
        reasonLabel="Why it is entered by hand"
        onSave={onSave}
        onBack={vi.fn()}
      />,
    );
    const save = screen.getByRole("button", { name: "Enter it by hand" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Why it is entered by hand/), {
      target: { value: "FIRS assessment letter" },
    });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith(1_000_000, "FIRS assessment letter");
  });
});

describe("the Adjust panel", () => {
  const drawer = readFileSync(
    path.resolve(
      import.meta.dirname,
      "../src/app/(app)/payroll/runs/new/adjust-drawer.tsx",
    ),
    "utf8",
  );
  it("does not let you adjust your own payslip", () => {
    expect(drawer).toMatch(/const own = .*employeeId === me/);
    expect(drawer).toContain("const editable = mayEdit && !own;");
  });
  it("asks for no reason and no explanation when PAYE is entered by hand", () => {
    /* Taken off on request (25 Nov 2026): the field and the paragraph above it. */
    expect(drawer).not.toContain("Why it is entered by hand");
    expect(drawer).not.toContain(
      "This replaces the tax worked out from the bands",
    );
    expect(drawer).toMatch(
      /setTaxOverride\(runId, \{\s*employeeId,\s*payeKobo,\s*\}/,
    );
  });
});
