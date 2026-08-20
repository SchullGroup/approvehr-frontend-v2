import type { Metadata } from "next";
import { FeaturesScreen } from "./features-screen";

export const metadata: Metadata = {
  title: "Turn on more features",
  description:
    "Every capability in the product, one line each, with a switch.",
};

export default function FeaturesPage() {
  return <FeaturesScreen />;
}
