import type { Metadata } from "next";
import { OfferApprovals } from "./approvals";

export const metadata: Metadata = {
  title: "Offer approvals",
  description: "Offers waiting on a decision before they reach a candidate.",
};

/**
 * `/hiring/offers`
 *
 * A shell. `MANAGE_HIRING` is a client-side fact, so the gate, the header and
 * everything else live in `approvals.tsx` — see its header for why.
 */
export default function OffersPage() {
  return <OfferApprovals />;
}
