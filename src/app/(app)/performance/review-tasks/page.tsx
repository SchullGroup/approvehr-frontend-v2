import type { Metadata } from "next";
import { ReviewTasksScreen } from "./review-tasks-screen";

export const metadata: Metadata = {
  title: "Weekly tasks",
  description:
    "Log what you did toward your objectives, and grade what your team did.",
};

export default function PerformanceReviewTasksPage() {
  return <ReviewTasksScreen />;
}
