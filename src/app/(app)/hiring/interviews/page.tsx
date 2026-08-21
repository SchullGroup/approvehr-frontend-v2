import type { Metadata } from "next";
import { InterviewsScreen } from "./interviews-screen";

export const metadata: Metadata = {
  title: "Interviews",
  description: "Everything scheduled, and every scorecard still owed.",
};

/**
 * `/hiring/interviews`
 *
 * A shell. The screening backlog at the top is live when the API answers and the
 * diary below it is seeded in both modes, which is a client decision — so
 * everything below the metadata is in `interviews-screen.tsx`.
 */
export default function InterviewsPage() {
  return <InterviewsScreen />;
}
