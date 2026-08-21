import type { Metadata } from "next";
import { ExitDetailScreen } from "./exit-detail-screen";

export const metadata: Metadata = {
  title: "Exit",
  description:
    "One exit: the checklist, who owns each item, who confirmed it, and whether the record can be closed.",
};

/**
 * Not prerendered.
 *
 * An exit id belongs to a row in a database, or to a demo book in one browser's
 * storage. There is no build-time list of them to `generateStaticParams` from.
 */
export default async function ExitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExitDetailScreen id={id} />;
}
