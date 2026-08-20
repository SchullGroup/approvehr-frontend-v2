import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { pipelineCards } from "@/lib/mock/hiring";
import { OfferApprovals } from "./approvals";

export const metadata: Metadata = {
  title: "Offer approvals",
  description: "Offers waiting on a decision before they reach a candidate.",
};

export default function OffersPage() {
  const awaiting = pipelineCards().filter(
    (c) => c.offer && c.offer.status === "pending_approval",
  );

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/hiring", label: "Hiring" },
          { href: "/hiring/offers", label: "Offers" },
        ]}
        title="Offer approvals"
        description="Nothing here has reached a candidate yet. Approving releases the offer to the recruiter to send."
      />
      <PageBody>
        <OfferApprovals initial={awaiting} />
      </PageBody>
    </>
  );
}
