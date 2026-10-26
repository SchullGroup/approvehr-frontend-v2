import type { Metadata } from "next";
import { CareersSettingsScreen } from "./careers-settings-screen";

export const metadata: Metadata = {
  title: "Careers page settings",
  description:
    "How your company appears to applicants, what they are asked to accept, and the confirmation email they get.",
};

export default function CareersSettingsPage() {
  return <CareersSettingsScreen />;
}
