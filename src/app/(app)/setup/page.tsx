import type { Metadata } from "next";
import { SetupWizard } from "./wizard";

export const metadata: Metadata = {
  title: "Set up your company",
  description:
    "Seven questions, so you only see the parts of the product you use and " +
    "payroll deducts what you actually deduct.",
};

export default function SetupPage() {
  return <SetupWizard />;
}
