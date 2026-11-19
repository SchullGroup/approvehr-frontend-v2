import { describe, expect, it } from "vitest";
import type { BankRegister } from "@/lib/api/payroll";
import {
  BANK_PAYMENT_COLUMNS,
  bankPaymentFilename,
  bankPaymentSheets,
  salaryNarration,
  unpayableCount,
} from "@/lib/payroll/bank-payment-schedule";
import { readXlsx, writeXlsx } from "@/lib/xlsx";

/**
 * The bank payment schedule, in Crafwell's bank template.
 *
 * The template is `bulk_payment_template.xlsx`: one sheet called `Sheet1`, six
 * columns — `ToAccount`, `ToAccountName`, `ToBankCode`, `ToBankName`, `Amount`,
 * `Narration` — with the amount a number shown as `#,##0.00` and everything else
 * text. The rows below are real rows from it (names and figures as they appear
 * there), so what is asserted is the file the bank is used to receiving.
 *
 * What these pin, because each is a way to hand the bank a file it rejects or,
 * worse, accepts and pays wrongly:
 *
 * 1. **The headings and their order are exact.** A bank importer maps by
 *    position or by name; a renamed or reordered column is a rejected upload.
 * 2. **Account numbers and bank codes stay text.** `0018069180` as a number is
 *    `18069180` and pays nobody; `090405` loses its zero.
 * 3. **The amount is the API's own digits, as a number.** Nothing is rounded or
 *    passed through a float on the way into the cell.
 * 4. **The old nine columns are gone.** No `Id`, no `Currency`, no `Reference No`.
 */

type RegisterEmployee = BankRegister["employees"][number];

const person = (over: Partial<RegisterEmployee>): RegisterEmployee => ({
  employeeNo: "AHR-0001",
  firstName: "Test",
  lastName: "Person",
  bankName: "UBA",
  bankCode: "033",
  bankAccountNumber: "2236752711",
  bankAccountName: "Test Person",
  gross: "0.00",
  basic: "0.00",
  housing: "0.00",
  transport: "0.00",
  paye: "0.00",
  pensionEmployee: "0.00",
  pensionEmployer: "0.00",
  nhf: "0.00",
  otherDeductions: "0.00",
  net: "100000.00",
  unpaidDays: 0,
  ...over,
});

const register = (
  employees: RegisterEmployee[],
  period = "2026-10",
): BankRegister => ({
  run: {
    id: "r-1",
    period,
    status: "APPROVED",
    label: null,
    organizationName: "Crafwell Engineering Limited",
    preparedAt: "2026-10-27T09:00:00.000Z",
    preparedByName: null,
    approvedAt: null,
    approvedByName: null,
    paidAt: null,
  },
  employees,
  rowCount: employees.length,
  generatedAt: "2026-11-19T09:00:00.000Z",
});

/** Rows from the template itself. */
const FROM_TEMPLATE = [
  person({
    bankAccountNumber: "0018069180",
    bankAccountName: "FRANCIS AKUMA",
    bankCode: "032",
    bankName: "UNION BANK",
    net: "376709.59",
  }),
  person({
    bankAccountNumber: "8766751016",
    bankAccountName: "MERCY DOCTOR",
    bankCode: "214",
    bankName: "FCMB",
    net: "238404.79",
  }),
  person({
    bankAccountNumber: "5268182601",
    bankAccountName: "Udukobongo Okon Frank",
    bankCode: "090405",
    bankName: "Monie Point Bank",
    net: "73452.05",
  }),
  person({
    bankAccountNumber: "8030622931",
    bankAccountName: "Osaruyi Araka",
    bankCode: "100004",
    bankName: "Opay",
    net: "200000.00",
  }),
];

const build = (employees: RegisterEmployee[]) => {
  const bytes = writeXlsx(bankPaymentSheets(register(employees)));
  return { bytes, xml: new TextDecoder().decode(bytes) };
};

describe("the layout", () => {
  it("has the template's six headings, in the template's order, and nothing else", async () => {
    expect([...BANK_PAYMENT_COLUMNS]).toEqual([
      "ToAccount",
      "ToAccountName",
      "ToBankCode",
      "ToBankName",
      "Amount",
      "Narration",
    ]);
    const { bytes } = build(FROM_TEMPLATE);
    const file = await readXlsx(bytes);
    expect(file.sheets[0]?.grid[0]).toEqual([...BANK_PAYMENT_COLUMNS]);
  });

  it("is one sheet named Sheet1, as the template is", async () => {
    const { bytes } = build(FROM_TEMPLATE);
    const file = await readXlsx(bytes);
    expect(file.sheets).toHaveLength(1);
    expect(file.sheets[0]?.name).toBe("Sheet1");
  });

  it("no longer carries the old nine columns", async () => {
    const { bytes } = build(FROM_TEMPLATE);
    const header = (await readXlsx(bytes)).sheets[0]?.grid[0] ?? [];
    for (const gone of [
      "Id",
      "Destination Bank Code",
      "DestinationBank Name",
      "Account No",
      "Account Name",
      "Currency",
      "Reference No",
    ]) {
      expect(header).not.toContain(gone);
    }
  });
});

describe("the rows", () => {
  it("fills each column from the right field, with the month spelt out", async () => {
    const { bytes } = build(FROM_TEMPLATE);
    const grid = (await readXlsx(bytes)).sheets[0]?.grid ?? [];
    expect(grid[1]).toEqual([
      "0018069180",
      "FRANCIS AKUMA",
      "032",
      "UNION BANK",
      "376709.59",
      "October Salary",
    ]);
    expect(grid[3]?.[2]).toBe("090405");
    expect(grid).toHaveLength(1 + FROM_TEMPLATE.length);
  });

  it("keeps a leading zero on the account number and on the bank code", async () => {
    const { bytes, xml } = build(FROM_TEMPLATE);
    const grid = (await readXlsx(bytes)).sheets[0]?.grid ?? [];
    expect(grid[1]?.[0]).toBe("0018069180");
    expect(grid[3]?.[2]).toBe("090405");
    /* Written as text cells, not numbers that happen to read back as text. */
    expect(xml).toContain('<c r="A2" t="inlineStr"');
    expect(xml).toContain('<c r="C4" t="inlineStr"');
  });

  it("writes the amount as a real number shown as money, from the API's own digits", () => {
    const { xml } = build(FROM_TEMPLATE);
    /* `s="3"` is `#,##0.00`. The digits are the API's, not a float's. */
    expect(xml).toContain('<c r="E2" s="3"><v>376709.59</v></c>');
    expect(xml).toContain('<c r="E5" s="3"><v>200000.00</v></c>');
    /* And the header is never a number. */
    expect(xml).toContain('<c r="E1" t="inlineStr"');
  });

  it("leaves a missing bank code blank rather than guessing one", async () => {
    const { bytes } = build([person({ bankCode: undefined })]);
    const grid = (await readXlsx(bytes)).sheets[0]?.grid ?? [];
    expect(grid[1]?.[2] ?? "").toBe("");
  });

  it("lists only people with something to pay", async () => {
    const { bytes } = build([
      person({ bankAccountName: "Paid", net: "50000.00" }),
      person({ bankAccountName: "Nil", net: "0.00" }),
    ]);
    const grid = (await readXlsx(bytes)).sheets[0]?.grid ?? [];
    expect(grid).toHaveLength(2);
    expect(grid[1]?.[1]).toBe("Paid");
  });
});

describe("the small things around it", () => {
  it("spells the month out in the narration", () => {
    expect(salaryNarration("2026-10")).toBe("October Salary");
    expect(salaryNarration("2026-01")).toBe("January Salary");
    expect(salaryNarration("2026-12")).toBe("December Salary");
  });

  it("names the file by its period", () => {
    expect(bankPaymentFilename(register([], "2026-10"))).toBe(
      "bank-payment-schedule-2026-10.xlsx",
    );
  });

  it("counts people the bank cannot pay yet, but only among those with something to pay", () => {
    const count = unpayableCount(
      register([
        person({}),
        person({ bankCode: undefined }),
        person({ bankAccountNumber: "" }),
        /* No transfer to make, so not somebody the bank has to skip. */
        person({ bankAccountNumber: "", net: "0.00" }),
      ]),
    );
    expect(count).toBe(2);
  });
});
