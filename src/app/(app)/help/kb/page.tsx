import type { Metadata } from "next";
import { KbScreen } from "./kb-screen";

export const metadata: Metadata = {
  title: "Help articles",
  description:
    "Search the help centre, or browse it by section. Published articles only.",
};

export default function KbPage() {
  return <KbScreen />;
}
