import type { Metadata } from "next";
import { HelpdeskSettingsScreen } from "./helpdesk-screen";

export const metadata: Metadata = {
  title: "Help desk",
  description:
    "Ticket categories and the reply-and-resolution promises behind them.",
};

export default function HelpdeskSettingsPage() {
  return <HelpdeskSettingsScreen />;
}
