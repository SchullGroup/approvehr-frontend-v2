import type { BankRegister } from "@/lib/api/payroll";
import type { SheetSpec } from "@/lib/xlsx";

/**
 * The bank payment schedule: the spreadsheet a company takes to its bank to pay a
 * run.
 *
 * ## The layout is Crafwell's bank template, and the order is a contract
 *
 * Six columns, in this order, under these exact headings:
 *
 * | # | Heading         | What goes in it                                       |
 * |---|-----------------|-------------------------------------------------------|
 * | 1 | `ToAccount`     | Account number, as **text** so a leading zero survives |
 * | 2 | `ToAccountName` | The name on the account                               |
 * | 3 | `ToBankCode`    | The bank's code, as **text** (`044`, `090405`)         |
 * | 4 | `ToBankName`    | The bank, as recorded on the employee                 |
 * | 5 | `Amount`        | Naira, a real number shown as `#,##0.00`              |
 * | 6 | `Narration`     | `October Salary` — the month, spelt out               |
 *
 * It replaces the nine-column layout (`Id`, `Destination Bank Code`, …, `Currency`,
 * `Reference No`) that stood here before. There is no serial number, no currency
 * and no reference column any more: the bank's template does not have them, and a
 * template with extra columns is one a bank importer may refuse.
 *
 * ## Why account numbers and codes are text
 *
 * A NUBAN is ten digits and plenty start with a zero; as a number the zero is
 * gone before the bank sees it, and a long one turns into `9.4776E+09`. Bank
 * codes are the same (`090405`). Only the amount is a number, because that is the
 * one a bank adds up.
 *
 * ## The figure is whatever the API sent
 *
 * `net` arrives as a decimal string (`"376709.59"`) and goes into the cell as
 * those exact digits. Nothing here converts it through a float or rounds it.
 *
 * ## Who is on it
 *
 * Only people with something to pay. Somebody whose net is nil has no transfer to
 * make, so they are not a row the bank has to skip.
 */
export const BANK_PAYMENT_COLUMNS = [
  "ToAccount",
  "ToAccountName",
  "ToBankCode",
  "ToBankName",
  "Amount",
  "Narration",
] as const;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** `2026-10` → `October Salary`. */
export function salaryNarration(period: string): string {
  const month = MONTHS[Number(period.slice(5, 7)) - 1] ?? "";
  return `${month} Salary`.trim();
}

/** `bank-payment-schedule-2026-10.xlsx`. */
export function bankPaymentFilename(register: BankRegister): string {
  return `bank-payment-schedule-${register.run.period}.xlsx`;
}

/** Who the bank can be asked to pay: net pay above nothing. */
export function payableEmployees(register: BankRegister) {
  return register.employees.filter((e) => Number(e.net) > 0);
}

/** People on the schedule the bank cannot pay yet: no account, or no bank code. */
export function unpayableCount(register: BankRegister): number {
  return payableEmployees(register).filter(
    (e) => !e.bankAccountNumber || !e.bankCode,
  ).length;
}

/**
 * The one sheet. Named `Sheet1`, like the template, and with no bold heading and
 * no frozen row, so it opens looking like the file the bank gave.
 */
export function bankPaymentSheets(register: BankRegister): SheetSpec[] {
  const narration = salaryNarration(register.run.period);
  const rows = payableEmployees(register).map((e) => [
    e.bankAccountNumber,
    e.bankAccountName,
    e.bankCode ?? "",
    e.bankName,
    e.net,
    narration,
  ]);

  return [
    {
      name: "Sheet1",
      rows: [[...BANK_PAYMENT_COLUMNS], ...rows],
      moneyColumns: [4],
      /* The template's own widths for the first five columns, and room for
         "October Salary" in the last, which the template leaves to overflow. */
      widths: [16.5, 23.5, 12.6, 11.4, 16.2, 16],
    },
  ];
}
