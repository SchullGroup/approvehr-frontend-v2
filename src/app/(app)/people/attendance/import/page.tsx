import type { Metadata } from "next";
import { AttendanceImport } from "./attendance-import";

export const metadata: Metadata = {
  title: "Import attendance",
  description:
    "Bring a month of clock-ins in from your biometric terminal's own export: match your own column names, see every problem row before anything is saved, and be told which days are corrections rather than additions.",
};

/**
 * The attendance importer.
 *
 * A page, a surface and nothing else — the four steps live in
 * `components/imports/` and are entity-agnostic. That is the whole cost of a
 * new importable entity on this side.
 */
export default function AttendanceImportPage() {
  return <AttendanceImport />;
}
