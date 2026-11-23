import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * No person on a refusal.
 *
 * A figure is the default for a full-size empty state, so a screen that says "you cannot" or "that is not
 * here" gets a smiling person unless it opts out with `plain`. This reads every call site and fails on the
 * ones whose icon says they are a refusal, an error or a missing record and which have not opted out.
 *
 * What to do when it fails: add `plain` (or `compact`, if it really is a small area). If the icon is only
 * there because it suits good news, add the file to `GOOD_NEWS` below with the reason.
 */

const SRC = path.resolve(import.meta.dirname, "../src");

/** Icons that mean "no", "broken" or "not found" in this app. */
const REFUSAL_ICONS = new Set([
  "Lock",
  "ShieldAlert",
  "TriangleAlert",
  "AlertTriangle",
  "FileQuestion",
  "UserRoundX",
  "Unplug",
  "Compass",
]);

/** Files allowed to draw a figure beside one of those icons, keyed by path under `src/`. */
const GOOD_NEWS: Record<string, string> = {
  "app/(app)/people/incomplete/incomplete-records-screen.tsx":
    '"Nothing missing" is good news; the shield is "checked", not "refused".',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

type Site = { file: string; line: number; props: Set<string>; icon?: string };

function sites(file: string): Site[] {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found: Site[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(source) === "EmptyState"
    ) {
      const props = new Set<string>();
      let icon: string | undefined;
      for (const attr of node.attributes.properties) {
        if (!ts.isJsxAttribute(attr)) continue;
        const name = attr.name.getText(source);
        props.add(name);
        const init = attr.initializer;
        if (
          name === "icon" &&
          init &&
          ts.isJsxExpression(init) &&
          init.expression
        ) {
          const e = init.expression;
          if (ts.isJsxSelfClosingElement(e)) icon = e.tagName.getText(source);
          else if (ts.isJsxElement(e))
            icon = e.openingElement.tagName.getText(source);
        }
      }
      const { line } = source.getLineAndCharacterOfPosition(
        node.getStart(source),
      );
      found.push({ file, line: line + 1, props, ...(icon ? { icon } : {}) });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("EmptyState call sites", () => {
  const all = walk(SRC)
    .filter((f) => !f.includes(`${path.sep}design-system${path.sep}`))
    .flatMap(sites);

  it("finds the call sites it is meant to police", () => {
    expect(all.length).toBeGreaterThan(200);
  });

  it("no refusal, error or missing record is left to draw a figure", () => {
    const offenders = all
      .filter((s) => s.icon && REFUSAL_ICONS.has(s.icon))
      .filter((s) => !GOOD_NEWS[path.relative(SRC, s.file)])
      .filter((s) => {
        const small = s.props.has("compact") && !s.props.has("mood");
        return !(s.props.has("plain") || s.props.has("art") || small);
      })
      .map((s) => `${path.relative(SRC, s.file)}:${s.line} (${s.icon})`);
    expect(offenders).toEqual([]);
  });

  it("`plain` is never put on a compact state, where it would change nothing", () => {
    const redundant = all
      .filter((s) => s.props.has("plain") && s.props.has("compact"))
      .map((s) => `${path.relative(SRC, s.file)}:${s.line}`);
    expect(redundant).toEqual([]);
  });
});
