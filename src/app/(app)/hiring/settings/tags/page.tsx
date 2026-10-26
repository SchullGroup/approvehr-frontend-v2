import type { Metadata } from "next";
import { TagsScreen } from "./tags-screen";

export const metadata: Metadata = {
  title: "Candidate tags",
  description: "The labels a company puts on candidates.",
};

export default function TagsPage() {
  return <TagsScreen />;
}
