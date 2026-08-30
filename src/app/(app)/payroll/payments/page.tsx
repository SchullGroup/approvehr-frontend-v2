import type { Metadata } from "next";
import { PaymentsScreen } from "./payments-screen";

export const metadata: Metadata = {
  title: "Wallet",
  description:
    "What the company holds, where money goes in, and every payment that has been prepared.",
};

export default function PaymentsPage() {
  return <PaymentsScreen />;
}
