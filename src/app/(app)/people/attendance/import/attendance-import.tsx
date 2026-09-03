"use client";

import { ImportFlow } from "@/components/imports/import-flow";
import { ATTENDANCE_IMPORT_SURFACE } from "./surface";

/**
 * The client boundary, and it has to be here rather than on the page.
 *
 * An `ImportSurface` carries functions — the dictionary's row rules, its notes,
 * how a row names itself — and functions cannot cross a server-to-client prop
 * boundary. So the surface is chosen *inside* the client bundle, exactly as
 * `people/import/employee-import.tsx` does it.
 */
export function AttendanceImport() {
  return <ImportFlow surface={ATTENDANCE_IMPORT_SURFACE} />;
}
