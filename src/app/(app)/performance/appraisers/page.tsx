import type { Metadata } from "next";
import { AppraisersScreen } from "./appraisers-screen";

export const metadata: Metadata = {
  title: "Who appraises whom",
  description: "The appraiser mapping for this cycle, and each one's weight.",
};

export default function PerformanceAppraisersPage() {
  return <AppraisersScreen />;
}
