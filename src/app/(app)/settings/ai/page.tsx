import type { Metadata } from "next";
import { AiScreen } from "./ai-screen";

/* "Assistant settings", not "Assistant" — `/assistant` is the assistant, and two
   browser tabs reading "Assistant · ApproveHR" is a tab somebody closes by
   mistake. The heading on the page is unchanged; it sits under a Settings
   breadcrumb, so it is not ambiguous where it is read. */
export const metadata: Metadata = {
  title: "Assistant settings",
  description:
    "Whether the assistant is switched on, which model answers, what is sent to it, and everywhere it appears.",
};

export default function AiSettingsPage() {
  return <AiScreen />;
}
