import type { Metadata } from "next";
import { EquipmentImport } from "./equipment-import";

export const metadata: Metadata = {
  title: "Import your equipment register",
  description:
    "Bring your laptops, phones and access cards in from a spreadsheet: match your own column names, say which kinds a leaver has to hand back, and see every problem row before anything is saved.",
};

/**
 * The equipment importer.
 *
 * A page, a surface and nothing else — the same three files the employee
 * importer is. The four steps live in `components/imports/` and are
 * entity-agnostic; everything equipment-specific is in `./surface.ts` and in
 * `lib/imports/equipment.ts`.
 */
export default function EquipmentImportPage() {
  return <EquipmentImport />;
}
