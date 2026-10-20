import type { Metadata } from "next";
import { AssessmentImportScreen } from "./assessment-import-screen";

export const metadata: Metadata = {
  title: "Import assessment scores",
  description:
    "Bring a test's results in from a spreadsheet. Each score is matched to an applicant by email.",
};

/**
 * `/hiring/postings/[id]/assessment-scores`
 *
 * A shell: who may open it and everything it shows is a client fact.
 */
export default async function AssessmentScoresPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AssessmentImportScreen id={id} />;
}
