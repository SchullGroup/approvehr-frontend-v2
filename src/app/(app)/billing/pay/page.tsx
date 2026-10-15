import type { Metadata } from "next";
import { PayScreen } from "./pay-screen";

export const metadata: Metadata = {
  title: "Subscribe",
  description: "Choose a plan and pay into your company's account.",
};

export default function PayPage() {
  return <PayScreen />;
}
