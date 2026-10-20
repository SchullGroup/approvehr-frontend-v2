import type { Metadata } from "next";
import { ReasonsScreen } from "./reasons-screen";

export const metadata: Metadata = {
  title: "Rejection reasons",
  description: "The reasons offered when somebody is turned down.",
};

export default function RejectionReasonsPage() {
  return <ReasonsScreen />;
}
