import type { Metadata } from "next";
import { FairnessScreen } from "./fairness-screen";

export const metadata: Metadata = {
  title: "Fairness check",
  description:
    "How an appraisal period's marks compare by gender, age, time at the company, location, contract type, department and manager.",
};

export default async function FairnessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  return (
    <FairnessScreen
      cycleId={id}
      initialTab={tab === "people" ? "people" : undefined}
    />
  );
}
