import type { ReviewAudience } from "@/lib/api/performance";

const WORD: Record<ReviewAudience, string> = {
  SELF: "Person",
  MANAGER: "Manager",
  PEER: "Colleagues",
  REPORT: "Reports",
};

/** The order they read in, whatever order they were stored in. */
const ORDER: ReviewAudience[] = ["SELF", "MANAGER", "PEER", "REPORT"];

/**
 * Who a question is put to, as one short phrase: "Person and manager",
 * "Manager", "Colleagues", or "Everyone" when it is not narrowed.
 *
 * One function for the questions on a period's tab and in its editing dialog, so
 * the same audience is never two phrases.
 */
export function whoIsAsked(askedOf: readonly ReviewAudience[]): string {
  const words = ORDER.filter((one) => askedOf.includes(one)).map(
    (one) => WORD[one],
  );
  if (words.length === 0) return "Everyone";
  const [first, ...rest] = words;
  const lower = rest.map((word) => word.toLowerCase());
  const all = [first!, ...lower];
  return all.length === 1
    ? all[0]!
    : `${all.slice(0, -1).join(", ")} and ${all[all.length - 1]!}`;
}
