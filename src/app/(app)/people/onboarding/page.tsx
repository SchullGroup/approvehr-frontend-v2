import type { Metadata } from "next";
import { OnboardingScreen } from "./onboarding-screen";

export const metadata: Metadata = {
  title: "Onboarding",
  description: "New starters and what is still outstanding for each.",
};

export default function OnboardingPage() {
  return <OnboardingScreen />;
}
