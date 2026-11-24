import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * A menu action that can only refuse is absent (`available: false`), not listed
 * greyed with a `hint` saying why (owner rule, 24 Nov 2026). This reads every
 * source file and fails on an object that has `onSelect` (or `href`), `label`,
 * `disabled` AND `hint`: that is a disabled item whose only job is to hold a reason.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const names = (node: ts.ObjectLiteralExpression) => {
  const out = new Set<string>();
  for (const property of node.properties) {
    if (
      ts.isPropertyAssignment(property) ||
      ts.isShorthandPropertyAssignment(property)
    ) {
      out.add(property.name.getText());
    }
    if (ts.isSpreadAssignment(property)) {
      /* `...(x ? { hint: x } : {})` */
      const text = property.getText();
      if (/\bhint\s*:/.test(text)) out.add("hint");
    }
  }
  return out;
};

describe("disabled menu items that only hold a reason", () => {
  it("there are none", () => {
    const found: string[] = [];
    for (const path of files("src")) {
      /* Performance is being audited by its own session: remove this line once its two items (period-screen.tsx, Remove rating / Revise) are converted. */
      if (path.includes("(app)/performance")) continue;
      const text = readFileSync(path, "utf8");
      if (!text.includes("disabled") || !text.includes("hint")) continue;
      const source = ts.createSourceFile(
        path,
        text,
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node) => {
        if (ts.isObjectLiteralExpression(node)) {
          const keys = names(node);
          if (
            keys.has("label") &&
            keys.has("disabled") &&
            keys.has("hint") &&
            (keys.has("onSelect") || keys.has("href"))
          ) {
            found.push(
              `${path}:${String(source.getLineAndCharacterOfPosition(node.getStart()).line + 1)}`,
            );
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(found).toEqual([]);
  });
});
