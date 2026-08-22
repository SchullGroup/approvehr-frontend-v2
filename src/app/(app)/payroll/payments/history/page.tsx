import type { Metadata } from "next";
import { PaymentHistoryScreen } from "./history-screen";

/**
 * `/payroll/payments/history`.
 *
 * A static segment beside `payments/[id]`, which Next resolves in favour of the
 * static one. Safe because a `PaymentBatch` id is a UUID and can never be the
 * string `history` — but it is the reason this route is not called anything a
 * batch could be named.
 */
export const metadata: Metadata = {
  title: "Payment history",
  description:
    "Every payment to every person, by month, and whether the money actually moved.",
};

export default function PaymentHistoryPage() {
  return <PaymentHistoryScreen />;
}
