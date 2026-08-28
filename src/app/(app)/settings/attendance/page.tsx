import type { Metadata } from "next";
import { AttendancePolicyForm } from "./form";

export const metadata: Metadata = {
  title: "Working hours",
  description:
    "The shift everybody's clock-in is measured against, the grace before it counts as late, and which weekdays are working days.",
};

export default function AttendancePolicyPage() {
  return <AttendancePolicyForm />;
}
