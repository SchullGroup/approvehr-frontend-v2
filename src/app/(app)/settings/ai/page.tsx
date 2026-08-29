import type { Metadata } from "next";
import { AiScreen } from "./ai-screen";

export const metadata: Metadata = {
  title: "Assistant",
  description:
    "Whether suggestions are switched on, which model answers, what is sent to it, and the three places a suggestion can appear.",
};

export default function AiSettingsPage() {
  return <AiScreen />;
}
