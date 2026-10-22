/**
 * The few bits of Markdown a help article actually uses, and nothing else.
 *
 * ## Why a subset, and why it is not `lib/linked-text.ts`
 *
 * `lib/linked-text.ts` says in so many words that it is **not** Markdown, and
 * that is right for what it renders: a line a colleague typed into a task, where
 * a renderer that quietly ate an asterisk would be showing something other than
 * the record. An article is the opposite case. It is **written** to be read, its
 * authors write `**Gross**` to emphasise a word, and the help centre showed the
 * asterisks to every employee who opened one.
 *
 * So there is exactly one place that reads this syntax — here — and it reads only
 * what it can read safely:
 *
 * - `**bold**`
 * - `*italic*` and `_italic_`
 * - a paragraph is a run of lines between blank lines
 * - a run of lines starting `- ` or `* ` is a bulleted list, and `1. ` a numbered
 *   one
 *
 * No headings, no tables, no code, no raw HTML, and no links of its own — a URL in
 * the text is made clickable by `LinkedText`, which is where that decision lives.
 * Everything that is not recognised is left exactly as typed, which is the safe
 * direction to be wrong in: an unmatched `**` is shown, not guessed at. Nothing
 * here produces markup; the renderer turns these into React elements, so there is
 * no HTML to escape and none to inject.
 */

export type Span = { text: string; bold: boolean; italic: boolean };

export type Block =
  | { kind: "paragraph"; spans: Span[] }
  | { kind: "list"; ordered: boolean; items: Span[][] };

/**
 * `**bold**`, `*italic*`, `_italic_`, in that order of precedence.
 *
 * Emphasis may not start or end on a space (`2 * 3 * 4` is arithmetic, not
 * italics) and `_` may not sit inside a word (`snake_case_name` is a name).
 * Neither crosses a line break.
 */
const INLINE =
  /\*\*(?=\S)([^\n]*?\S)\*\*|(?<![\w*])\*(?=[^\s*])([^\n*]*?[^\s*])\*(?![\w*])|(?<![\w])_(?=[^\s_])([^\n_]*?[^\s_])_(?![\w])/g;

export function spansOf(text: string): Span[] {
  const spans: Span[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) {
      spans.push({ text: text.slice(last, at), bold: false, italic: false });
    }
    if (match[1] !== undefined) {
      /* Bold may itself carry italics: `**a *b* c**`. One level is enough. */
      for (const inner of spansOf(match[1])) {
        spans.push({ ...inner, bold: true });
      }
    } else {
      spans.push({
        text: match[2] ?? match[3] ?? "",
        bold: false,
        italic: true,
      });
    }
    last = at + match[0].length;
  }
  if (last < text.length) {
    spans.push({ text: text.slice(last), bold: false, italic: false });
  }
  return spans.length > 0 ? spans : [{ text, bold: false, italic: false }];
}

const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

/** Paragraphs and lists, in order. Blank-line separated, as the editor writes them. */
export function blocksOf(body: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of body.split(/\n\s*\n/)) {
    const lines = chunk
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0);
    if (lines.length === 0) continue;

    const bullets = lines.map((line) => BULLET.exec(line));
    const numbers = lines.map((line) => NUMBERED.exec(line));
    if (bullets.every(Boolean)) {
      blocks.push({
        kind: "list",
        ordered: false,
        items: bullets.map((m) => spansOf(m![1] ?? "")),
      });
    } else if (numbers.every(Boolean)) {
      blocks.push({
        kind: "list",
        ordered: true,
        items: numbers.map((m) => spansOf(m![1] ?? "")),
      });
    } else {
      /* A soft-wrapped paragraph reads as one. */
      blocks.push({
        kind: "paragraph",
        spans: spansOf(lines.map((line) => line.trim()).join(" ")),
      });
    }
  }
  return blocks;
}

/**
 * The same text with the emphasis markers taken out, for the places that show a
 * line of an article rather than the article — a list card's excerpt, which the
 * API cuts at a fixed length and which can therefore end halfway through a pair.
 */
export function plainText(text: string): string {
  return spansOf(text)
    .map((span) => span.text)
    .join("")
    .replace(/\*\*/g, "")
    .replace(/(^|\s)[*_](?=\S)/g, "$1");
}
