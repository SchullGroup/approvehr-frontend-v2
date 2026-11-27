import type { Metadata } from "next";
import { tabFromQuery } from "@/lib/url-tab";
import { AttendancePolicyForm } from "./form";
import { ATTENDANCE_TABS } from "./tabs";

export const metadata: Metadata = {
  title: "Working hours",
  description:
    "The shift everybody's clock-in is measured against, the grace before it counts as late, and which weekdays are working days.",
};

/**
 * The tab is read here, on the server, and handed down as a prop, the same call
 * `settings/leave/page.tsx` makes: reading `useSearchParams` in the screen would
 * push the whole page behind a Suspense boundary for one string.
 */
export default async function AttendancePolicyPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  return (
    <AttendancePolicyForm
      initialTab={tabFromQuery(tab, ATTENDANCE_TABS, "hours")}
    />
  );
}
