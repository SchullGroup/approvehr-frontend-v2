import type { Metadata } from "next";
import { AdvancesScreen } from "./advances-screen";

export const metadata: Metadata = {
  title: "Pay early",
  description:
    "Draw pay you have already earned before payday, and decide the ones other people have asked for.",
};

export default function AdvancesPage() {
  return <AdvancesScreen />;
}
