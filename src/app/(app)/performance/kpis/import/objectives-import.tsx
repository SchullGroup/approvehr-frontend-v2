"use client";

import { ImportFlow } from "@/components/imports/import-flow";
import { OBJECTIVES_IMPORT_SURFACE } from "./surface";

/**
 * The client boundary, and it has to be here rather than on the page.
 *
 * An `ImportSurface` carries functions — the dictionary's row rules, and here the
 * access hook — and functions cannot cross a server-to-client prop boundary. So
 * the surface is chosen *inside* the client bundle, exactly as
 * `people/import/employee-import.tsx` does it.
 */
export function ObjectivesImport() {
  return <ImportFlow surface={OBJECTIVES_IMPORT_SURFACE} />;
}
