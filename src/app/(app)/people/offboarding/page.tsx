import type { Metadata } from "next";
import { OffboardingScreen } from "./offboarding-screen";

export const metadata: Metadata = {
  title: "Leavers",
  description:
    "Everyone on their way out, how far through their leaving checklist they are, and what is still outstanding before their record can be closed.",
};

export default function OffboardingPage() {
  return <OffboardingScreen />;
}
