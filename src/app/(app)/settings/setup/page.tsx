import type { Metadata } from "next";
import { RequirePermission } from "@/components/portal/require-permission";
import { SetupScreen } from "./setup-screen";

export const metadata: Metadata = {
  title: "Setting up your company",
  description:
    "What is still to set up, and what each step changes in the product.",
};

export default function SetupPage() {
  return (
    <RequirePermission
      permission="MANAGE_SETTINGS"
      pageTitle="Setting up your company"
      title="You cannot set the company up"
      what="Setting the company up"
    >
      <SetupScreen />
    </RequirePermission>
  );
}
