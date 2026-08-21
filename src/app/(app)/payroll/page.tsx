import type { Metadata } from "next";
import { PayrollScreen } from "./payroll-screen";

export const metadata: Metadata = {
  title: "Payroll",
  description: "Runs, approvals and what each one owes in statutory filings.",
};

export default function PayrollPage() {
  return <PayrollScreen />;
}
