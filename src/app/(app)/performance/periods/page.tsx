import type { Metadata } from "next";
import { PeriodsListScreen } from "./periods-list-screen";

export const metadata: Metadata = {
  title: "Appraisal periods",
  description: "Every appraisal period, open ones first, and what each one needs next.",
};

export default function PerformancePeriodsPage() {
  return <PeriodsListScreen />;
}
