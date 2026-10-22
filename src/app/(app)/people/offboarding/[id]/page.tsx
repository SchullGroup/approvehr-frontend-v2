import type { Metadata } from "next";
import { tabFromQuery } from "@/lib/url-tab";
import { ExitDetailScreen } from "./exit-detail-screen";
import { EXIT_TABS } from "./tabs";

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  return (
    <ExitDetailScreen
      id={id}
      initialTab={tabFromQuery(tab, EXIT_TABS, "checklist")}
    />
  );
}
