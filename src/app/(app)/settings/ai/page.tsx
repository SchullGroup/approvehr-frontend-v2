import type { Metadata } from "next";
import { AiScreen } from "./ai-screen";

/* "Assistant settings", not "Assistant" — `/assistant` already owns that tab
   title, and two tabs both reading "Assistant" is easy to close by mistake. */
export const metadata: Metadata = {
  title: "Assistant settings",
  description:
    "Whether the assistant is switched on, which model answers, what is sent to it, and everywhere it appears.",
};

export default function AiSettingsPage() {
  return <AiScreen />;
}
