import type { Metadata } from "next";
import { RequirePermission } from "@/components/portal/require-permission";
import { HelpdeskSettingsScreen } from "./helpdesk-screen";

export const metadata: Metadata = {
  title: "Help desk",
  description:
    "Ticket categories and the reply-and-resolution promises behind them.",
};

export default function HelpdeskSettingsPage() {
  return (
    <RequirePermission
      permission="MANAGE_SETTINGS"
      pageTitle="Help desk"
      title="You cannot change the help desk"
      what="Changing the help desk"
    >
      <HelpdeskSettingsScreen />
    </RequirePermission>
  );
}
