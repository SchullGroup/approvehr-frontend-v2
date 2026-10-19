import type { Metadata } from "next";
import { ConnectionScreen } from "./connection-screen";

export const metadata: Metadata = {
  title: "Work tracker · Integrations",
  description:
    "Choose which projects are read, match people, and point work at objectives.",
};

/**
 * Not prerendered: a connection id belongs to a row in a database, the same
 * situation as `/settings/webhooks/[id]`.
 */
export default async function WorkTrackerConnectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ConnectionScreen id={id} />;
}
