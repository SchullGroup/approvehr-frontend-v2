import {
  fetchBinary,
  fetchFile,
  type BinaryDownload,
  type FileDownload,
} from "./download";
import { employeeQuery, type EmployeeListParams } from "./endpoints";

/**
 * Downloading staff, pay and attendance as a spreadsheet.
 *
 * ## The permission was administered before it did anything
 *
 * `EXPORT_DATA` has been on the roles screen since permissions were built,
 * described as "Download staff, pay and attendance as a spreadsheet",
 * grantable, and wired to **no route on either side**. A company could take it
 * away from somebody and nothing changed; the one export that existed — the
 * directory's own client-side CSV — was not gated on it at all.
 *
 * ## Why these are server files and not built in the browser
 *
 * The directory already builds a CSV from the rows on screen, honestly labelled
 * "shown below", and that stays for demo mode where there is no server to ask.
 * Connected it is the wrong artefact for the job: it is one page of twenty-five
 * where the company has three hundred, and somebody exporting a staff register
 * wants the register.
 *
 * The server file is also the only one that can be **audited** — the fact a data
 * protection officer asks for afterwards — and the only one that can refuse to
 * hand over a payroll spreadsheet that does not reconcile with its run.
 */

/**
 * The staff register under the caller's own directory filter.
 *
 * Takes the directory's **own** `EmployeeListParams` and serialises them with
 * the directory's **own** `employeeQuery`, so the file covers exactly the set
 * the table is showing — the whole filtered set rather than the visible page.
 * Paging keys are dropped: an export of page 2 of 12 is not something anybody
 * means by "export".
 *
 * Pay columns are absent — not blank — for a caller without `VIEW_SALARIES`.
 * The API decides that, so nothing here has to.
 */
export function staffCsv(
  params: EmployeeListParams = {},
): Promise<FileDownload> {
  const { page, pageSize, ...filter } = params;
  void page;
  void pageSize;
  return fetchFile("/exports/staff.csv", "staff", employeeQuery(filter));
}

/**
 * Every payslip on one run.
 *
 * Needs `EXPORT_DATA` **and** `VIEW_SALARIES`, and is refused rather than served
 * with the money columns blank. It is refused again when its own net column does
 * not equal the run's stored total. Both refusals arrive as the server's own
 * sentence and belong on screen verbatim.
 */
export const payslipsCsv = (
  runId: string,
  period?: string,
): Promise<FileDownload> =>
  fetchFile(
    `/exports/payroll-runs/${runId}/payslips.csv`,
    period ? `payslips-${period}` : "payslips",
  );

/** The timesheet for the period on screen, one row per person. No money in it. */
export const attendanceCsv = (
  query: Record<string, string | number | boolean | undefined> = {},
): Promise<FileDownload> =>
  fetchFile("/exports/attendance.csv", "attendance", query);

/**
 * One payslip as a PDF.
 *
 * Gated on the API exactly as the JSON read is — your own, or `VIEW_SALARIES` —
 * and audited, because producing a file of somebody's pay is the act a question
 * gets asked about later.
 */
/**
 * The offer letter for one offer.
 *
 * **Only for an approved offer**, and that gate is the API's: it refuses one
 * with no `approvedAt` and says so, because the letter quotes a salary and an
 * unapproved one is a figure nobody has signed off. The caller renders the
 * button on the same condition rather than catching the refusal, so nobody
 * presses a control whose only outcome is a No — but the server check is what
 * makes it true, not the button.
 *
 * Gated as the JSON read is, `MANAGE_HIRING` or `APPROVE_HIRING`. Deliberately
 * not also `EXPORT_DATA`: that permission's own description names staff, pay
 * and attendance, and an offer letter is none of the three — it is one
 * document about one person, produced as part of hiring them.
 */
export const offerLetter = (
  offerId: string,
  stem?: string,
): Promise<BinaryDownload> =>
  fetchBinary(`/recruitment/offers/${offerId}/letter.pdf`, stem ?? "offer");

export const payslipPdf = (
  payslipId: string,
  stem?: string,
): Promise<BinaryDownload> =>
  fetchBinary(`/payroll/payslips/${payslipId}/pdf`, stem ?? "payslip");
