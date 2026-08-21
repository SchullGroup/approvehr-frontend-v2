import type { Metadata } from "next";
import { OvertimeScreen } from "./overtime-screen";

export const metadata: Metadata = {
  title: "Overtime",
  description:
    "Extra hours worked out from the clock, what they come to, and what is still waiting for approval.",
};

export default function OvertimePage() {
  return <OvertimeScreen />;
}
