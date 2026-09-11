/**
 * The prepared assistant answers for the standalone public demo deployment.
 *
 * ## Every fact here is real — checked against `lib/mock/people.ts` and
 * `lib/mock/workflows.ts` by hand, not generated
 *
 * This is what keeps a *scripted* answer from being the fabrication
 * `lib/store/ai.ts` refuses to ship: the sentence is prepared, the fact inside
 * it is not invented. If the underlying seed ever changes — a name, a leave
 * request, who is missing a bank account — these answers have to be
 * re-checked by hand before the next deploy. A scripted answer that disagrees
 * with what the Employees directory shows a click later is worse than no
 * scripted answer; see `SALES_SCRIPT_ENABLED`'s own header.
 *
 * `used` names match the real API's own read names (`headcount`,
 * `find_people`, `leave_requests`, `review_periods` — see
 * `approvehr-api/src/modules/ai/reads.ts`), so "Read from:" reads identically
 * to a live answer.
 */

export type ScriptedAnswer = {
  /** Exact button text — what a rep clicks. */
  question: string;
  /** The reply, word for word. */
  answer: string;
  /** Matches a real read name. Empty when the answer is about the assistant
   *  itself rather than a lookup. */
  used: string[];
  /** Loose terms for matching a *typed* question, not just a clicked button. */
  keywords: string[];
};

export const SCRIPTED_ANSWERS: ScriptedAnswer[] = SALES_SCRIPT_ENABLED
  ? [
      {
        question: "How many people have no bank account?",
        answer:
          "One person — Grace Effiong, your Payroll Analyst — has no bank account on file. Payroll can't pay her until it's added; everyone else is clear.",
        used: ["headcount"],
        keywords: ["bank account", "no bank"],
      },
      {
        question: "Whose leave requests are still waiting?",
        answer:
          "Three requests are still waiting on a decision: Ngozi Eze's 5-day annual leave (requested 12 Aug), Chidi Nwosu's 2-day annual leave (requested 17 Aug), and Adaeze Okonkwo's 10-day annual leave (requested 14 Aug).",
        used: ["leave_requests"],
        keywords: ["leave", "waiting", "pending", "time off"],
      },
      {
        question: "Is anyone missing something before payday?",
        answer:
          "Three people have a gap this payroll will flag: Grace Effiong has no bank account, Musa Ibrahim has no TIN on file, and Emeka Anyanwu has no pension PIN yet. That doesn't hold up anybody else — it just holds those three back until it's fixed.",
        used: ["headcount", "find_people"],
        keywords: [
          "missing",
          "payday",
          "before payroll",
          "ready for payroll",
          "gap",
        ],
      },
      {
        question: "How's the H2 2026 review going?",
        answer:
          "The H2 2026 review is at the manager stage, due 24 August. 7 of 10 manager reviews are in — 3 people are still waiting on theirs.",
        used: ["review_periods"],
        keywords: ["review", "h2", "appraisal", "performance cycle"],
      },
      {
        question: "What can you do for me?",
        answer:
          "I can answer questions about your people, payroll, leave and reviews — I only read what's already in your records. If there's ever a change to make, I'll describe it and wait for you to press Confirm. I never act on my own.",
        used: [],
        keywords: ["what can you do", "help", "capabilities", "what do you do"],
      },
    ]
  : [];

/**
 * Finds a prepared answer for a question, exact-match first (every button
 * click), then a loose keyword match for something typed by hand. Returns
 * `null` rather than guessing, so the caller can fall back to
 * `scriptedFallback()` in `lib/sales-script.ts` honestly instead of forcing a
 * match that isn't there.
 */
export function findScriptedAnswer(question: string): ScriptedAnswer | null {
  const normalized = question.trim().toLowerCase();
  if (normalized.length === 0) return null;

  const exact = SCRIPTED_ANSWERS.find(
    (candidate) => candidate.question.toLowerCase() === normalized,
  );
  if (exact) return exact;

  return (
    SCRIPTED_ANSWERS.find((candidate) =>
      candidate.keywords.some((keyword) => normalized.includes(keyword)),
    ) ?? null
  );
}
