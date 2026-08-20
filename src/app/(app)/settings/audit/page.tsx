import type { Metadata } from "next";
import { AuditScreen } from "./audit-screen";

export const metadata: Metadata = {
  title: "Audit log",
  description: "Who did what, when, and what it changed.",
};

/**
 * The record filter is read here, on the server, and handed down as a prop.
 *
 * `useSearchParams` in the screen would force the whole page into a Suspense
 * boundary and a client-side read for two strings — the same call
 * `payroll/pay-setup/page.tsx` and the reset-password page make, for the same
 * reason. It also means `RecordHistory`'s "All 12" link lands on a log already
 * narrowed to that record on the first paint rather than after a hydration.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    entityType?: string | string[];
    entityId?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const one = (value?: string | string[]) =>
    (Array.isArray(value) ? value[0] : value) ?? "";

  return (
    <AuditScreen
      initialEntityType={one(params.entityType)}
      initialEntityId={one(params.entityId)}
    />
  );
}
