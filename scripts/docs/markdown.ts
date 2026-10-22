/**
 * Small markdown helpers shared by the inventory generators.
 *
 * Tables are written unpadded. Alignment is `prettier`'s job and the generator
 * runs it last, so the column widths are never this file's opinion — and a
 * regenerated table differs from the committed one only where a row differs,
 * not wherever a cell grew and re-padded its neighbours.
 */

/**
 * The anchor GitHub gives a heading: lowercase, everything that is not a
 * letter, digit, space, hyphen or underscore dropped, then each space a hyphen.
 * `## Design system — \`src/ui\`` is `#design-system--srcui` (the dash goes and
 * leaves both its spaces, which is why there are two hyphens).
 */
export function slug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

/** A table cell: a pipe would end the cell and a newline would end the row. */
export const escapeCell = (text: string): string =>
  text
    .replace(/\|/g, "\\|")
    .replace(/\s*\n\s*/g, " ")
    .trim();

/** `a`, `b`, `c` — or an em dash for none, which reads as "nothing here". */
export const names = (list: string[]): string =>
  list.length === 0 ? "—" : list.map((n) => `\`${n}\``).join(", ");

export type Align = "left" | "right";

export function table(
  header: string[],
  rows: string[][],
  align: Align[] = [],
): string {
  const rule = header.map((_, i) => (align[i] === "right" ? "---:" : "---"));
  const line = (cells: string[]) =>
    `| ${cells.map((c) => (c === "" ? "—" : escapeCell(c))).join(" | ")} |`;
  return [line(header), `| ${rule.join(" | ")} |`, ...rows.map(line)].join(
    "\n",
  );
}

/** `1 page`, `2 pages`. */
export const count = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

/**
 * `` `A`, `B` (class) · 2 const · 3 types `` — what a file declares that is
 * counted rather than listed, or an em dash for nothing. Both inventories of
 * exports end their rows with it, so the wording lives here once.
 */
export function alsoCell(s: {
  classes: string[];
  consts: number;
  types: number;
}): string {
  const parts: string[] = [];
  if (s.classes.length > 0) parts.push(`${names(s.classes)} (class)`);
  if (s.consts > 0) parts.push(`${s.consts} const`);
  if (s.types > 0) parts.push(`${s.types} ${s.types === 1 ? "type" : "types"}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}
