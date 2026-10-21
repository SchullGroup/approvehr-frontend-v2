import type { Metadata } from "next";
import { FairnessHome } from "./fairness-home";

export const metadata: Metadata = {
  title: "Fairness check",
  description:
    "How an appraisal period's marks compare by gender, age, time at the company, location, contract type, department and manager.",
};

export default function FairnessModulePage() {
  return <FairnessHome />;
}
