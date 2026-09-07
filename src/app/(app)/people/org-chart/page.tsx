import type { Metadata } from "next";
import { OrgChartScreen } from "./chart";

export const metadata: Metadata = {
  title: "Org chart",
  description:
    "The company by department, with who leads each one and who reports to whom — and a way to rearrange it.",
};

export default function Page() {
  return <OrgChartScreen />;
}
