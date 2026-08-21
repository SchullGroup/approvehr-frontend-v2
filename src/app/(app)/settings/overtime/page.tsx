import type { Metadata } from "next";
import { OvertimePolicyForm } from "./form";

export const metadata: Metadata = {
  title: "Overtime policy",
  description:
    "Whether overtime is paid, the grace before it counts, the daily cap, and the weekday, weekend and public holiday rates.",
};

export default function OvertimePolicyPage() {
  return <OvertimePolicyForm />;
}
