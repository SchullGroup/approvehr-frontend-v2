import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppraisalPreview } from "./appraisal-preview";

export const metadata: Metadata = {
  title: "Appraisal flow preview",
  description:
    "A mock-up of the step-by-step appraisal for an employee, with example answers. Nothing is saved.",
};

/** A development mock-up. A production build has no such page. */
export default function AppraisalPreviewPage() {
  if (!DEMO_ENABLED) notFound();
  return <AppraisalPreview />;
}
