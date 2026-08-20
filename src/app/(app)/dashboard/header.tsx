"use client";

import { PageHeader } from "@/components/portal/shell";
import { CURRENT_USER } from "@/lib/mock/people";
import { useSession } from "@/lib/store/session";

/**
 * The dashboard's greeting, split out as a client component purely so it can
 * read the session — the page itself stays a server component.
 *
 * It said "Good morning, Amara" to everyone, at every hour, because the name
 * came from the hardcoded `CURRENT_USER` and the greeting was a literal. Both
 * are now real, which is the whole point of having a session at all.
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
  description,
  action,
}: {
  description?: string;
  action?: React.ReactNode;
}) {
  const { displayName } = useSession();
  const firstName = (displayName ?? CURRENT_USER.firstName).split(" ")[0];

  return (
    <PageHeader
      title={`${greeting(new Date().getHours())}, ${firstName}`}
      description={description}
      action={action}
    />
  );
}
