import type { Metadata } from "next";
import { KnowledgeScreen } from "./knowledge-screen";

export const metadata: Metadata = {
  title: "Help articles",
  description:
    "The knowledge base editor: reads, helpfulness, and the questions no article answers yet.",
};

export default function KnowledgeSettingsPage() {
  return <KnowledgeScreen />;
}
