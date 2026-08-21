import type { Metadata } from "next";
import { PaymentsScreen } from "./payments-screen";

export const metadata: Metadata = {
  title: "Payments",
  description:
    "Payment batches waiting to go out, what has left the account, and the payment file to take to your bank.",
};

export default function PaymentsPage() {
  return <PaymentsScreen />;
}
