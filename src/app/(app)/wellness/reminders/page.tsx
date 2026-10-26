import type { Metadata } from "next";
import { RemindersScreen } from "../reminders-screen";
import { WellnessShell } from "../wellness-shell";

export const metadata: Metadata = {
  title: "Break reminders",
  description:
    "When to be reminded to take a break, and which breaks are named.",
};

export default function RemindersPage() {
  return (
    <WellnessShell active="/wellness/reminders">
      <RemindersScreen />
    </WellnessShell>
  );
}
