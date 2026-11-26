import { dayLabel, type ApiCycle } from "@/lib/api/performance";

/**
 * The small line under the open period on the Overview: how many questions and
 * forms it holds, and when answers are due.
 *
 * `questionCount` and `reviewCount` are the **whole company's**: every question
 * asked of anybody, every form written for anybody. An employee was shown them
 * as if they were their own ("10 questions, 18 forms") and then opened a self
 * review of six. So they are said only to somebody who sees the company, and
 * said as the company's. Everybody else gets the one thing that is theirs to
 * act on: the date.
 */
export function PeriodCounts({
  period,
  canSeeCompany,
}: {
  period: Pick<ApiCycle, "questionCount" | "reviewCount" | "dueDate">;
  canSeeCompany: boolean;
}) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-2 text-meta text-muted">
      {canSeeCompany && (
        <>
          <span>
            {period.questionCount === 1
              ? "1 question in all"
              : `${String(period.questionCount)} questions in all`}
          </span>
          <span>
            {period.reviewCount === 1
              ? "1 form across the company"
              : `${String(period.reviewCount)} forms across the company`}
          </span>
        </>
      )}
      {period.dueDate && <span>Answers due {dayLabel(period.dueDate)}</span>}
    </p>
  );
}
