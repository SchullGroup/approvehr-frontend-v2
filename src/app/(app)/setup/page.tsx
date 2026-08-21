import type { Metadata } from "next";
import { SetupWizard } from "./wizard";

export const metadata: Metadata = {
  title: "Set up your company",
  description:
    "Five questions, so you only see the parts of the product you actually use.",
};

export default function SetupPage() {
  return <SetupWizard />;
}
