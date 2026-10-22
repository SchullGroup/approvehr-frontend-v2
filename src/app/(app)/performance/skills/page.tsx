import type { Metadata } from "next";
import { tabFromQuery } from "@/lib/url-tab";
import { SkillsScreen } from "./skills-screen";
import { SKILLS_TABS } from "./tabs";

export const metadata: Metadata = {
  title: "Competency ratings",
  description: "Where people stand against the levels the company set.",
};

export default async function PerformanceSkillsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  return <SkillsScreen initialTab={tabFromQuery(tab, SKILLS_TABS, "mine")} />;
}
