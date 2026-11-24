import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ManagerPreview } from "./manager-preview";

export const metadata: Metadata = {
  title: "Manager appraisal preview",
  description:
    "A mock-up of a manager's team list and the step-by-step appraisal of one person, with example data. Nothing is saved.",
};

/** A development mock-up. A production build has no such page. */
export default function ManagerPreviewPage() {
  if (!DEMO_ENABLED) notFound();
  return <ManagerPreview />;
}
