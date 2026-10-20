import type { Metadata } from "next";
import { InterviewRemindersScreen } from "./reminders-screen";

export const metadata: Metadata = {
  title: "Interview reminders",
  description:
    "When candidates and panelists are reminded about an interview, and when a scorecard is chased.",
};

export default function InterviewRemindersPage() {
  return <InterviewRemindersScreen />;
}
