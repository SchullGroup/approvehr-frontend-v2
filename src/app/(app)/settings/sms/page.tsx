import type { Metadata } from "next";
import { RequirePermission } from "@/components/portal/require-permission";
import { SmsScreen } from "./sms-screen";

export const metadata: Metadata = {
  title: "Text messages",
  description:
    "A weekly text of counts and a link, only for people who opt in. Who has agreed, and how.",
};

/**
 * Gated by `MANAGE_SETTINGS`, as the API is for everything on this screen.
 *
 * A sidebar hides a door and does not lock it, so the page asks too: somebody who
 * typed the URL would otherwise see an empty shell with every read refused. The
 * API stays the authority; this decides what to offer.
 */
export default function SmsPage() {
  return (
    <RequirePermission
      permission="MANAGE_SETTINGS"
      pageTitle="Text messages"
      title="You cannot open Text messages"
      what="Managing text messages"
    >
      <SmsScreen />
    </RequirePermission>
  );
}
