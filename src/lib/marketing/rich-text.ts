/**
 * A job description written with a little formatting, read back safely.
 *
 * ## Why this does not trust the API's sanitiser, and does not use `innerHTML`
 *
 * The API sends the advert as HTML it has already cleaned. That is the contract,
 * and this still does not hand the string to the browser. It **parses** it into a
 * small tree, keeps only a short list of tags (no attributes except a validated
 * link address), and the page draws the tree as React elements. There is no
 * `dangerouslySetInnerHTML` for a description, so a hole in somebody's sanitiser,
 * today or after the next refactor, has nothing to flow into: a `<script>`, an
 * `onerror=`, a `javascript:` link and an `<iframe>` are all dropped here whatever
 * the API said.
 *
 * Text is never concatenated into markup. It is carried as text and React escapes
 * it on the way out; the one place a string of HTML is built — `serialiseRichText`,
 * for the search-engine data — rebuilds every tag from scratch and escapes every
 * piece of text.
 *
 * Deliberately a tokenizer, not a regular expression over the whole document: the
 * scan walks the string once, understands quoted attribute values (a `>` inside
 * `title="a > b"` does not end the tag), skips comments, and drops the *contents*
 * of `script`, `style` and similar rather than leaking their text onto the page.
 */

export type RichNode =
  | { type: "text"; text: string }
  | { type: "el"; tag: RichTag; href?: string; children: RichNode[] };

export type RichTag =
  | "p"
  | "br"
  | "strong"
  | "em"
  | "u"
  | "ul"
  | "ol"
  | "li"
  | "h2"
  | "h3"
  | "h4"
  | "blockquote"
  | "a";

/** The tag an input tag becomes, or `null` to drop the tag and keep its text. */
const TAG_MAP: Record<string, RichTag | null> = {
  p: "p",
  div: "p",
  br: "br",
  strong: "strong",
  b: "strong",
  em: "em",
  i: "em",
  u: "u",
  ul: "ul",
  ol: "ol",
  li: "li",
  /* The page already has its one h1. A description's own top heading is a
     section heading on this page, and nothing here goes deeper than h4. */
  h1: "h2",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h4",
  h6: "h4",
  blockquote: "blockquote",
  a: "a",
};

/** Whose contents are never text a reader should see. */
const DROP_WITH_CONTENT = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "template",
  "noscript",
  "svg",
  "math",
  "head",
  "title",
  "textarea",
  "select",
  "form",
]);

const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "wbr"]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  bull: "•",
  middot: "·",
  pound: "£",
  euro: "€",
};

/** The handful of entities that matter, decoded to the characters they stand for. */
export function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (whole, body: string) => {
      if (body.startsWith("#")) {
        const code =
          body[1] === "x" || body[1] === "X"
            ? Number.parseInt(body.slice(2), 16)
            : Number.parseInt(body.slice(1), 10);
        if (
          !Number.isFinite(code) ||
          code <= 0 ||
          code > 0x10ffff ||
          (code >= 0xd800 && code <= 0xdfff)
        )
          return "";
        return String.fromCodePoint(code);
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
    },
  );
}

/**
 * A link a reader may follow from a job advert: `https`, `http` or `mailto`.
 * Everything else — `javascript:`, `data:`, `vbscript:`, a bare path — is not a
 * link here. Whitespace and control characters, which browsers strip from a
 * scheme before reading it, are refused outright rather than normalised.
 */
export function safeHref(value: string): string | null {
  const trimmed = value.trim();
  if (/[\u0000-\u001f\u007f\s]/.test(trimmed)) return null;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

type RawTag = {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  attrs: Map<string, string>;
  /** Index just past the `>`. */
  end: number;
};

/** Read one tag starting at `start`, which is a `<`. `null` if it is not a tag. */
function readTag(source: string, start: number): RawTag | null {
  let index = start + 1;
  let closing = false;
  if (source[index] === "/") {
    closing = true;
    index += 1;
  }
  const nameStart = index;
  while (index < source.length && /[a-zA-Z0-9]/.test(source[index] ?? ""))
    index += 1;
  const name = source.slice(nameStart, index).toLowerCase();
  if (name === "" || !/^[a-z]/.test(name)) return null;

  const attrs = new Map<string, string>();
  let selfClosing = false;

  while (index < source.length) {
    const char = source[index] ?? "";
    if (char === ">") {
      return { name, closing, selfClosing, attrs, end: index + 1 };
    }
    if (char === "/" && source[index + 1] === ">") {
      selfClosing = true;
      index += 1;
      continue;
    }
    if (/\s|\//.test(char)) {
      index += 1;
      continue;
    }
    const attrStart = index;
    while (index < source.length && !/[\s=>/]/.test(source[index] ?? ""))
      index += 1;
    const attr = source.slice(attrStart, index).toLowerCase();
    while (/\s/.test(source[index] ?? "")) index += 1;
    let value = "";
    if (source[index] === "=") {
      index += 1;
      while (/\s/.test(source[index] ?? "")) index += 1;
      const quote = source[index];
      if (quote === '"' || quote === "'") {
        index += 1;
        const valueStart = index;
        while (index < source.length && source[index] !== quote) index += 1;
        value = source.slice(valueStart, index);
        index += 1;
      } else {
        const valueStart = index;
        while (index < source.length && !/[\s>]/.test(source[index] ?? ""))
          index += 1;
        value = source.slice(valueStart, index);
      }
    }
    if (attr !== "") attrs.set(attr, decodeEntities(value));
  }
  /* Ran off the end with no `>`: not a tag, a stray `<`. */
  return null;
}

/** Open elements the parser is inside, innermost last. */
type Frame = { tag: RichTag | null; href?: string; children: RichNode[] };

/** Cap on how much one advert may nest or hold, so a hostile string stays cheap. */
const MAX_DEPTH = 24;
const MAX_NODES = 20_000;

/**
 * Parse HTML into the tree above. Anything that is not on the list is dropped but
 * its text is kept, except for the tags whose content is never text.
 */
export function parseRichText(html: string): RichNode[] {
  const root: Frame = { tag: null, children: [] };
  const stack: Frame[] = [root];
  let nodes = 0;
  let index = 0;

  const top = () => stack[stack.length - 1] as Frame;

  const pushText = (raw: string) => {
    if (raw === "" || nodes >= MAX_NODES) return;
    const text = decodeEntities(raw);
    if (text === "") return;
    top().children.push({ type: "text", text });
    nodes += 1;
  };

  const closeTo = (tag: RichTag) => {
    for (let depth = stack.length - 1; depth > 0; depth -= 1) {
      if (stack[depth]?.tag === tag) {
        stack.length = depth;
        return;
      }
    }
  };

  const append = (node: RichNode) => {
    top().children.push(node);
    nodes += 1;
  };

  while (index < html.length && nodes < MAX_NODES) {
    const lt = html.indexOf("<", index);
    if (lt === -1) {
      pushText(html.slice(index));
      break;
    }
    pushText(html.slice(index, lt));

    if (html.startsWith("<!--", lt)) {
      const endComment = html.indexOf("-->", lt + 4);
      index = endComment === -1 ? html.length : endComment + 3;
      continue;
    }
    if (html[lt + 1] === "!" || html[lt + 1] === "?") {
      const gt = html.indexOf(">", lt);
      index = gt === -1 ? html.length : gt + 1;
      continue;
    }

    const tag = readTag(html, lt);
    if (!tag) {
      pushText("<");
      index = lt + 1;
      continue;
    }
    index = tag.end;

    if (DROP_WITH_CONTENT.has(tag.name)) {
      if (!tag.closing && !tag.selfClosing) {
        const closeRe = new RegExp(`</${tag.name}\\s*>`, "i");
        const rest = html.slice(index);
        const found = closeRe.exec(rest);
        index = found ? index + found.index + found[0].length : html.length;
      }
      continue;
    }

    const mapped = TAG_MAP[tag.name] ?? null;
    if (mapped === null) continue;

    if (tag.closing) {
      if (mapped !== "br") closeTo(mapped);
      continue;
    }

    if (mapped === "br") {
      append({ type: "el", tag: "br", children: [] });
      continue;
    }

    if (stack.length >= MAX_DEPTH) continue;

    /* A new block closes an open paragraph; a new item closes an open item.
       HTML does this implicitly, and an advert pasted from a word processor
       relies on it. */
    const isBlock =
      mapped === "p" ||
      mapped === "ul" ||
      mapped === "ol" ||
      mapped === "h2" ||
      mapped === "h3" ||
      mapped === "h4" ||
      mapped === "blockquote";
    if (isBlock && top().tag === "p") stack.length -= 1;
    if (mapped === "li" && top().tag === "li") stack.length -= 1;

    /* An item outside a list is just a paragraph. */
    const inList = stack.some(
      (frame) => frame.tag === "ul" || frame.tag === "ol",
    );
    const finalTag: RichTag = mapped === "li" && !inList ? "p" : mapped;

    let href: string | undefined;
    if (finalTag === "a") {
      const safe = safeHref(tag.attrs.get("href") ?? "");
      if (safe === null) {
        /* No usable address: keep the words, lose the link. */
        continue;
      }
      href = safe;
    }

    const frame: Frame = {
      tag: finalTag,
      ...(href ? { href } : {}),
      children: [],
    };
    const node: RichNode = {
      type: "el",
      tag: finalTag,
      ...(href ? { href } : {}),
      children: frame.children,
    };
    append(node);

    if (!tag.selfClosing && !VOID.has(tag.name)) stack.push(frame);
  }

  return root.children;
}

/* ------------------------------------------------------------- serialisation */

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** The tree as HTML, every tag rebuilt and every piece of text escaped. */
export function serialiseRichText(nodes: readonly RichNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") return escapeHtml(node.text);
      if (node.tag === "br") return "<br>";
      const inner = serialiseRichText(node.children);
      if (node.tag === "a")
        return `<a href="${escapeHtml(node.href ?? "")}">${inner}</a>`;
      return `<${node.tag}>${inner}</${node.tag}>`;
    })
    .join("");
}

/** Cleaned HTML for search-engine data. Same rules as the page itself. */
export function cleanHtml(html: string): string {
  return serialiseRichText(parseRichText(html));
}

/** The words only, for a description a crawler or a preview reads as text. */
export function richTextToPlain(html: string): string {
  const out: string[] = [];
  const walk = (nodes: readonly RichNode[]) => {
    for (const node of nodes) {
      if (node.type === "text") {
        out.push(node.text);
        continue;
      }
      if (node.tag === "br") {
        out.push("\n");
        continue;
      }
      const block =
        node.tag === "p" ||
        node.tag === "li" ||
        node.tag === "h2" ||
        node.tag === "h3" ||
        node.tag === "h4" ||
        node.tag === "blockquote";
      if (block && out.length > 0 && out[out.length - 1] !== "\n")
        out.push("\n");
      if (node.tag === "li") out.push("- ");
      walk(node.children);
      if (block) out.push("\n");
    }
  };
  walk(parseRichText(html));
  return out
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ------------------------------------------------------------- plain to rich */

/**
 * An advert typed as plain text, as the HTML the page would draw for it.
 *
 * The API does the same for an advert that has no rich version, and the preview
 * does it here so a draft looks to its writer as it will to a reader: a blank line
 * starts a paragraph, a line that begins `- ` or `* ` is a bullet, and nothing
 * else is interpreted. Every character of text is escaped; the only markup in the
 * result is the five tags this function writes itself.
 */
export function plainToRichText(plain: string): string {
  const escape = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const blocks = plain
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block !== "");

  return blocks
    .map((block) => {
      const lines = block.split("\n");
      const bullets = lines.filter((line) => /^\s*[-*]\s+/.test(line));
      if (bullets.length > 0 && bullets.length === lines.length) {
        return `<ul>${lines
          .map((line) => `<li>${escape(line.replace(/^\s*[-*]\s+/, ""))}</li>`)
          .join("")}</ul>`;
      }
      /* A paragraph that opens with a lead-in line and then bullets, as the
         requisition wizard writes ("What you need:" then a list). */
      const firstBullet = lines.findIndex((line) => /^\s*[-*]\s+/.test(line));
      if (
        firstBullet > 0 &&
        lines.slice(firstBullet).every((line) => /^\s*[-*]\s+/.test(line))
      ) {
        return `<p>${lines.slice(0, firstBullet).map(escape).join("<br>")}</p><ul>${lines
          .slice(firstBullet)
          .map((line) => `<li>${escape(line.replace(/^\s*[-*]\s+/, ""))}</li>`)
          .join("")}</ul>`;
      }
      return `<p>${lines.map(escape).join("<br>")}</p>`;
    })
    .join("");
}
