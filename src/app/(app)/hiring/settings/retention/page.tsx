import type { Metadata } from "next";
import { RetentionScreen } from "./retention-screen";

export const metadata: Metadata = {
  title: "Data retention",
  description: "How long rejected and withdrawn candidates are kept.",
};

export default function RetentionPage() {
  return <RetentionScreen />;
}
