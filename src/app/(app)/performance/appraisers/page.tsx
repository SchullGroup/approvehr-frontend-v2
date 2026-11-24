import type { Metadata } from "next";
import { AppraisersScreen } from "./appraisers-screen";

export const metadata: Metadata = {
  title: "Who appraises whom",
  description:
    "Who appraises whom: everybody's line manager by default, and the exceptions period by period.",
};

export default function PerformanceAppraisersPage() {
  return <AppraisersScreen />;
}
