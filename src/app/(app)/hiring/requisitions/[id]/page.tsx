import type { Metadata } from "next";
import { REQUISITIONS, requisitionById } from "@/lib/mock/hiring";
import { RequisitionScreen } from "./requisition-screen";

/**
 * `/hiring/requisitions/[id]`
 *
 * A shell. `MANAGE_HIRING` is a client-side fact — see `requisition-screen.tsx`
 * for the gate and everything the role renders once it has been confirmed.
 *
 * `generateStaticParams` covers the seeded requisitions so the demo's pages are
 * prerendered. Every other id renders on demand, which is the normal case
 * connected: a real `Requisition` id this build has never seen.
 */
export function generateStaticParams() {
  return REQUISITIONS.map((r) => ({ id: r.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const req = requisitionById(id);
  return { title: req ? `${req.title} · Hiring` : "Requisition" };
}

export default async function RequisitionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RequisitionScreen id={id} />;
}
