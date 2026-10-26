import type { Metadata } from "next";
import { OverviewScreen } from "./overview-screen";
import { WellnessShell } from "./wellness-shell";

export const metadata: Metadata = {
  title: "Wellness",
  description:
    "Your own water and steps, break reminders, challenges and kudos. What you log is seen by nobody else.",
};

export default function WellnessPage() {
  return (
    <WellnessShell active="/wellness">
      <OverviewScreen />
    </WellnessShell>
  );
}
