import type { Metadata } from "next";
import { HowAppraisalsWorkScreen } from "./screen";

export const metadata: Metadata = {
  title: "How appraisals work",
  description:
    "What a period is, what a mark is made of, and what happens when one is given.",
};

export default function HowAppraisalsWorkPage() {
  return <HowAppraisalsWorkScreen />;
}
