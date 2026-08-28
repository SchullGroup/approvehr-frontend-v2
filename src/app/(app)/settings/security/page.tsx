import type { Metadata } from "next";
import { SecurityScreen } from "./security-screen";

export const metadata: Metadata = {
  title: "Sign-in security",
  description:
    "Two-factor sign-in, the actions that need a code, and your recovery codes.",
};

export default function SecuritySettingsPage() {
  return <SecurityScreen />;
}
