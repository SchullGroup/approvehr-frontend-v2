import type { Metadata } from "next";
import { HiringScreen } from "./hiring-screen";

/**
 * `/hiring`
 *
 * A shell only. The figures are live when the API answers and seeded when it
 * does not, which is a client decision — so everything below the metadata is in
 * `hiring-screen.tsx`.
 */
export const metadata: Metadata = {
  title: "Hiring",
  description: "Every advertised role and everybody waiting on a decision.",
};

export default function HiringPage() {
  return <HiringScreen />;
}
