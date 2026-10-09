import type { Metadata } from "next";
import { ExploreScreen } from "./explore-screen";

export const metadata: Metadata = {
  title: "Explore",
  description:
    "The company's departments as a navigable 3D space, sized by headcount.",
};

export default function Page() {
  return <ExploreScreen />;
}
