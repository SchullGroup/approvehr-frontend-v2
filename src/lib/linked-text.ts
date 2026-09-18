/**
 * Where a link starts and stops inside a line somebody typed.
 *
 * ## Why this is apart from the component that renders it
 *
 * Same split as `lib/performance/review-language.ts` beside its own screens:
 * everything here is a decision about a string, the failure mode is a pattern
 * that quietly stops matching or starts matching too much, and neither is
 * visible to `tsc`, to lint, or to anybody reading the diff. Keeping it free of
 * React and of the `@/` alias is what lets `scripts/verify-linked-text.ts`
 * import and drive it rather than assert against a copy of it.
 *
 * ## What counts as a link
 *
 * `http://`, `https://`, and a bare `www.` host, which is how people write a
 * link when they are not copying one. Nothing else, and that is a **safety**
 * decision rather than a scope one: this reads text a colleague typed, and
 * autolinking whatever looks like a scheme is how `javascript:` ends up behind
 * something that reads as a URL. The scheme is checked twice — once by the
 * pattern and once by `URL` on the way to the `href` — because the second check
 * is the one that still holds the day somebody widens the first.
 *
 * ## Trailing punctuation belongs to the sentence
 *
 * `see https://example.com/report.` links `…/report`, not `…/report.`, and
 * `(https://example.com/a)` does not swallow the closing bracket — while
 * `https://en.wikipedia.org/wiki/Nigeria_(country)` keeps its own, because the
 * bracket was opened inside the link. Getting this wrong produces a link that
 * 404s for a reason invisible in the text being read.
 *
 * ## Deliberately not Markdown
 *
 * Nothing here interprets `*`, `#` or `[]()`. These fields are one line of
 * plain prose, the API stores exactly what was typed, and a renderer that
 * quietly ate an asterisk would be showing something other than the record.
 */

/**
 * A run that might be a link. Deliberately greedy — `trimUrl` decides where it
 * actually ends, because no single pattern gets both `…/report.` and
 * `…/Nigeria_(country)` right.
 */
const CANDIDATE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;

/** What a sentence puts after a link and never inside one. */
const TRAILING = new Set([".", ",", ";", ":", "!", "?", "'", '"', "…"]);

const BRACKETS: readonly (readonly [string, string])[] = [
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
];

const count = (text: string, character: string) =>
  text.split(character).length - 1;

/** Give the sentence back its punctuation. */
export function trimUrl(raw: string): string {
  let url = raw;
  for (;;) {
    const last = url.at(-1);
    if (last === undefined) return url;

    if (TRAILING.has(last)) {
      url = url.slice(0, -1);
      continue;
    }

    /* A closing bracket is part of the link only if something inside the link
       opened it. Unbalanced means the sentence wrapped the link in it. */
    const pair = BRACKETS.find(([, close]) => close === last);
    if (pair && count(url, pair[1]) > count(url, pair[0])) {
      url = url.slice(0, -1);
      continue;
    }

    return url;
  }
}

/**
 * The `href`, or null for anything that is not plainly a web address.
 *
 * Null rather than a sanitised guess: a run this cannot resolve stays on screen
 * as the text it is, which is honest, where a rewritten one would be a link to
 * somewhere the author did not write.
 */
export function hrefFor(url: string): string | null {
  const candidate = url.toLowerCase().startsWith("www.")
    ? `https://${url}`
    : url;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/** One run of the text: plain when `href` is null, a link when it is not. */
export type LinkPiece = { text: string; href: string | null };

/**
 * Split a line into runs, each either plain text or a link.
 *
 * The pieces always concatenate back to the input exactly. That is the property
 * worth holding on to: this renders somebody's own words, and a splitter that
 * can drop a character is a renderer that shows something other than what was
 * typed. `verify-linked-text.ts` asserts it on every case.
 */
export function splitLinks(text: string): LinkPiece[] {
  const pieces: LinkPiece[] = [];
  let cursor = 0;

  for (const match of text.matchAll(CANDIDATE)) {
    const start = match.index;
    /* A candidate inside a run already consumed — `trimUrl` never grows a
       match, so this cannot happen today. It is here because the day the
       pattern changes, overlapping matches would otherwise duplicate text. */
    if (start < cursor) continue;

    const url = trimUrl(match[0]);
    const href = hrefFor(url);

    /* Not a link after all — leave it in whatever plain run it lands in rather
       than cutting the text at it. */
    if (href === null) continue;

    if (start > cursor) {
      pieces.push({ text: text.slice(cursor, start), href: null });
    }
    pieces.push({ text: url, href });
    cursor = start + url.length;
  }

  if (cursor < text.length) {
    pieces.push({ text: text.slice(cursor), href: null });
  }
  return pieces;
}
