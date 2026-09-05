import type { Metadata } from "next";
import { SkillsScreen } from "./skills-screen";

export const metadata: Metadata = {
  title: "Competency ratings",
  description: "Where people stand against the levels the company set.",
};

export default function PerformanceSkillsPage() {
  return <SkillsScreen />;
}
