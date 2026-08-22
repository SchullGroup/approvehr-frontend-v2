import type { Metadata } from "next";
import { ScoringWeightsForm } from "./weights-form";

export const metadata: Metadata = {
  title: "Appraisal scoring",
  description:
    "How much each part of an appraisal counts towards somebody's mark. The weights must make 100% exactly, and they are frozen onto a cycle when it starts.",
};

export default function PerformanceSettingsPage() {
  return <ScoringWeightsForm />;
}
