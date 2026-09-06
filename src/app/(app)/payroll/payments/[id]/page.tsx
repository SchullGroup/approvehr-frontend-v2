import type { Metadata } from "next";
import { BatchDetailScreen } from "./batch-detail-screen";

export const metadata: Metadata = {
  title: "Payment batch",
  description:
    "Who is being paid, how much, from which account, and the payment file to take to your bank.",
};

/**
 * Not prerendered.
 *
 * A batch id belongs to a row in a database, or to a demo book in one browser's
 * storage. There is no build-time list of them, so there is nothing to
 * `generateStaticParams` from.
 */
export default async function PaymentBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BatchDetailScreen id={id} />;
}
