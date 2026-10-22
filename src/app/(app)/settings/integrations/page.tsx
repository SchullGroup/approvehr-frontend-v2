import type { Metadata } from "next";
import { tabFromQuery } from "@/lib/url-tab";
import { IntegrationsList } from "./list";
import { INTEGRATION_TABS } from "./tabs";

export const metadata: Metadata = {
  title: "Integrations",
  description:
    "Work trackers such as Jira, accounting, attendance devices, single sign-on and payment execution.",
};

/**
 * `?workTracker=connected|error&reason=…&connectionId=…` is how the API sends
 * the browser back after a tool's consent screen. Read here rather than with
 * `useSearchParams`, the same as `/settings/audit`, so the screen needs no
 * Suspense boundary.
 */
export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    workTracker?: string | string[];
    reason?: string | string[];
    connectionId?: string | string[];
    tab?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const one = (value?: string | string[]) =>
    (Array.isArray(value) ? value[0] : value) ?? null;
  const status = one(params.workTracker);

  return (
    <IntegrationsList
      workTrackerReturn={{
        status: status === "connected" || status === "error" ? status : null,
        reason: one(params.reason),
        connectionId: one(params.connectionId),
      }}
      initialTab={tabFromQuery(params.tab, INTEGRATION_TABS, "trackers")}
    />
  );
}
