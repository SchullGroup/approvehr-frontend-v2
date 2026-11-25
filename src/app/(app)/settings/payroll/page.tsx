import { redirect } from "next/navigation";

/**
 * Payroll settings have one home: the Settings tab of Pay setup (U80, PAY-26).
 * This page rendered the same form a second time under a second name, so it
 * now leads there, and every link to it keeps working.
 */
export default function PayrollSettingsPage() {
  redirect("/payroll/pay-setup?tab=settings");
}
