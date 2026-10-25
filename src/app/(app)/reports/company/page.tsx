import type { Metadata } from "next";
import { tabFromQuery } from "@/lib/url-tab";
import { CompanyReportScreen } from "./company-report-screen";
import { COMPANY_TABS } from "./tabs";

export const metadata: Metadata = {
  title: "Company reports",
  description:
    "What the records say about the people side of the company: what needs a decision, what was measured, and how departments compare.",
};

/**
 * The company report.
 *
 * Design: `docs/superpowers/specs/2026-10-22-company-report-design.md`. It
 * replaced Explore, which drew the departments as spheres and carried no figure
 * on the canvas; `/reports/explore` redirects here.
 *
 * `?tab=` and `?cycle=` are read on the server and handed to the screen, so a
 * link opens on the tab and period it names without the page waiting behind a
 * Suspense boundary to read one string each.
 */
export default async function CompanyReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[]; cycle?: string | string[] }>;
}) {
  const { tab, cycle } = await searchParams;
  const one = Array.isArray(cycle) ? cycle[0] : cycle;
  return (
    <CompanyReportScreen
      initialTab={tabFromQuery(tab, COMPANY_TABS, "overview")}
      initialCycle={one && /^[0-9a-f-]{36}$/i.test(one) ? one : null}
    />
  );
}
