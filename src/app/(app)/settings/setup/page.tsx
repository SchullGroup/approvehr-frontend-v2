import type { Metadata } from "next";
import { SetupScreen } from "./setup-screen";

export const metadata: Metadata = {
  title: "Setting up your company",
  description:
    "What is still to set up, and what each step changes in the product.",
};

export default function SetupPage() {
  return <SetupScreen />;
}
