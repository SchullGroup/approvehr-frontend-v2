"use client";

import { PageHeader } from "@/components/portal/shell";
import { useSession } from "@/lib/store/session";

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
 * is no first render for the client to disagree with.
 */
function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardHeader({
  action,
}: {
  action?: React.ReactNode;
}) {
  const { displayName } = useSession();
  const firstName = displayName?.split(" ")[0];
  const hello = greeting(new Date().getHours());

  return (
    <PageHeader
      title={firstName ? `${hello}, ${firstName}` : hello}
      action={action}
    />
  );
}
