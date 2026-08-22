"use client";

import { ImportFlow } from "@/components/imports/import-flow";
import { EQUIPMENT_IMPORT_SURFACE } from "./surface";

/**
 * The client boundary, and it has to be here rather than on the page.
 *
 * An `ImportSurface` carries functions — the dictionary's row rules, its notes,
 * how a row names itself — and functions cannot cross a server-to-client prop
 * boundary. So the surface is chosen *inside* the client bundle.
 *
 * `page.tsx` stays a server component so it can export `metadata`.
 */
export function EquipmentImport() {
  return <ImportFlow surface={EQUIPMENT_IMPORT_SURFACE} />;
}
