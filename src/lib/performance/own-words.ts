import type { ApiReviewDetail } from "@/lib/api/performance";

/**
 * A self-review asks in the second person (UAT 23 Nov, L9 / PERF-28).
 *
 * One question set serves the self and the manager forms, and it is written
 * about the person: "Overall, how well did they deliver?". On the person's own
 * form that reads as if it were about somebody else, so the form turns the
 * pronouns round. Only the pronouns: "they" takes the same verb forms as "you"
 * ("they were", "you were"), so nothing else in the sentence has to change.
 * Saving is by question id, so the words shown are free to differ.
 */
const SWAPS: [RegExp, string][] = [
  [/\bthey're\b/gi, "you're"],
  [/\bthey've\b/gi, "you've"],
  [/\bthey'd\b/gi, "you'd"],
  [/\bthey'll\b/gi, "you'll"],
  [/\bthemselves\b/gi, "yourself"],
  [/\bthemself\b/gi, "yourself"],
  [/\btheirs\b/gi, "yours"],
  [/\btheir\b/gi, "your"],
  [/\bthey\b/gi, "you"],
  [/\bthem\b/gi, "you"],
];

/** Keeps a capital where the original had one: "They" becomes "You". */
function matchCase(found: string, swap: string): string {
  const first = found.charAt(0);
  return first === first.toUpperCase() && first !== first.toLowerCase()
    ? swap.charAt(0).toUpperCase() + swap.slice(1)
    : swap;
}

export function inSecondPerson(text: string): string {
  return SWAPS.reduce(
    (out, [pattern, swap]) =>
      out.replace(pattern, (found) => matchCase(found, swap)),
    text,
  );
}

/** The review as its own author reads it: a self-review's questions to "you". */
export function asOwnForm<
  T extends Pick<ApiReviewDetail, "kind" | "questions">,
>(review: T): T {
  if (review.kind !== "SELF") return review;
  return {
    ...review,
    questions: review.questions.map((question) => ({
      ...question,
      prompt: inSecondPerson(question.prompt),
    })),
  };
}
