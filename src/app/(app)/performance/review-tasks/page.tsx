import type { Metadata } from "next";
import { ReviewTasksScreen } from "./review-tasks-screen";

export const metadata: Metadata = {
  title: "Review tasks",
  description: "What people logged against their objectives, waiting for a grade.",
};

export default function PerformanceReviewTasksPage() {
  return <ReviewTasksScreen />;
}
