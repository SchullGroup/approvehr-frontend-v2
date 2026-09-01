import { Suspense } from "react";
import type { Metadata } from "next";
import { HelpScreen } from "./help-screen";

export const metadata: Metadata = {
  title: "Help desk",
  description:
    "Ask HR a question and see what came back. Whoever handles requests sees the whole queue, soonest promise first.",
};

/**
 * Suspense boundary is required: the screen reads `?ticket=<id>` with
 * `useSearchParams` so a notification can open the exact ticket it is about.
 * Without this, the boundary would be the whole route.
 */
export default function HelpPage() {
  return (
    <Suspense fallback={null}>
      <HelpScreen />
    </Suspense>
  );
}
