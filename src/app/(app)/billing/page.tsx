import { redirect } from "next/navigation";

/**
 * `/billing` was a 404, though Settings shows a Billing block and people type
 * the short address (L22). The page is `/billing/pay`.
 */
export default function BillingPage() {
  redirect("/billing/pay");
}
