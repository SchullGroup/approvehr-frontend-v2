import type { Metadata } from "next";
import { NotificationsInbox } from "./inbox";

export const metadata: Metadata = {
  title: "Notifications",
  description:
    "Approvals waiting on you, payroll and filing reminders, and everything else the product has told you about.",
};

export default function NotificationsPage() {
  return <NotificationsInbox />;
}
