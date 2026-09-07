import type { Metadata } from "next";
import { PerformanceScreen } from "./performance-screen";

export const metadata: Metadata = {
  title: "Performance",
  description:
    "What is waiting on you, and how the running appraisal period is going.",
};

/**
 * The Performance module's landing.
 *
 * Used to read a `?tab=` and hand it down to a six-tab page. The six tabs are
 * seven real nav items now (see `nav.tsx`'s `performance` group), so this is
 * just the Overview door: what is open, what is waiting on you, what is
 * waiting on somebody else. Everything else — KPIs, Review tasks, Competency
 * ratings, Appraisal periods, Objectives to agree, Who appraises whom — has
 * its own route and its own place in the sidebar.
 */
export default function PerformancePage() {
  return <PerformanceScreen />;
}
