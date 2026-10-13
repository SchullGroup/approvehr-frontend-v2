import { fileFromRecords, parseCsv, type CsvFile } from "@/lib/csv";
import { isXlsxName, readXlsx } from "@/lib/xlsx";

/**
 * A chosen file, read into rows. The one place a CSV or an Excel file becomes a
 * `CsvFile`.
 *
 * It lived inside the import store's `chooseFile`, and the window that adds
 * several records by hand needs the identical reading — same size limit, same
 * refusal for the older Excel formats, same "first sheet with rows in it", same
 * sentences. A second copy would drift until one of the two screens refused a
 * file the other accepted, so the logic moved here and both call it.
 *
 * It returns the refusal as a sentence instead of throwing, because every
 * refusal here is something a person can act on and the caller's job is to show
 * it, not to translate it.
 */

/** Past this the browser is parsing megabytes to be told the file is wrong. */
export const MAX_FILE_BYTES = 25_000_000;

export type ReadResult =
  { ok: true; csv: CsvFile } | { ok: false; message: string };

const refuse = (message: string): ReadResult => ({ ok: false, message });

export async function readImportFile(chosen: File): Promise<ReadResult> {
  if (chosen.size > MAX_FILE_BYTES) {
    return refuse(
      "That file is bigger than 25MB. Split it in two and import each half: each one reports its own numbers.",
    );
  }

  /* The older binary formats, and the two that are not spreadsheets we can
     open. `.xls` is a completely different container from `.xlsx` and `.numbers`
     is a package; both convert in one menu item, and the message says which. */
  if (/\.(xls|xlsm|xlsb|numbers|ods)$/i.test(chosen.name)) {
    return refuse(
      "We can read .xlsx and .csv. In Excel or Numbers: File, then Save As or Export, and choose Excel Workbook (.xlsx) or CSV, then upload that.",
    );
  }

  let csv: CsvFile;
  if (isXlsxName(chosen.name)) {
    /* An Excel file, which is what our own template hands them. Reading it is
       not a nicety: offering a .xlsx template and then refusing .xlsx uploads
       would be a trap of our own making. */
    try {
      const workbook = await readXlsx(await chosen.arrayBuffer());
      /* The first sheet with more than a heading row in it. A workbook whose
         first tab is a cover note is common, and so is our own template's
         second tab — picking sheet one blindly imports the guide. */
      const useful =
        workbook.sheets.find((sheet) => sheet.grid.length > 1) ??
        workbook.sheets[0];
      if (!useful) return refuse("There are no sheets in that workbook.");
      const notes = [...workbook.notes];
      if (workbook.sheets.length > 1) {
        notes.push(
          `That workbook has ${workbook.sheets.length} sheets. We read "${useful.name}", the first one with rows in it.`,
        );
      }
      csv = fileFromRecords(useful.grid, { notes });
    } catch {
      return refuse(
        "That .xlsx could not be opened. If it came from another system, open it in Excel and save it again, or save it as CSV and upload that.",
      );
    }
  } else {
    let text: string;
    try {
      text = await chosen.text();
    } catch {
      return refuse("That file could not be read. Try saving it again as CSV.");
    }
    csv = parseCsv(text);
  }

  if (csv.headers.length === 0) {
    return refuse("That file is empty: there is no heading row in it.");
  }
  if (csv.rows.length === 0) {
    return refuse(
      "That file has headings but nobody in it. Check you saved the sheet the data is on.",
    );
  }

  return { ok: true, csv };
}
