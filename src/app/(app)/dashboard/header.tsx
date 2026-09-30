"use client";

import { PageHeader } from "@/components/portal/shell";
import { formatDate, hourIn, weekdayIn } from "@/lib/time";
import { useOrgTimezone, useSession } from "@/lib/store/session";

/**
 * The dashboard's greeting, split out as a client component purely so it can
 * read the session — the page itself stays a server component.
 *
 * It said "Good morning, Amara" to everyone, at every hour, because the name
 * came from the hardcoded `CURRENT_USER` and the greeting was a literal. Both
 * are now real, which is the whole point of having a session at all.
 *
 * The `CURRENT_USER` fallback is gone too. A greeting that falls back to
 * somebody else's first name is the mild version of the bug HANDOVER records —
 * four screens once rendered one person's name beside another's data because
 * `session.user` and a mock employee have the same shape. With no session there
 * is no name, so the greeting drops the name rather than borrowing one.
 *
 * The hour is safe to read here: `AuthGate` renders a spinner until the session
 * has loaded, so the dashboard never appears in server-rendered HTML and there
 * is no first render for the client to disagree with. It is the *company's*
 * hour, not the reader's — the zone comes off the same session, via
 * `useOrgTimezone()` — so somebody dialling in from another timezone gets
 * "Good evening" at the company's evening, not their own.
 */
function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardHeader({ action }: { action?: React.ReactNode }) {
  const { displayName } = useSession();
  const timeZone = useOrgTimezone();
  const firstName = displayName?.split(" ")[0];
  const now = new Date(); // reads-the-clock: both readings below take the org zone
  const hello = greeting(hourIn(now, timeZone));

  /**
   * The date, under the greeting.
   *
   * `PageHeader`'s own note says to use `description` sparingly, for a screen
   * whose name does not explain it — and a greeting is the extreme case of
   * that: "Good morning, Emeka" is the only page title in this product that
   * names nothing at all. It was the largest text on the screen and the least
   * informative thing on it.
   *
   * The date earns the line because of what is under it. The card below says
   * you are expected at 08:00 and offers to clock you in; which day that is
   * about is a fact the screen was asking people to supply themselves. Same
   * zone as the greeting, for the same reason — the company's day, not the
   * reader's, so somebody dialling in from another timezone is told the date
   * their attendance will be recorded against.
   */
  const today = `${weekdayIn(now, timeZone)}, ${formatDate(now, timeZone)}`;

  return (
    <PageHeader
      title={firstName ? `${hello}, ${firstName}` : hello}
      description={today}
      action={action}
    />
  );
}
