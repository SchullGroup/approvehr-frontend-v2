import type { Metadata } from "next";
import { ChecklistSettingsScreen } from "./checklist-settings";

export const metadata: Metadata = {
  title: "Exit checklist",
  description:
    "The list every leaver works through. Seven lines to start with, and you only come here if yours are different.",
};

export default function ExitChecklistPage() {
  return <ChecklistSettingsScreen />;
}
