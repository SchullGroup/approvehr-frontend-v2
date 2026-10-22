import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * On an iPhone, a text field under 16px zooms the whole page when it is
 * focused, and does not zoom back.
 *
 * iOS Safari does it for any `<input>`, `<select>` or `<textarea>` whose
 * computed font size is below 16px, and the viewport here deliberately allows
 * zoom (`layout.tsx` explains why a payroll figure somebody cannot enlarge is
 * one they misread), so there is no meta tag to switch it off with. The page
 * jumps to the field, the form is now wider than the screen, and the person has
 * to pinch it back. Every field in the product measured 15px.
 *
 * The cure is a size on touch screens, not a size on small screens: an iPhone
 * held sideways is 667 to 932px wide, which is "large" to every width
 * breakpoint and still an iPhone. `pointer-coarse:` is true for a finger and
 * false for a mouse, so a laptop keeps its 15px and a phone gets 16.
 *
 * jsdom cannot evaluate a media query or a computed style, so this reads the
 * source, the way `no-unsafe-form-rows.test.ts` does: the failure is a *shape*
 * that appears in a diff — a text field that names a size under 16px and does
 * not name its touch size — and a diff is where it can be stopped.
 *
 * ## What to do when it fails
 *
 * Use the shared `Input`, `Select` or `Textarea`: they carry the touch size
 * themselves. If the control must be a raw element, add
 * `pointer-coarse:text-body-md` next to its size. A control with no size class
 * at all inherits one (the base layer sets `font-size: inherit`) and is not
 * looked at here: it is as big as what it sits in, which is 16px unless a
 * parent says otherwise.
 */

const SRC = path.resolve(import.meta.dirname, "../src");

/** The design-system page is a specimen sheet, not a screen anybody types on. */
const SKIP = [`${path.sep}design-system${path.sep}`];

/** Controls that do not open a keyboard or a wheel, and so are never zoomed to. */
const NOT_TEXT_ENTRY = new Set([
  "checkbox",
  "radio",
  "file",
  "hidden",
  "range",
  "color",
  "button",
  "submit",
  "reset",
  "image",
]);

/** Pixels, for every size name this codebase can write. `text-body` is a
    colour and is deliberately absent: it names no size. */
const SIZE_PX: Record<string, number> = {
  display: 68,
  h1: 48,
  h2: 34,
  h3: 24,
  h4: 19,
  lead: 19,
  eyebrow: 14,
  "body-lg": 17,
  "body-md": 16,
  "body-sm": 15,
  meta: 14,
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
};

/** `text-[1.25rem]`, `text-[15px]`, `text-[length:0.9rem]` → pixels, or null. */
function arbitraryPx(value: string): number | null {
  const match = /^\[(?:length:)?(\d*\.?\d+)(px|rem|em)\]$/.exec(value);
  if (!match) return null;
  const n = Number(match[1]);
  return match[2] === "px" ? n : n * 16;
}

/** The size a class names, or null for a class that is not a size. */
function sizeOf(utility: string): number | null {
  if (!utility.startsWith("text-")) return null;
  const rest = utility.slice("text-".length);
  return SIZE_PX[rest] ?? arbitraryPx(rest);
}

/** Every string a className expression can contain, with same-file constants
    followed — `className={CELL}` is the usual shape and a bare identifier has
    no literal in it to read. */
function classTokens(
  initializer: ts.Node,
  constants: Map<string, ts.Node>,
  seen = new Set<string>(),
): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node)) out.push(node.text);
    else if (ts.isTemplateExpression(node)) {
      out.push(node.head.text);
      for (const span of node.templateSpans) out.push(span.literal.text);
    } else if (ts.isIdentifier(node)) {
      const name = node.text;
      const declared = constants.get(name);
      if (declared && !seen.has(name)) {
        seen.add(name);
        out.push(...classTokens(declared, constants, seen));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(initializer);
  return out.join(" ").split(/\s+/).filter(Boolean);
}

type Found = { file: string; line: number; detail: string };

/** Text fields in one source file whose size on a touch screen is under 16px. */
function smallTextFields(file: string, text: string): Found[] {
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  /* Top-level `const NAME = "…"` — what `className={NAME}` points at. */
  const constants = new Map<string, ts.Node>();
  for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        constants.set(declaration.name.text, declaration.initializer);
      }
    }
  }

  const found: Found[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = opening.tagName.getText();
      if (tag === "input" || tag === "select" || tag === "textarea") {
        const attribute = (name: string) =>
          opening.attributes.properties.find(
            (a): a is ts.JsxAttribute =>
              ts.isJsxAttribute(a) && a.name.getText() === name,
          );

        const type = attribute("type")?.initializer;
        const typeName =
          type && ts.isStringLiteral(type) ? type.text : undefined;
        const entersText =
          tag !== "input" || !typeName || !NOT_TEXT_ENTRY.has(typeName);

        const className = attribute("className")?.initializer;
        if (entersText && className) {
          const tokens = classTokens(className, constants);
          /* The last unprefixed size wins, as `cn` leaves it; the last
             `pointer-coarse:` one is the size on a finger. */
          let base: number | null = null;
          let coarse: number | null = null;
          for (const token of tokens) {
            const parts = token.split(":");
            const px = sizeOf(parts[parts.length - 1]!);
            if (px === null) continue;
            if (parts.length === 1) base = px;
            else if (parts.length === 2 && parts[0] === "pointer-coarse") {
              coarse = px;
            }
          }
          const onTouch = coarse ?? base;
          if (onTouch !== null && onTouch < 16) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
            found.push({
              file,
              line: line + 1,
              detail: `<${tag}> is ${onTouch}px on a touch screen`,
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

describe("text fields on a touch screen", () => {
  it("none is under 16px, so iOS does not zoom the page when one is focused", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !SKIP.some((part) => file.includes(part)))
      .flatMap((file) => {
        const text = readFileSync(file, "utf8");
        /* Only a file that writes one of the three tags can hold a text field.
           Parsing the other six hundred is nearly all of the time this takes,
           and in a full run on a busy machine that is the difference between a
           second and the test timeout. */
        if (!/<(?:input|select|textarea)\b/.test(text)) return [];
        return smallTextFields(
          path.relative(SRC, file).split(path.sep).join("/"),
          text,
        );
      });
    expect(
      offenders,
      offenders
        .map(
          (o) =>
            `${o.file}:${o.line} ${o.detail}, add pointer-coarse:text-body-md (see tests/text-fields-are-16px-on-touch.test.ts)`,
        )
        .join("\n"),
    ).toEqual([]);
  });

  /* A scan that has never been shown to find anything proves nothing. Each of
     these is the shape it exists to catch, or the shape it must leave alone. */
  describe("the scan itself", () => {
    const scan = (jsx: string, extra = "") =>
      smallTextFields("x.tsx", `${extra}\nexport const A = () => (${jsx});`);

    it("finds a raw input at the app's 15px", () => {
      expect(scan(`<input className="h-10 text-body-sm" />`)).toHaveLength(1);
    });

    it("finds the same field at the 14px floor, and a textarea and a select", () => {
      expect(scan(`<input className="text-meta" />`)).toHaveLength(1);
      expect(scan(`<textarea className="text-sm" />`)).toHaveLength(1);
      expect(scan(`<select className="text-[0.875rem]" />`)).toHaveLength(1);
    });

    it("passes a field that names its size on a finger", () => {
      expect(
        scan(`<input className="text-body-sm pointer-coarse:text-body-md" />`),
      ).toEqual([]);
    });

    it("passes a field that is already 16px or more", () => {
      expect(scan(`<input className="text-body-md" />`)).toEqual([]);
      expect(scan(`<textarea className="text-lead" />`)).toEqual([]);
      expect(scan(`<input className="text-[1.25rem]" />`)).toEqual([]);
    });

    it("leaves a field with no size of its own alone, it inherits one", () => {
      expect(scan(`<input className="h-10 w-full" />`)).toEqual([]);
      expect(scan(`<input />`)).toEqual([]);
    });

    it("leaves boxes, files and the rest that never open a keyboard", () => {
      for (const type of ["checkbox", "radio", "file", "hidden", "range"]) {
        expect(scan(`<input type="${type}" className="text-meta" />`)).toEqual(
          [],
        );
      }
    });

    it("reads a size out of cn() and out of a template", () => {
      expect(
        scan(`<input className={cn("h-10", on && "text-meta")} />`),
      ).toHaveLength(1);
      expect(
        scan("<input className={`h-10 ${x} text-body-sm`} />"),
      ).toHaveLength(1);
    });

    it("follows a same-file constant, which is how a table cell is written", () => {
      expect(
        scan(
          `<input className={CELL} />`,
          `const CELL = "h-10 " + "text-body-sm";`,
        ),
      ).toHaveLength(1);
      expect(
        scan(
          `<input className={cn(CELL, "px-2")} />`,
          `const CELL = "text-body-sm pointer-coarse:text-body-md";`,
        ),
      ).toEqual([]);
    });

    it("does not mistake a size on a wider screen for a size on a finger", () => {
      expect(
        scan(`<input className="text-body-sm sm:text-body-md" />`),
      ).toHaveLength(1);
    });
  });
});
