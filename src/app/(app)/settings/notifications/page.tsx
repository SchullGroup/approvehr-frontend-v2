import type { Metadata } from "next";
import { NotificationSettings } from "./settings";

export const metadata: Metadata = {
  title: "Notifications",
  description: "What triggers an email, and who receives approval reminders.",
};

export default function NotificationsPage() {
  return <NotificationSettings />;
}
