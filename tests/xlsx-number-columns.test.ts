import { describe, expect, it } from "vitest";
import { readXlsx, writeXlsx } from "@/lib/xlsx";

/**
 * A bank's upload reads the Amount column as money, and an account number has
 * to keep its leading zero — so the writer can mark columns as real numbers
 * while everything else stays text.
 */
describe("number columns", () => {
  it("writes the marked column as a number and leaves the rest as text", async () => {
    const bytes = writeXlsx([
      {
        name: "Payment Schedule",
        rows: [
          ["Account No", "Amount"],
          ["0018069180", "435100.50"],
        ],
        numberColumns: [1],
      },
    ]);
    const file = await readXlsx(bytes);
    const rows = file.sheets[0]?.grid ?? [];
    expect(rows[1]?.[0]).toBe("0018069180");
    expect(rows[1]?.[1]).toBe("435100.50");
    /* The cell itself, not what the reader makes of it: a number is a bare
       `<v>`, text is an inline string. The archive is stored, so it is
       readable as it stands. */
    const xml = new TextDecoder().decode(bytes);
    expect(xml).toContain('<c r="B2"><v>435100.50</v></c>');
    expect(xml).toContain('<c r="A2" t="inlineStr"');
    /* The header is never a number, whatever column it sits in. */
    expect(rows[0]?.[1]).toBe("Amount");
  });

  it("writes a cell that is not a plain number as text rather than refusing it", async () => {
    const bytes = writeXlsx([
      {
        name: "S",
        rows: [["A"], ["n/a"]],
        numberColumns: [0],
      },
    ]);
    const file = await readXlsx(bytes);
    expect(file.sheets[0]?.grid[1]?.[0]).toBe("n/a");
  });
});
