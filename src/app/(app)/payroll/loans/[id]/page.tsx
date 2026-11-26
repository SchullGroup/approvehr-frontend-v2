import type { Metadata } from "next";
import { LoanDetailScreen } from "./loan-detail-screen";

export const metadata: Metadata = {
  title: "Staff loan",
  description:
    "One loan, its repayment schedule, and what is left to recover from payroll.",
};

/**
 * Not prerendered.
 *
 * A loan id belongs to a row in a database, or to a demo book in one browser's
 * storage. There is no build-time list of them, so there is nothing to
 * `generateStaticParams` from — unlike `/people/[id]`, whose seed records are
 * genuinely known in advance.
 */
export default async function LoanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LoanDetailScreen id={id} />;
}
