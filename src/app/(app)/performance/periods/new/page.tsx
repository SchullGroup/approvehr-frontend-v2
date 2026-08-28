import type { Metadata } from "next";
import { DraftPeriodWizard } from "./draft-wizard";

export const metadata: Metadata = {
  title: "Draft a period",
  description:
    "Describe an appraisal period in a sentence or two and edit the goals and questions that come back. Nothing is created until the last screen.",
};

export default function DraftPeriodPage() {
  return <DraftPeriodWizard />;
}
