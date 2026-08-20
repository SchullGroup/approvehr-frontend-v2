import type { Metadata } from "next";
import { ImportScreen } from "./import-screen";

export const metadata: Metadata = {
  title: "Import your staff list",
  description:
    "Bring your people in from a spreadsheet: match your own column names, see every problem row before anything is saved, and confirm exactly how many will be added and updated.",
};

export default function ImportPage() {
  return <ImportScreen />;
}
