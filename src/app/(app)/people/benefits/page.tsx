import type { Metadata } from "next";
import { BenefitsScreen } from "./benefits-screen";

export const metadata: Metadata = {
  title: "Benefits",
  description:
    "What the company gives staff beyond salary, who is on what, and what it costs — with the employer's share kept separate from the employee's.",
};

export default function BenefitsPage() {
  return <BenefitsScreen />;
}
