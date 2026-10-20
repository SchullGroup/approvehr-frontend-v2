import type { Metadata } from "next";
import { AcceptedOffersScreen } from "./accepted-offers-screen";

export const metadata: Metadata = {
  title: "Accepted offers",
  description: "What happens when somebody accepts an offer.",
};

export default function AcceptedOffersPage() {
  return <AcceptedOffersScreen />;
}
