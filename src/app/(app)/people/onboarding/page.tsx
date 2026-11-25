import type { Metadata } from "next";
import { RequirePermission } from "@/components/portal/require-permission";
import { OnboardingScreen } from "./onboarding-screen";

export const metadata: Metadata = {
  title: "Onboarding",
  description: "New starters and what is still outstanding for each.",
};

export default function OnboardingPage() {
  return (
    <RequirePermission
      permission="EDIT_RECORDS"
      pageTitle="Onboarding"
      title="You cannot see onboarding"
      what="Seeing who is starting"
    >
      <OnboardingScreen />
    </RequirePermission>
  );
}
