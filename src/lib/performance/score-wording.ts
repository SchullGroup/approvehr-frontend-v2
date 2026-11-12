import {
  weightLabel,
  type ApiAppraiserContext,
  type ApiComponentScore,
} from "@/lib/api/performance";

/**
 * The sentences under each part of a mark, in words a person reading their own
 * result can check against the numbers beside them.
 *
 * Nothing here works out a mark or a weight. Every figure is the API's, read off
 * the part it belongs to; what this does is name which parts a weight went to and
 * which it came from, and call a count by what was counted.
 *
 * ## Whether the appraisers' overall mark counts is read, never assumed
 *
 * It used to be reference only, always, and four screens said so. It is scored
 * only where a period weights the Manager appraisal part, so every sentence
 * about it is either the API's or true at every weight: `scoredFrom` reads the
 * part off the score it is about, and the strip reads the period's share off the
 * review.
 */

type Part = Pick<
  ApiComponentScore,
  | "component"
  | "label"
  | "weightBp"
  | "effectiveWeightBp"
  | "included"
  | "evidenceCount"
>;

/**
 * The parts that gave up a weight: left out of this mark although the company
 * gave them one.
 *
 * Not every part that is left out. One weighted at 0% never held any weight, so
 * it did not move anybody else's, and naming it as the reason for a change it did
 * not cause would be wrong.
 */
export function leftOutLabels(components: readonly Part[]): string[] {
  return components
    .filter((part) => !part.included && part.weightBp > 0)
    .map((part) => part.label);
}

/** "A", "A and B", "A, B and C". */
function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;
}

/**
 * Why the parts that count are counting for more than the company set, said once
 * and naming the parts the weight came from.
 *
 * It used to be said on every part: "Set at 40% by the company, counted at 50%
 * here because parts with nothing recorded were left out", four times in a row,
 * each time without saying which parts, and which parts is the thing a reader had
 * expected to count and was looking for. Said once above the list it can name
 * them, and the list underneath stays short.
 *
 * Null when nothing was left out, in which case every part counts for what the
 * company set and there is nothing to explain.
 */
export function leftOutNote(leftOut: readonly string[]): string | null {
  if (leftOut.length === 0) return null;
  const many = leftOut.length > 1;
  return `${listOf(leftOut)} ${many ? "were" : "was"} left out, so the other parts share ${many ? "their" : "its"} weight and count for more than the company set.`;
}

/**
 * What the company set, for a part that is counting for something else, so the
 * figure beside it has the one other figure it needs.
 *
 * Null where the part counts for what was set, which the badge beside it already
 * says, and for a part that is itself left out, whose reason is its own.
 */
export function setAtNote(part: Part): string | null {
  if (!part.included || part.effectiveWeightBp === part.weightBp) return null;
  return `Set at ${weightLabel(part.weightBp)} by the company.`;
}

/**
 * What was counted, by name. The API's count is of different things for
 * different parts, and "things" is none of them.
 */
export function evidenceLine(
  part: Pick<Part, "component" | "evidenceCount">,
): string {
  const n = part.evidenceCount;
  if (n === 0) return "Nothing recorded for this";
  const unit =
    part.component === "OBJECTIVES"
      ? ["agreed objective", "agreed objectives"]
      : part.component === "TASKS"
        ? ["graded task", "graded tasks"]
        : part.component === "MANAGER_APPRAISAL"
          ? ["overall mark", "overall marks"]
          : ["rating", "ratings"];
  return `Based on ${String(n)} ${n === 1 ? unit[0] : unit[1]}`;
}

/**
 * What the appraisers' overall mark is scored as, by the company's own name for
 * the part, or **null where it is not scored**.
 *
 * Read off the Manager appraisal part of the score the mark belongs to: present
 * and weighted is scored. Absent (a server that predates the part) and weighted
 * at nothing are both "not scored", which is true of both, so the caller says
 * "for reference" there in the words it always used.
 */
export function scoredFrom(
  components: readonly Pick<
    ApiComponentScore,
    "component" | "label" | "weightBp"
  >[],
): string | null {
  const part = components.find((one) => one.component === "MANAGER_APPRAISAL");
  return part && part.weightBp > 0 ? part.label : null;
}

/**
 * "It is what Manager appraisal is scored from.", or null where the mark is not
 * scored. One sentence for every screen that sits a figure beside the part it
 * feeds, so the figure and the claim beside it cannot disagree.
 */
export function scoredFromSentence(
  components: readonly Pick<
    ApiComponentScore,
    "component" | "label" | "weightBp"
  >[],
): string | null {
  const part = scoredFrom(components);
  return part === null ? null : `It is what ${part} is scored from.`;
}

/**
 * The sentence under the appraisers' overall rating on one person's score.
 *
 * Where the part is scored it points at the part, which carries the weight and
 * says what was counted; where it is not it says it is for reference, as it
 * always said.
 */
export function appraiserMarkHint(
  mark: { appraisers: number; submittedWeightBp: number },
  components: readonly Pick<
    ApiComponentScore,
    "component" | "label" | "weightBp"
  >[],
): string {
  const scored = scoredFromSentence(components);
  if (mark.appraisers <= 1) {
    return scored ?? "For reference. It does not count towards the score.";
  }
  return `${weightLabel(mark.submittedWeightBp)} of the weight is in, across ${String(mark.appraisers)} appraisers. ${scored ?? "For reference; it does not count towards the score."}`;
}

/**
 * The one line the strip above an appraiser's form says about their overall mark,
 * or null when there is nothing true to say.
 *
 * It follows the period's share (`markShareBp`), because whether the mark counts
 * is the period's decision and this screen cannot know it any other way:
 *
 * - **Above 0**: it counts, and for how much. With several appraisers their own
 *   share is of what the appraisers say, and the part's share of the mark is said
 *   beside it, so nobody has to multiply.
 * - **0, and the form asks for a mark**: it is shown beside the score and does not
 *   count.
 * - **0 without a mark asked for, and absent**: no claim about the mark at all.
 *   Absent is a server that predates the part, which is not a server saying it
 *   does not count. Only the share among several appraisers is said, because that
 *   is true on both.
 */
export function appraiserStripLine(args: {
  appraiser: Pick<
    ApiAppraiserContext,
    "weightBp" | "appraiserCount" | "markShareBp"
  >;
  /** Whether the reader wrote it. Only changes "Your" to "This". */
  mine: boolean;
  /** Whether the form asks for an overall mark at all (`ApiReviewDetail.overallMark`). */
  asksMark: boolean;
}): string | null {
  const { appraiser, mine, asksMark } = args;
  const others = appraiser.appraiserCount - 1;
  const shared = others > 0;
  const alongside = `alongside ${String(others)} ${others === 1 ? "other" : "others"}`;
  const whose = mine ? "Your overall mark" : "This overall mark";
  const share = appraiser.markShareBp;

  if (share !== undefined && share > 0) {
    return shared
      ? `${whose} counts for ${weightLabel(appraiser.weightBp)} of what the appraisers say, ${alongside}. What they say is ${weightLabel(share)} of the mark.`
      : `${whose} counts for ${weightLabel(share)} of the mark.`;
  }
  if (share === 0 && asksMark) {
    return `${whose} does not count towards the score${shared ? `, ${alongside}` : ""}.`;
  }
  return shared
    ? `${mine ? "Your" : "This appraiser's"} share among the ${String(appraiser.appraiserCount)} appraisers is ${weightLabel(appraiser.weightBp)}.`
    : null;
}
