/**
 * @mentions in comments.
 *
 * What a person types is `@Ada Okafor`; what is stored is `<@employeeId>`, so a
 * rename never orphans a mention and the API can notify the right person. The
 * picker records which name stands for which id as it inserts them, and `encode`
 * swaps them on posting, longest name first so "@Ada Okafor" wins over "@Ada".
 */

/** An id is a uuid or a seed id like `p-01`; the same characters the API accepts. */
const ID = "[A-Za-z0-9_\\-:.+~@]+";

export type BodySegment =
  { kind: "text"; text: string } | { kind: "mention"; employeeId: string };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `@name` → `<@id>` for every name the picker inserted. */
export function encodeMentions(
  text: string,
  mentions: Readonly<Record<string, string>>,
): string {
  let out = text;
  const names = Object.keys(mentions).sort((a, b) => b.length - a.length);
  for (const name of names) {
    const pattern = new RegExp(`@${escapeRe(name)}(?![\\p{L}\\p{N}_])`, "gu");
    out = out.replace(pattern, `<@${mentions[name]}>`);
  }
  return out;
}

/** The ids mentioned in a stored body, once each, in order. */
export function mentionedIds(body: string): string[] {
  const ids: string[] = [];
  for (const match of body.matchAll(new RegExp(`<@(${ID})>`, "g"))) {
    if (!ids.includes(match[1]!)) ids.push(match[1]!);
  }
  return ids;
}

/** A stored body as text and mentions, for rendering without `dangerouslySetInnerHTML`. */
export function bodySegments(body: string): BodySegment[] {
  const out: BodySegment[] = [];
  let last = 0;
  for (const match of body.matchAll(new RegExp(`<@(${ID})>`, "g"))) {
    const at = match.index ?? 0;
    if (at > last) out.push({ kind: "text", text: body.slice(last, at) });
    out.push({ kind: "mention", employeeId: match[1]! });
    last = at + match[0].length;
  }
  if (last < body.length) out.push({ kind: "text", text: body.slice(last) });
  return out;
}

/**
 * The `@query` being typed at the caret, if there is one: an `@` that starts the
 * text or follows whitespace, then up to 24 characters with no space. Returns
 * where the `@` is and what follows it.
 */
export function mentionQueryAt(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = /(^|\s)@([^\s@]{0,24})$/.exec(before);
  if (!match) return null;
  const query = match[2]!;
  return { start: caret - query.length - 1, query };
}
