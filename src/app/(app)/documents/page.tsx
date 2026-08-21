import type { Metadata } from "next";
import { MyDocuments } from "@/app/(app)/people/documents";
import { PageBody, PageHeader } from "@/components/portal/shell";

export const metadata: Metadata = {
  title: "My documents",
  description:
    "What the company holds about you, and what it is asking you for.",
};

/**
 * The employee's own door into documents.
 *
 * A route of its own rather than only a card on `/profile`, because it is where
 * the notification lands: `HREF.mine` in the API's documents service is
 * `/documents`, and every "Send us your work permit" message links straight
 * here. If this route ever moves, that constant moves with it — one line.
 *
 * The same `<MyDocuments heading={false} />` renders inside `/profile`. One component, so the
 * two cannot disagree about what the company holds.
 */
export default function MyDocumentsPage() {
  return (
    <>
      <PageHeader
        title="My documents"
        description="What the company holds about you, and what it is asking you for."
      />
      <PageBody>
        <MyDocuments heading={false} />
      </PageBody>
    </>
  );
}
