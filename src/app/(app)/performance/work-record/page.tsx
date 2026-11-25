import { redirect } from "next/navigation";

/**
 * "My work record" is no longer a page of its own (owner, 24 Nov 2026). What
 * somebody finished on the project boards is read inside their reviews and on
 * their history; an old link lands on Performance.
 */
export default function MyWorkRecordPage() {
  redirect("/performance");
}
