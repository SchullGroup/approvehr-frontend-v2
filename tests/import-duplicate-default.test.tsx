/**
 * U12 (NC-9): a row matched on an existing person's work email used to be set
 * to "Update them" whatever its name said, so one click could rename Ibrahim
 * Musa to Amaka Okeke, change his job and cut his pay. A match whose name
 * differs now starts unticked, and the card says the names differ.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  defaultDuplicateAction,
  namesAgree,
} from "@/lib/imports/duplicate-default";
import type { CheckOutcome, RowLine } from "@/lib/store/imports";
import { EMPLOYEES } from "@/lib/imports/employees";

vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ create: vi.fn() }),
}));

import { CheckReport } from "@/components/imports/check-report";

describe("namesAgree", () => {
  it("is true for the same name in any case, accent or order", () => {
    expect(namesAgree("Ibrahim Musa", "ibrahim musa")).toBe(true);
    expect(namesAgree("Musa, Ibrahim", "Ibrahim Musa")).toBe(true);
    expect(namesAgree("Chiamaka Okéke", "Chiamaka Okeke")).toBe(true);
  });

  it("is true when one name only adds a middle name", () => {
    expect(namesAgree("Ada Eze", "Ada Nkem Eze")).toBe(true);
    expect(namesAgree("Ada Nkem Eze", "Ada Eze")).toBe(true);
  });

  it("is false for a different person, or when a name is missing", () => {
    expect(namesAgree("Amaka Okeke", "Ibrahim Musa")).toBe(false);
    expect(namesAgree("Ibrahim Okeke", "Ibrahim Musa")).toBe(false);
    expect(namesAgree(null, "Ibrahim Musa")).toBe(false);
    expect(namesAgree("  ", "Ibrahim Musa")).toBe(false);
  });
});

describe("defaultDuplicateAction", () => {
  it("updates a match whose name agrees and leaves a different name alone", () => {
    expect(defaultDuplicateAction("Ibrahim Musa", "Ibrahim Musa")).toBe(
      "update",
    );
    expect(defaultDuplicateAction("Amaka Okeke", "Ibrahim Musa")).toBe("skip");
  });
});

const line = (
  row: number,
  name: string,
  matchName: string,
  decision: "skip" | "update" | null = null,
): RowLine => ({
  row,
  employeeNo: null,
  name,
  action: "skip",
  problems: [],
  duplicate: {
    on: "email",
    value: `person${row}@schull.io`,
    employeeNo: `AHR-00${row}`,
    name: matchName,
    archived: false,
    decision,
  },
  missing: [],
  employeeNoGenerated: false,
});

const check = (problems: RowLine[]): CheckOutcome => ({
  filename: "staff.csv",
  totalRows: problems.length,
  rowsChecked: problems.length,
  toCreate: 0,
  toUpdate: 0,
  toSkip: problems.length,
  problems,
  notes: [],
  missing: {},
  parts: [],
  duplicates: { undecided: problems.length, skipping: 0, updating: 0 },
  flagged: 0,
  missingOrgTaxState: false,
  fixCount: 0,
  authoritative: true,
});

function renderReport(
  problems: RowLine[],
  decisions: Record<number, "skip" | "update"> = {},
) {
  const onSeedDecisions = vi.fn();
  render(
    <CheckReport
      dictionary={EMPLOYEES}
      prerequisites={{}}
      check={check(problems)}
      refusalWithoutApi="Needs the API"
      onBack={vi.fn()}
      onDownload={vi.fn()}
      fixes={{}}
      fixCount={0}
      onFix={vi.fn()}
      onRecheck={vi.fn()}
      rechecking={false}
      unchecked={false}
      decisions={decisions}
      onDecide={vi.fn()}
      onDecideAll={vi.fn()}
      onSeedDecisions={onSeedDecisions}
      onConfirm={vi.fn()}
      confirming={false}
    />,
  );
  return { onSeedDecisions };
}

describe("the duplicates card", () => {
  it("seeds a matching name as an update and a different name as left alone", () => {
    const { onSeedDecisions } = renderReport([
      line(2, "Ibrahim Musa", "Ibrahim Musa"),
      line(3, "Amaka Okeke", "Ibrahim Musa"),
    ]);
    expect(onSeedDecisions).toHaveBeenCalledWith({ 2: "update", 3: "skip" });
  });

  it("says the names differ beside the person it would overwrite", () => {
    renderReport([line(3, "Amaka Okeke", "Ibrahim Musa")], { 3: "skip" });
    expect(screen.getByText("Different name")).toBeInTheDocument();
    const box = screen.getByRole("checkbox", { name: "Update them" });
    expect(box).not.toBeChecked();
  });

  it("does not mark a name that agrees", () => {
    renderReport([line(2, "Ibrahim Musa", "Ibrahim Musa")], { 2: "update" });
    expect(screen.queryByText("Different name")).not.toBeInTheDocument();
  });

  it("names the rename when a different name is ticked", () => {
    renderReport([line(3, "Amaka Okeke", "Ibrahim Musa")], { 3: "update" });
    expect(
      screen.getByText(/Ibrahim Musa's record is renamed Amaka Okeke/),
    ).toBeInTheDocument();
  });
});
