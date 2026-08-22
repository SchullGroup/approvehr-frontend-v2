import type { Metadata } from "next";
import { StatutoryScreen } from "./statutory-screen";

export const metadata: Metadata = {
  title: "Statutory filings",
  description: "What August owes, to whom, and by when.",
};

export default function StatutoryPage() {
  return <StatutoryScreen />;
}
