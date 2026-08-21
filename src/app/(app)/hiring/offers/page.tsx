import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { SourceBadge } from "@/components/hiring/source-badge";
import { OfferApprovals } from "./approvals";

export const metadata: Metadata = {
  title: "Offer approvals",
  description: "Offers waiting on a decision before they reach a candidate.",
};

/**
 * `/hiring/offers`
 *
 * A shell. The offers themselves are seeded in both modes — `Offer` exists in
 * Prisma with an `outsideBand` flag and an approval trail, and no module exposes
 * it — but the **band** each one is measured against is the live grade ladder.
 * Two sources on one card, so the badge belongs to the card and not to this
 * header; see `approvals.tsx`.
 */
export default function OffersPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/hiring", label: "Hiring" },
          { href: "/hiring/offers", label: "Offers" },
        ]}
        title="Offer approvals"
        meta={<SourceBadge live={false} note="The offers themselves." />}
        description="Nothing here has reached a candidate yet, and approving does not send it — offers have no endpoint. Each one is checked against the pay structure's own grades, and every card says where those came from."
      />
      <PageBody>
        <OfferApprovals />
      </PageBody>
    </>
  );
}
