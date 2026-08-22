import type { Metadata } from "next";
import { AnnouncementsScreen } from "./announcements-screen";

export const metadata: Metadata = {
  title: "Noticeboard",
  description:
    "Write, publish and take down the notices your company shows everybody on their dashboard.",
};

export default function AnnouncementsSettingsPage() {
  return <AnnouncementsScreen />;
}
