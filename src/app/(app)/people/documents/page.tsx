import type { Metadata } from "next";
import { DocumentsScreen } from "./documents-screen";

export const metadata: Metadata = {
  title: "Documents · ApproveHR",
  description:
    "What you hold on each person's file, what is still outstanding, and what is about to run out of date.",
};

export default function DocumentsPage() {
  return <DocumentsScreen />;
}
