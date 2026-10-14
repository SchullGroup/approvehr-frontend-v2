import type { Metadata } from "next";
import { AppraisersScreen } from "./appraisers-screen";

export const metadata: Metadata = {
  title: "Who appraises whom",
  description:
    "Who appraises whom in this period, and how much each appraiser's view counts.",
};

export default function PerformanceAppraisersPage() {
  return <AppraisersScreen />;
}
