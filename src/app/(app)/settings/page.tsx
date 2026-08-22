import type { Metadata } from "next";
import { SettingsScreen } from "./settings-screen";

export const metadata: Metadata = {
  title: "Settings",
  description:
    "Set the company up in one place: profile, offices, employee fields, leave, pay and access.",
};

export default function SettingsPage() {
  return <SettingsScreen />;
}
