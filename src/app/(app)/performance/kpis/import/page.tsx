import type { Metadata } from "next";
import { ObjectivesImport } from "./objectives-import";

export const metadata: Metadata = {
  title: "Upload objectives",
  description:
    "Give a team its quarter from one spreadsheet: match your own column names, see every row that will not go in and why before anything is saved, and have each objective arrive as a draft for its owner to agree.",
};

/**
 * The objectives upload.
 *
 * A page, a surface and nothing else — the steps live in `components/imports/`
 * and are entity-agnostic. That is the whole cost of a new importable entity on
 * this side.
 */
export default function ObjectivesImportPage() {
  return <ObjectivesImport />;
}
