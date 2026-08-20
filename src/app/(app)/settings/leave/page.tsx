import type { Metadata } from "next";
import { LeavePolicyForm } from "./form";

export const metadata: Metadata = {
  title: "Leave policies",
  description: "Entitlements, accrual, carry-over and the notice each type requires.",
};

export default function LeavePolicyPage() {
  return <LeavePolicyForm />;
}
