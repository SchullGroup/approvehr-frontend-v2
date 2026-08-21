import type { Metadata } from "next";
import { HelpScreen } from "./help-screen";

export const metadata: Metadata = {
  title: "Help desk",
  description:
    "Ask HR a question and see what came back. Whoever handles requests sees the whole queue, soonest promise first.",
};

export default function HelpPage() {
  return <HelpScreen />;
}
