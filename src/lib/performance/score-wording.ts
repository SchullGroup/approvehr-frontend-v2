import { weightLabel, type ApiComponentScore } from "@/lib/api/performance";

/**
 * The sentences under each part of a mark, in words a person reading their own
 * result can check against the numbers beside them.
 *
 * Nothing here works out a mark or a weight. Every figure is the API's, read off
 * the part it belongs to; what this does is name which parts a weight went to and
 * which it came from, and call a count by what was counted.
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
        : ["rating", "ratings"];
  return `Based on ${String(n)} ${n === 1 ? unit[0] : unit[1]}`;
}
