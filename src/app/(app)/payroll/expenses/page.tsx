import type { Metadata } from "next";
import { ExpensesScreen } from "./expenses-screen";

export const metadata: Metadata = {
  title: "Expenses",
  description: "Claims, approvals, and what you still owe staff.",
};

/* A client screen: approving a claim moves the outstanding total, the queue and
   the register in one breath, so all three are live state. Only the metadata
   stays on the server. */
export default function ExpensesPage() {
  return <ExpensesScreen />;
}
