/**
 * What filling in the appraisers did, in words.
 *
 * Two screens say it: the appraiser map, after "Fill in from the reporting line",
 * and the period screen, after Start. They are written once here so the same
 * result cannot read two ways, and pure so a test can read every sentence.
 *
 * ## What each sentence may claim
 *
 * The server decides who was given whom and how many forms it wrote. Nothing here
 * works either out: every name and count is one the response carried, and a field
 * the response did not carry (a server one deploy behind) makes no claim at all.
 * "Nobody was given their department head" and "this server does not say" are
 * different facts, and only the first is a sentence.
 *
 * No em dashes: these are on screen.
 */

/** Past this many, a list of names says how many more instead of running on. */
const MAX_NAMES = 6;

/**
 * "A", "A and B", "A, B and C", and past six "A, B, C, D, E, F and 4 more".
 *
 * Capped because the names sit in a line of text: a company that fills in two
 * hundred people at once would otherwise print a paragraph.
 */
export function nameList(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] ?? "";
  if (names.length <= MAX_NAMES) {
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] ?? ""}`;
  }
  return `${names.slice(0, MAX_NAMES).join(", ")} and ${String(names.length - MAX_NAMES)} more`;
}

/**
 * Who was given their department head, or `null` where nobody was or the server
 * did not say.
 *
 * It is a policy applied on the person's behalf, so it is said where somebody can
 * check it: the head becomes their line manager for the whole mark, and nobody
 * chose that for them.
 */
export function standInSentence(
  names: readonly string[] | undefined,
): string | null {
  if (!names || names.length === 0) return null;
  return `${nameList(names)} ${names.length === 1 ? "was" : "were"} given their department head as appraiser, because nobody is recorded as their manager.`;
}

/**
 * The people still without an appraiser, and why, or `null` when there are none.
 *
 * `serverKnowsHeads` is whether the response carried `viaDepartmentHead` at all.
 * A server that does not have the rule cannot say "no department head can stand
 * in", because for that server it is not true that one was looked for.
 */
export function stillWithoutSentence(
  names: readonly string[],
  serverKnowsHeads: boolean,
): string | null {
  if (names.length === 0) return null;
  return `Still nobody appraising ${nameList(names)}. ${
    serverKnowsHeads
      ? "Nobody is recorded as their manager and no department head can stand in."
      : "They have no manager either."
  } Assign somebody by hand.`;
}

/**
 * How many forms a press wrote, or `null` for none and for "not said".
 *
 * Only a count above zero is a sentence: 0 is the ordinary answer for a draft and
 * for a period whose managers already had everything, and saying it every time
 * would teach people to skip the line.
 */
export function formsWrittenSentence(count: number | undefined): string | null {
  if (typeof count !== "number" || count <= 0) return null;
  return `${String(count)} ${count === 1 ? "form" : "forms"} written for managers to answer.`;
}
