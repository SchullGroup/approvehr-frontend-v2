import type { Metadata } from "next";
import { AppraisalsScreen } from "./appraisals-screen";

export const metadata: Metadata = {
  title: "Appraisals",
  description:
    "Where your appraisal stands, step by step, and where your team's do.",
};

export default function AppraisalsPage() {
  return <AppraisalsScreen />;
}
