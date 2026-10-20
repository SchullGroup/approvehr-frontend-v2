import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Two fields side by side on a phone are a decision, and the decision has a
 * component.
 *
 * "Ask for a correction" ran off the right edge of an iPhone because somebody
 * wrote `grid grid-cols-2` around two time inputs. On a laptop a hand-written
 * grid is fine; on a 375px phone every cell has to be allowed to shrink, and a
 * native date or time control will not unless the row says so — see
 * `components/ui/field.tsx#FieldRow` and `globals.css` for the mechanism and
 * the measurement.
 *
 * This reads the source rather than rendering because the failure is a
 * *shape* that appears in a diff — an unprefixed `grid-cols-N` with a form
 * control inside it — and jsdom cannot lay anything out to catch it. Rows that
 * are one column on a phone (`sm:grid-cols-2`, `md:…`) are fine and ignored:
 * they cannot be too narrow. Only a column count that applies from the very
 * first pixel is flagged.
 *
 * ## What to do when it fails
 *
 * Use `<FieldRow>`. It is one column on a phone and two from `sm` up; add
 * `phone="pair"` only for short controls (two names, two clock times) that fit
 * half a 320px sheet. If the row is genuinely something else — a table-shaped
 * editor whose cells are all `min-w-0` — add it to `ALLOWED` below with the
 * reason, so the next reader can tell a decision from an accident.
 */

const SRC = path.resolve(import.meta.dirname, "../src");

/** Folders this does not police: the marketing site is its own world, and the
    design-system page is a specimen sheet, not a screen. */
const SKIP = [
  `${path.sep}(marketing)${path.sep}`,
  `${path.sep}components${path.sep}marketing${path.sep}`,
  `${path.sep}design-system${path.sep}`,
];

/**
 * Rows that keep a fixed column count on a phone on purpose.
 *
 * Keyed by path under `src/`, with the reason. A file is allowed as a whole:
 * if it grows a second such row, this is the place that has to be read again.
 */
const ALLOWED: Record<string, string> = {
  "app/(app)/projects/[id]/workflow-editor.tsx":
    "A table-shaped editor. Two tracks, `minmax(0,1fr)` and `auto`: the name " +
    "input spans both, the select and the WIP limit drop to a row of their " +
    "own, and every cell is a shared `Input`/`Select` that is `min-w-0`. " +
    "Checked at 320px.",
  "app/(app)/performance/appraiser-map.tsx":
    "Two tracks, `minmax(0,1fr)` and `auto`, until `md` and three from there: " +
    "the person's details take the first, the mark the second, and the assign " +
    "select with its button sits in a cell that spans both and drops to a row " +
    "of its own. The select's width is on a `min-w-0` wrapper because `Select` " +
    "puts its className on the <select>, which otherwise sizes itself to its " +
    "longest option. Checked at 320, 375, 412, 768 and 1366px: the page is " +
    "exactly as wide as the window at all five.",
};

const CONTROLS = new Set([
  "Input",
  "Select",
  "Textarea",
  "Field",
  "FileField",
  "Picker",
  "input",
  "select",
  "textarea",
]);

const NATIVE_PICKERS = new Set([
  "date",
  "time",
  "datetime-local",
  "month",
  "week",
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

/** Every string a className expression can contain — plain, template or cn(). */
function classTokens(initializer: ts.Node): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node)) out.push(node.text);
    else if (ts.isTemplateExpression(node)) {
      out.push(node.head.text);
      for (const span of node.templateSpans) out.push(span.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(initializer);
  return out.join(" ").split(/\s+/).filter(Boolean);
}

type Found = { file: string; line: number; detail: string };

function scan(): { rows: Found[]; rawPickers: Found[] } {
  const rows: Found[] = [];
  const rawPickers: Found[] = [];

  for (const file of sourceFiles(SRC)) {
    if (SKIP.some((part) => file.includes(part))) continue;
    const rel = path.relative(SRC, file).split(path.sep).join("/");
    const text = readFileSync(file, "utf8");
    const sf = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const inUi = rel.startsWith("components/ui/");

    const visit = (node: ts.Node) => {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const opening = ts.isJsxElement(node) ? node.openingElement : node;
        const tag = opening.tagName.getText();

        if (tag === "input" && !inUi) {
          const type = opening.attributes.properties.find(
            (a): a is ts.JsxAttribute =>
              ts.isJsxAttribute(a) && a.name.getText() === "type",
          );
          const value =
            type?.initializer && ts.isStringLiteral(type.initializer)
              ? type.initializer.text
              : "";
          if (NATIVE_PICKERS.has(value)) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
            rawPickers.push({
              file: rel,
              line: line + 1,
              detail: `<input type="${value}">`,
            });
          }
        }

        const className = opening.attributes.properties.find(
          (a): a is ts.JsxAttribute =>
            ts.isJsxAttribute(a) && a.name.getText() === "className",
        );
        if (className?.initializer) {
          /* Unprefixed only: `sm:grid-cols-2` has no `:`-free form. */
          const columns = classTokens(className.initializer).filter((t) =>
            /^grid-cols-(?:[2-9]|\[.+\])$/.test(t),
          );
          if (columns.length > 0) {
            let holdsControl = false;
            const look = (child: ts.Node) => {
              if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
                const name = (
                  ts.isJsxElement(child) ? child.openingElement : child
                ).tagName.getText();
                if (CONTROLS.has(name)) holdsControl = true;
              }
              ts.forEachChild(child, look);
            };
            ts.forEachChild(node, look);
            if (holdsControl) {
              const { line } = sf.getLineAndCharacterOfPosition(
                node.getStart(),
              );
              rows.push({
                file: rel,
                line: line + 1,
                detail: `<${tag} className="… ${columns.join(" ")} …">`,
              });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { rows, rawPickers };
}

describe("form rows on a phone", () => {
  const { rows, rawPickers } = scan();

  it("no unprefixed multi-column grid holds a form control unless it is a FieldRow", () => {
    const offenders = rows.filter((row) => !(row.file in ALLOWED));
    expect(
      offenders,
      offenders
        .map(
          (r) =>
            `${r.file}:${r.line} ${r.detail} — use <FieldRow> (see tests/no-unsafe-form-rows.test.ts)`,
        )
        .join("\n"),
    ).toEqual([]);
  });

  it("every allowed file still has such a row, so the list cannot rot", () => {
    for (const file of Object.keys(ALLOWED)) {
      expect(
        rows.some((row) => row.file === file),
        `${file} is allow-listed but no longer has a fixed-column row — remove it from ALLOWED`,
      ).toBe(true);
    }
  });

  it("a native date or time control always goes through the shared Input", () => {
    /* The shared `Input` carries `min-w-0 max-w-full`, and `globals.css`
       styles the bare element too — but a hand-rolled one has no `Field`
       around it, no error wiring and no height, which is how the next
       overflow gets in. */
    expect(
      rawPickers,
      rawPickers
        .map((r) => `${r.file}:${r.line} ${r.detail} — use <Input type=…>`)
        .join("\n"),
    ).toEqual([]);
  });

  it("the scan reads the source tree, not an empty directory", () => {
    expect(sourceFiles(SRC).length).toBeGreaterThan(300);
  });
});
