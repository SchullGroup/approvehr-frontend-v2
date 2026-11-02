"use client";

import Link from "next/link";
import { NOTICE_LINK, NoticeLine } from "@/components/portal/notice-line";
import { useMyRequiredDetails } from "@/lib/store/my-record";

/**
 * "Complete your details", for somebody with a detail HR requires still blank.
 *
 * One line at the top of the dashboard, gone once everything required is
 * filled in (or sent for HR's approval). It blocks nothing: the reminder is
 * the nudge, and My profile is where the detail is filled in.
 */
export function CompleteDetailsPrompt() {
  const { missing } = useMyRequiredDetails();
  if (missing.length === 0) return null;

  /* Labels as the API writes them: "LGA of origin" does not survive lower-casing. */
  const names = missing.map((m) => m.label);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

  return (
    <NoticeLine tone="accent" className="mb-4">
      Complete your details: {list} {missing.length === 1 ? "is" : "are"} still
      blank, and your company needs {missing.length === 1 ? "it" : "them"}.
      <Link href="/profile?tab=details" className={NOTICE_LINK}>
        Fill them in
      </Link>
    </NoticeLine>
  );
}
