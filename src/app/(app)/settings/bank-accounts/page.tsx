import type { Metadata } from "next";
import { BankAccountsScreen } from "./bank-accounts-screen";

export const metadata: Metadata = {
  title: "Bank accounts",
  description:
    "The accounts salaries are paid out of. Exactly one is the salary account, and changing it is recorded.",
};

export default function BankAccountsPage() {
  return <BankAccountsScreen />;
}
