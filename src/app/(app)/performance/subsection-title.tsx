import { Lock } from "lucide-react";
import { Badge } from "@/components/ui";
import type { AnswerKind } from "@/lib/api/performance";
import { KIND_BADGE } from "@/lib/performance/answer-kind";
import { lockedMark } from "@/lib/performance/new-version";

/**
 * The word in front of a subsection's name that says how it is answered: **Rated**
 * (a level), **Yes or no**, **Pick one** or **Written** (in their own words).
 *
 * In front and not after the name, so two subsections that read alike (a company
 * that has two "Teamwork"s, one a level and one a yes or no) are told apart before
 * anybody reads the name to the end. A fixed width, so the names start in one
 * column and a list of them scans down instead of stepping with the length of the
 * word.
 *
 * Every row carries it, level or not, unlike the Subsection picker in the question
 * form, which tags only the exceptions: a dropdown is read one option at a time
 * and a tag on every option says the same thing down the whole list, while a row is
 * the place somebody comes to see how each one is answered.
 */
export function KindTag({ kind }: { kind: AnswerKind }) {
  return (
    <Badge tone="neutral" size="sm" className="min-w-[4.5rem]">
      {KIND_BADGE[kind]}
    </Badge>
  );
}

/**
 * A small grey lock directly after the name of a subsection whose answer type is
 * fixed, which is any subsection with a rating on it.
 *
 * Not a button, and not `AttentionMark`: it sits inside the row's toggle, and a
 * button inside a button is invalid HTML. So it is a picture with the reason as its
 * hover and as the words a screen reader hears in place of it. The whole reason,
 * and what to do about it, is on the page above the control it explains, which is
 * where a consequence belongs. Nothing is drawn for a subsection with no ratings.
 */
export function LockMark({ ratingCount }: { ratingCount: number }) {
  if (ratingCount <= 0) return null;
  const reason = lockedMark(ratingCount);
  return (
    <span title={reason} className="inline-flex shrink-0 text-muted">
      <Lock aria-hidden="true" className="size-3.5" />
      <span className="sr-only">{reason}</span>
    </span>
  );
}
