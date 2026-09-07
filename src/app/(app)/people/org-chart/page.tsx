import type { Metadata } from "next";
import { OrgChartScreen } from "./chart";

export const metadata: Metadata = {
  title: "Org chart",
  description: "Who reports to whom, read from the reporting line on every record.",
};

export default function Page() {
  return <OrgChartScreen />;
}
