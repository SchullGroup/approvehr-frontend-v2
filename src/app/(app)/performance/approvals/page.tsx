import { redirect } from "next/navigation";

/**
 * Objectives to agree is a tab of Objectives now (owner, 24 Nov 2026), not a
 * page of its own. An old link, a bookmark or the company report lands on it.
 */
export default function PerformanceApprovalsPage() {
  redirect("/performance/kpis?tab=agree");
}
