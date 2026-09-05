import type { Metadata } from "next";
import { AppearanceScreen } from "./appearance-screen";

export const metadata: Metadata = {
  title: "Appearance",
  description: "Choose light or dark, or match your device.",
};

export default function AppearanceSettingsPage() {
  return <AppearanceScreen />;
}
