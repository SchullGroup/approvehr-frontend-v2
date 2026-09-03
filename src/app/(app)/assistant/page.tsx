import type { Metadata } from "next";
import { AssistantScreen } from "./assistant-screen";

export const metadata: Metadata = {
  title: "Assistant",
  description:
    "Ask about your own records, and confirm any change it offers to make. Nothing is written until you press confirm.",
};

export default function AssistantPage() {
  return <AssistantScreen />;
}
