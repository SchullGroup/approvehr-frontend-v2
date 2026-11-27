import {
  SCORE_COMPONENT_ORDER,
  shareOfTotalBp,
  weightLabel,
  type ApiAppraiserContext,
  type ApiComponentScore,
  type ApiScoringWeights,
  type CycleWeights,
  type ScoreComponent,
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
> &
  Partial<Pick<ApiComponentScore, "done">>;

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
  part: Pick<Part, "component" | "evidenceCount"> & Partial<Pick<Part, "done">>,
): string {
  const n = part.evidenceCount;
  if (n === 0) return "Nothing recorded for this";
  if (part.component === "TASKS" && typeof part.done === "number") {
    const late = Math.max(n - part.done, 0);
    return `Tasks done: ${String(part.done)} of ${String(n)}${late > 0 ? ` (${String(late)} overdue)` : ""}`;
  }
  const unit =
    part.component === "OBJECTIVES"
      ? ["agreed objective", "agreed objectives"]
      : part.component === "TASKS"
        ? ["linked task", "linked tasks"]
        : part.component === "MANAGER_APPRAISAL"
          ? ["overall rating", "overall ratings"]
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
  const whose = mine ? "Your overall rating" : "This overall rating";
  const share = appraiser.markShareBp;

  if (share !== undefined && share > 0) {
    return shared
      ? `${whose} counts for ${weightLabel(appraiser.weightBp)} of what the appraisers say, ${alongside}. What they say is ${weightLabel(share)} of the score.`
      : `${whose} counts for ${weightLabel(share)} of the score.`;
  }
  if (share === 0 && asksMark) {
    return `${whose} does not count towards the score${shared ? `, ${alongside}` : ""}.`;
  }
  return shared
    ? `${mine ? "Your" : "This appraiser's"} share among the ${String(appraiser.appraiserCount)} appraisers is ${weightLabel(appraiser.weightBp)}.`
    : null;
}

/**
 * The one sentence about how weights become shares (UAT 23 Nov, L14 / PERF-39).
 *
 * How it works said the shares add up to 100%, the period page said the weights
 * do not have to, and Settings saved 110%. The owner chose one rule: the
 * weights add up to 100% everywhere, so a part's weight is its share of the
 * score. Every screen that explains a weight says it with this sentence.
 */
export const WEIGHTS_RULE =
  "A part's weight is its share of the score, so the weights add up to 100%.";

/* -------------------------------------------------------------------------- */
/* Whose weights a mark is made from                                          */
/* -------------------------------------------------------------------------- */

/**
 * Whose weights a period's mark is made from, in one line, or `null` where the
 * server does not say (an API older than per-period weights), because a line
 * about whose weights apply is a claim and none is made without an answer.
 *
 * One copy, said by the period's Settings tab, by its Get ready card and by the
 * Overview: the card used to say "The company's weights" over a period that had
 * set its own (F6), and the Overview listed the company's current weights over a
 * mark that was made from the period's (F44).
 */
export function periodWeightsLine(
  basis: CycleWeights["basis"] | undefined,
): string | null {
  switch (basis) {
    case "period":
      return "Set for this period.";
    case "company":
      return "Same as your company's weights.";
    case "frozen":
      return "Locked when this period started.";
    default:
      return null;
  }
}

export type ShownPart = {
  component: ScoreComponent;
  /** The company's name for the part, as Settings shows it. */
  label: string;
  /** Its weight over the total of the parts shown, in basis points. */
  shareBp: number;
};

/**
 * The parts a mark is made of and what each counts for, read off the weights it
 * is made from: the period's own when the server sent them, otherwise the
 * company's as they are today (`from` says which, so the screen can say so).
 *
 * Only parts that count are listed. A source the company has no part for, and a
 * part at 0%, are not how a mark is made, and listing "Weekly tasks 0%" over a
 * period that never had it was a part that no longer exists (F44).
 *
 * Shares are weight over total, so a set that does not add up to 100% (an older
 * period) still reads as what each part is worth. Names are the company's as
 * they are now: the period carries weights, not names.
 */
export function partsShown(
  company: ApiScoringWeights | null,
  period: CycleWeights | undefined,
): { from: "period" | "company"; parts: ShownPart[] } {
  const labelOf = (component: ScoreComponent) =>
    company?.rows.find((row) => row.component === component)?.label ??
    component;

  if (period) {
    const counted = SCORE_COMPONENT_ORDER.filter(
      (component) =>
        (period.parts === undefined || period.parts.includes(component)) &&
        (period.values[component] ?? 0) > 0,
    );
    const total = counted.reduce(
      (sum, component) => sum + (period.values[component] ?? 0),
      0,
    );
    return {
      from: "period",
      parts: counted.map((component) => ({
        component,
        label: labelOf(component),
        shareBp: shareOfTotalBp(period.values[component] ?? 0, total),
      })),
    };
  }

  const rows = (company?.rows ?? []).filter(
    (row) => row.isPart !== false && row.weightBp > 0,
  );
  const total = rows.reduce((sum, row) => sum + row.weightBp, 0);
  return {
    from: "company",
    parts: rows.map((row) => ({
      component: row.component,
      label: row.label,
      shareBp: shareOfTotalBp(row.weightBp, total),
    })),
  };
}
