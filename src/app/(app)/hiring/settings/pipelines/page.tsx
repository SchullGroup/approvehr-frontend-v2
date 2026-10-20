import type { Metadata } from "next";
import { TemplatesScreen } from "./templates-screen";

export const metadata: Metadata = {
  title: "Pipeline templates",
  description: "The stages a new role starts with, and what each stage is for.",
};

export default function PipelinesPage() {
  return <TemplatesScreen />;
}
