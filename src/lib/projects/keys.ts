/**
 * Project keys, and the issue keys built from them.
 *
 * The rule is the API's: `^[A-Z][A-Z0-9]{1,5}$` — a letter, then one to five
 * letters or digits, upper case. A key never changes once a project exists,
 * because issue keys like `PAY-12` are pasted into chats and written on paper.
 */

export const KEY_PATTERN = /^[A-Z][A-Z0-9]{1,5}$/;

export function normaliseKey(raw: string): string {
  return raw
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 6);
}

export function isValidKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/**
 * Suggests a key from a project name, the way the design does: the first letter
 * of each word, up to four, with leading digits dropped; a one-word name falls
 * back to its first three letters.
 *
 * "Checkout Revamp" → CR, "Mobile app v3" → MAV3, "Payments" → PAY.
 */
export function suggestKey(name: string): string {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  const initials = words
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .replace(/^[0-9]+/, "")
    .slice(0, 4);
  if (initials.length >= 2) return initials;
  return name
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 3)
    .toUpperCase();
}

/** Why a key will not do, or null when it will. `taken` are the keys already in use. */
export function keyProblem(
  key: string,
  taken: readonly string[],
): string | null {
  if (!isValidKey(key)) {
    return "Use 2 to 6 letters or digits, starting with a letter.";
  }
  if (taken.includes(key)) return `Another project already uses ${key}.`;
  return null;
}

export function issueKey(projectKey: string, number: number): string {
  return `${projectKey}-${number}`;
}

/** `PAY-12` → `{ key: "PAY", number: 12 }`, or null when it is not an issue key. */
export function parseIssueKey(
  value: string,
): { key: string; number: number } | null {
  const match = /^([A-Z][A-Z0-9]{1,5})-(\d+)$/.exec(value.trim().toUpperCase());
  if (!match) return null;
  return { key: match[1]!, number: Number(match[2]) };
}
