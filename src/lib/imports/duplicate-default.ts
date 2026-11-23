/**
 * Whether a row that matched somebody already on file starts as "update" or
 * "leave them alone".
 *
 * A match on work email (or name and date of birth) says the row is about that
 * person. When the file's name for them is a different name, the match is far
 * more likely a copied email than the same person, and updating would rename
 * them and overwrite their job and pay. So a different name starts unticked and
 * the screen says so; a person can still tick it.
 */

/** The words of a name, lower case, accents and punctuation removed. */
function words(name: string | null): string[] {
  if (!name) return [];
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * True when the two names are the same person's name: the same words in any
 * order, or one with a middle name the other leaves out. A missing name agrees
 * with nothing.
 */
export function namesAgree(a: string | null, b: string | null): boolean {
  const left = words(a);
  const right = words(b);
  if (left.length === 0 || right.length === 0) return false;
  const [shorter, longer] =
    left.length <= right.length ? [left, right] : [right, left];
  const pool = new Set(longer);
  return shorter.every((word) => pool.has(word));
}

/** "update" when the names agree, "skip" otherwise. */
export function defaultDuplicateAction(
  fileName: string | null,
  recordName: string,
): "skip" | "update" {
  return namesAgree(fileName, recordName) ? "update" : "skip";
}
