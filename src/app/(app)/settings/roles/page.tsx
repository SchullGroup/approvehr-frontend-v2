import type { Metadata } from "next";
import { RolesScreen } from "./roles-screen";

export const metadata: Metadata = {
  title: "Roles and permissions",
  description: "Who can see salaries, approve payroll, or export employee data.",
};

/**
 * `?open=<roleId>` is read here, server-side, and handed down as a prop — the
 * same reason `ShiftsPage` reads `?tab=` this way rather than with
 * `useSearchParams` in the client screen, which would force the whole page
 * into a Suspense boundary for one string. It is what lets the header search
 * open a role directly instead of landing on the bare list.
 */
export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string | string[] }>;
}) {
  const { open } = await searchParams;
  const single = Array.isArray(open) ? open[0] : open;
  return <RolesScreen initialOpenId={single?.trim() ? single.trim() : null} />;
}
