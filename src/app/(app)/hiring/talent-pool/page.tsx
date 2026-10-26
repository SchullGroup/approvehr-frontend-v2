import type { Metadata } from "next";
import { TalentPoolScreen } from "./talent-pool-screen";

export const metadata: Metadata = {
  title: "Talent pool",
  description: "People kept on file for another role.",
};

export default function TalentPoolPage() {
  return <TalentPoolScreen />;
}
