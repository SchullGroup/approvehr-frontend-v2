import type { Metadata } from "next";
import { AttendanceScreen } from "./attendance-screen";

export const metadata: Metadata = {
  title: "Attendance",
  description:
    "Who is in, who is late, who is on leave, and the days-present figure payroll prorates against.",
};

export default function AttendancePage() {
  return <AttendanceScreen />;
}
