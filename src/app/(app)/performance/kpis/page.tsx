import type { Metadata } from "next";
import { KpisScreen } from "./kpis-screen";

export const metadata: Metadata = {
  title: "Objectives",
  description:
    "What people are aiming at, and how far along it is, yours, your team's, or the company's.",
};

const one = (value: string | string[] | undefined): string | null =>
  typeof value === "string" && value !== "" ? value : null;

/**
 * Whose objectives and, for the whole company, which department are in the
 * address (`?scope=company&department=<id>`), so a department's list can be
 * linked and survives a refresh. The To agree tab is `?tab=agree`.
 */
export default async function PerformanceKpisPage({
  searchParams,
}: {
  searchParams: Promise<{
    scope?: string | string[];
    department?: string | string[];
    tab?: string | string[];
  }>;
}) {
  const { scope, department, tab } = await searchParams;
  return (
    <KpisScreen
      scope={one(scope)}
      department={one(department)}
      tab={one(tab)}
    />
  );
}
