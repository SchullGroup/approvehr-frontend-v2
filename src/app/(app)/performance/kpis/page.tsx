import type { Metadata } from "next";
import { KpisScreen } from "./kpis-screen";

export const metadata: Metadata = {
  title: "KPIs",
  description:
    "What people are aiming at, and how far along it is — yours, your team's, or the company's.",
};

export default function PerformanceKpisPage() {
  return <KpisScreen />;
}
