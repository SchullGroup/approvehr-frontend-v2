import type { Metadata } from "next";
import { RequirePermission } from "@/components/portal/require-permission";
import { SettingsScreen } from "./settings-screen";

export const metadata: Metadata = {
  title: "Settings",
  description:
    "Set the company up in one place: profile, offices, employee fields, leave, pay and access.",
};

/**
 * The hub is the admin's. The sidebar already hides it behind
 * `MANAGE_SETTINGS`, but a sidebar hides a door and does not lock it: anybody who
 * typed the URL used to get the whole setup checklist, billing, module switches
 * and job roles, with every write refused one click later. Each page behind it
 * gates itself; the hub did not.
 */
export default function SettingsPage() {
  return (
    <RequirePermission
      permission="MANAGE_SETTINGS"
      pageTitle="Settings"
      title="You cannot open Settings"
      what="Setting the company up"
    >
      <SettingsScreen />
    </RequirePermission>
  );
}
