import { redirect } from "next/navigation";

/**
 * Weekly tasks are not a page of Performance any more (owner, 24 Nov 2026):
 * work is tracked in Projects and linked to an objective. An old link lands on
 * Performance.
 */
export default function ReviewTasksPage() {
  redirect("/performance");
}
