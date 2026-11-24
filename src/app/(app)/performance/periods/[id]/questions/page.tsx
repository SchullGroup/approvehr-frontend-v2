import type { Metadata } from "next";
import { QuestionsWizard } from "./questions-wizard";

export const metadata: Metadata = {
  title: "Add questions",
  description:
    "Check the questions a new appraisal period asks, one group at a time, add your own, then finish.",
};

export default async function AddQuestionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <QuestionsWizard cycleId={id} />;
}
