import type { Metadata } from "next";
import { DevicesScreen } from "./devices-screen";

export const metadata: Metadata = {
  title: "Biometric terminals",
  description:
    "The clock-in terminals registered to this company, and which person each one's enrolment numbers mean.",
};

export default function AttendanceDevicesPage() {
  return <DevicesScreen />;
}
