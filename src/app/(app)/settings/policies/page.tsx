import type { Metadata } from "next";
import { PoliciesScreen } from "./policies-screen";

export const metadata: Metadata = {
  title: "Handbook",
  description:
    "Your company policies, the version in force, and who has accepted each one.",
};

export default function PoliciesPage() {
  return <PoliciesScreen />;
}
