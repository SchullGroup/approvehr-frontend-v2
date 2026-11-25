import { redirect } from "next/navigation";

/**
 * The setup checklist had its own page, reached through a small chip on
 * Settings. It is gone (UAT 23 Nov, U43): every step is listed under Settings
 * beside the page it belongs to, and on the dashboard as a card the owner can
 * hide. An old link lands on Settings.
 */
export default function SetupPage(): never {
  redirect("/settings");
}
