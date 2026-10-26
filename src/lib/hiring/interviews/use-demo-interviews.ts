"use client";

import { useMemo } from "react";
import { DEMO_NOW } from "@/lib/hiring/pipeline/demo-ops";
import { useDemoBook } from "@/lib/hiring/pipeline/demo-store";
import { demoRoster } from "./demo-gateway";
import { interviewsOf, viewOf } from "./demo-ops";
import { useDemoInterviews } from "./demo-store";
import type { InterviewView } from "./model";

/**
 * One application's interviews in the practice book, as the screens draw them.
 *
 * Re-made when the interview book changes (a booking, a move, a cancellation) and when
 * the pipeline book does (a scorecard handed in), and not otherwise, so the card's
 * array is the same array until something real changed.
 */
export function useDemoInterviewViews(applicationId: string): InterviewView[] {
  const book = useDemoInterviews();
  const pipeline = useDemoBook();
  return useMemo(() => {
    void pipeline;
    const roster = demoRoster();
    const plan = { settings: book.reminderSettings, now: DEMO_NOW };
    return interviewsOf(book, applicationId).map((interview) =>
      viewOf(interview, roster, plan),
    );
  }, [book, pipeline, applicationId]);
}
