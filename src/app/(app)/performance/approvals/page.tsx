import type { Metadata } from "next";
import { ApprovalsScreen } from "./approvals-screen";

export const metadata: Metadata = {
  title: "Objectives to agree",
  description:
    "Objectives waiting for you to agree them, with the target each person will be judged against.",
};

/**
 * The objective approval queue.
 *
 * Its own route rather than a tab, because it is a **queue**: a place somebody
 * arrives at from a notification with one job, does the job, and leaves. A tab
 * inside `/performance` would put it behind a screen about something else, and a
 * link in a notification would land on KPIs.
 *
 * One route for every reader, narrowed by the API rather than the URL. A manager
 * sees their reports'; `EDIT_RECORDS` sees the company's; nobody sees their own,
 * because nobody may agree their own. PARITY.md Rule 1.
 */
export default function PerformanceApprovalsPage() {
  return <ApprovalsScreen />;
}
