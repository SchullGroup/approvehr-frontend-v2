import type { Metadata } from "next";
import { ReportBuilderScreen } from "./builder-screen";

export const metadata: Metadata = {
  title: "Build a report",
  description:
    "Choose a dataset, the columns you want, a filter and a grouping — with every total saying how many rows it covers and how many it does not.",
};

export default function ReportBuilderPage() {
  return <ReportBuilderScreen />;
}
