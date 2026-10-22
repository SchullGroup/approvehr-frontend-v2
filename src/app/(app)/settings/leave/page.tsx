import type { Metadata } from "next";
import { LeavePolicyForm } from "./form";
import { isLeaveTab } from "./tabs";

export const metadata: Metadata = {
  title: "Leave policies",
  description:
    "Entitlements, accrual, carry-over and the notice each type requires.",
};

/**
 * The tab is read here, on the server, and handed down as a prop — the same
 * call `payroll/pay-setup/page.tsx` makes, for the same reason: reading
 * `useSearchParams` in the screen would push the whole page behind a Suspense
 * boundary for one string.
 */
export default async function LeavePolicyPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  const single = Array.isArray(tab) ? tab[0] : tab;
  return <LeavePolicyForm initialTab={isLeaveTab(single) ? single : "types"} />;
}
