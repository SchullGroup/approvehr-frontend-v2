import type { Metadata } from "next";
import { DeliveryScreen } from "../delivery-screen";
import { WellnessShell } from "../wellness-shell";

export const metadata: Metadata = {
  title: "Weekly delivery",
  description:
    "What was logged against objectives in a week, and how it was graded.",
};

export default function DeliveryPage() {
  return (
    <WellnessShell active="/wellness/delivery">
      <DeliveryScreen />
    </WellnessShell>
  );
}
