import { Suspense } from "react";
import type { Metadata } from "next";
import { PageBody } from "@/components/portal/shell";
import { RUN_PEOPLE } from "@/lib/mock/payroll";
import { PayslipHeader, PayslipHeaderFromUrl } from "./header";
import { PayslipView } from "./view";

export const metadata: Metadata = {
  title: "Payslip",
  description: "One month, itemised, with what was taken and what it was for.",
};

/**
 * The demo's payslip ids, prerendered.
 *
 * Connected, an id is a uuid nobody can enumerate at build time, so those render
 * on demand — which is why this page **no longer calls `notFound()`**. It used to
 * 404 anything not in the seed, which meant every real payslip from the API was
 * a 404. Whether the record exists is now the client's answer, because only the
 * client knows which source it is reading.
 */
export function generateStaticParams() {
  return RUN_PEOPLE.map((person) => ({ id: person.id }));
}

export default async function PayslipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  /* No `searchParams` here, and that is on purpose: reading it on the server makes the page render per request,
     and this route has an id nobody can list at build time. That combination answered every payslip with a bare
     "Internal Server Error" on the live site (26 Nov 2026). The month the payslip belongs to (`?run=`) is read in
     the browser, by the header and the view, behind a boundary. */
  return (
    <>
      <div className="no-print">
        <Suspense fallback={<PayslipHeader run={null} />}>
          <PayslipHeaderFromUrl />
        </Suspense>
      </div>
      <PageBody>
        <Suspense
          fallback={
            <p className="text-body-sm text-muted">Finding this payslip…</p>
          }
        >
          <PayslipView id={id} />
        </Suspense>
      </PageBody>
    </>
  );
}
