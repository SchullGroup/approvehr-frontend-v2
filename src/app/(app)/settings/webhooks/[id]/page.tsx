import type { Metadata } from "next";
import { WebhookDetailScreen } from "./detail-screen";

export const metadata: Metadata = {
  title: "Endpoint · Webhooks",
  description:
    "Send a test event, and read every delivery attempt with the reason it failed.",
};

/**
 * Not prerendered.
 *
 * A webhook id belongs to a row in a database. There is no build-time list of
 * them, so there is nothing to `generateStaticParams` from — the same situation
 * as `/payroll/loans/[id]`.
 */
export default async function WebhookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WebhookDetailScreen id={id} />;
}
