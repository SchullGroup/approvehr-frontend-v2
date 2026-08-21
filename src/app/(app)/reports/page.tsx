import type { Metadata } from "next";
import { ReportsScreen } from "./reports-screen";

export const metadata: Metadata = {
  title: "Reports",
  description: "Headcount, payroll cost and operational load.",
};

export default function ReportsPage() {
  return <ReportsScreen />;
}
