import type { Metadata } from "next";
import { EmployeeImport } from "./employee-import";

export const metadata: Metadata = {
  title: "Import your staff list",
  description:
    "Bring your people in from a spreadsheet: match your own column names, see every problem row before anything is saved, and confirm exactly how many will be added and updated.",
};

/**
 * The employee importer.
 *
 * A page, a surface and nothing else. The four steps live in
 * `components/imports/` and are entity-agnostic; everything employee-specific is
 * in `./surface.ts` and in `lib/imports/employees.ts`. That is the whole shape of
 * a new importable entity.
 */
export default function ImportPage() {
  return <EmployeeImport />;
}
