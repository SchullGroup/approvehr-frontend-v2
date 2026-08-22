import type { Metadata } from "next";
import { HistoryScreen } from "./history-screen";

export const metadata: Metadata = {
  title: "Attendance history",
  description:
    "A month at a glance, and for any day: who was in, who was late, who was on approved leave and who was not accounted for.",
};

export default function AttendanceHistoryPage() {
  return <HistoryScreen />;
}
