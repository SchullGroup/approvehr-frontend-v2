import type { Metadata } from "next";
import { LoansScreen } from "./loans-screen";

export const metadata: Metadata = {
  title: "Staff loans · ApproveHR",
  description:
    "Who has borrowed what, how much is left, and what comes out of this month's payroll. Approve or decline from the row.",
};

export default function LoansPage() {
  return <LoansScreen />;
}
