import { redirect } from "next/navigation";

/**
 * "Appraisals" is no longer a page of its own (owner, 27 Nov 2026). It was an
 * older copy of what the Overview already shows: where your own appraisal stands
 * and where your team's do, with a step count that did not match the form's. An
 * old link lands on Performance.
 *
 * No `metadata`, so the page index no longer lists it for search.
 */
export default function AppraisalsPage() {
  redirect("/performance");
}
