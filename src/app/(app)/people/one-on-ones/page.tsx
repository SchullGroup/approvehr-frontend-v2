import type { Metadata } from "next";
import { OneOnOnesScreen } from "./one-on-ones-screen";

export const metadata: Metadata = {
  title: "One-to-ones",
  description:
    "Standing one-to-ones between a manager and their reports — private to the two people in them, with a coverage report that carries no content.",
};

export default function OneOnOnesPage() {
  return <OneOnOnesScreen />;
}
