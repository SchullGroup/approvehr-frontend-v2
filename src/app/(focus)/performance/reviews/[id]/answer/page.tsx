import type { Metadata } from "next";
import { ReviewFocus } from "./review-focus";

export const metadata: Metadata = {
  title: "Your review",
  description:
    "One question at a time. Your answers are saved as you go, so you can close this and come back.",
};

/**
 * Answering a review, one question to a page.
 *
 * `/performance/reviews/[id]` is the record of a rating, read by whoever is
 * entitled to read it. This is the form that produces it, and lives in its own
 * route group (`app/(focus)/`) so it can take the whole window. A review that
 * has already gone, or is not this person's to answer, is sent on to the record.
 *
 * No `generateStaticParams`, for the reason the record page gives: a review id
 * is a uuid nobody can enumerate at build time, and only the client knows
 * whether it is reading the API or the demo.
 */
export default async function AnswerReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReviewFocus reviewId={id} />;
}
