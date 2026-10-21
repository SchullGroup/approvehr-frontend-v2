import type { Metadata } from "next";
import { SettingsScreen } from "../settings-screen";
import { WellnessShell } from "../wellness-shell";

export const metadata: Metadata = {
  title: "Wellness settings",
  description: "The privacy floor for the company's wellness results.",
};

export default function WellnessSettingsPage() {
  return (
    <WellnessShell active="/wellness/settings">
      <SettingsScreen />
    </WellnessShell>
  );
}
