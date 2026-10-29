import type { Metadata } from "next";
import { RequiredDetailsScreen } from "./required-details-screen";

export const metadata: Metadata = {
  title: "Required details",
  description:
    "Choose which personal details every member of staff must fill in on My profile, and see who still has gaps.",
};

export default function RequiredDetailsPage() {
  return <RequiredDetailsScreen />;
}
