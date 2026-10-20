/**
 * What a file exports, sorted into the columns the inventories use.
 *
 * Classification is by the **shape of the declaration** and the name, not by
 * what the symbol does, which is the only thing a script can know:
 *
 * - a function, an arrow or a function expression is *callable*;
 * - a callable named `useX` is a **hook**;
 * - a callable with a capital letter in a `.tsx` file is a **component**;
 * - any other callable is a **function**;
 * - a `forwardRef(...)` or `memo(...)` of a capitalised name is a component too —
 *   it renders, and it is the shape most of the design system is written in;
 * - everything else exported is counted, never listed: a value is a **const**, a
 *   `type` or `interface` is a **type**, and a class is named, because there are
 *   few and a class is something somebody extends.
 *
 * A symbol therefore lands in the wrong column occasionally — a factory called
 * `makeThing` that returns a component is a function here. The file path beside
 * it is always right, and that is what the inventories are for.
 *
 * Barrels are left out. An `index.ts` that only re-exports declares nothing of
 * its own, and listing what it forwards would list every symbol twice.
 */

import ts from "typescript";

export interface Symbols {
  components: string[];
  hooks: string[];
  functions: string[];
  classes: string[];
  consts: number;
  types: number;
}

export const emptySymbols = (): Symbols => ({
  components: [],
  hooks: [],
  functions: [],
  classes: [],
  consts: 0,
  types: 0,
});

const HOOK = /^use[A-Z0-9]/;
const CAPITAL = /^[A-Z]/;
const WRAPPERS = new Set(["forwardRef", "memo"]);

type Shape = "callable" | "wrapped" | "value";

const isExported = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some(
    (m) => m.kind === ts.SyntaxKind.ExportKeyword,
  );

const isDefault = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some(
    (m) => m.kind === ts.SyntaxKind.DefaultKeyword,
  );

/** `(x)`, `x as T`, `<T>x`, `x satisfies T` and `x!` are all just `x` for this purpose. */
export function unwrap(expr: ts.Expression): ts.Expression {
  let e = expr;
  for (;;) {
    if (ts.isParenthesizedExpression(e)) e = e.expression;
    else if (ts.isAsExpression(e)) e = e.expression;
    else if (ts.isTypeAssertionExpression(e)) e = e.expression;
    else if (ts.isSatisfiesExpression(e)) e = e.expression;
    else if (ts.isNonNullExpression(e)) e = e.expression;
    else return e;
  }
}

function shapeOf(init: ts.Expression | undefined): Shape {
  if (!init) return "value";
  const e = unwrap(init);
  if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return "callable";
  if (ts.isCallExpression(e)) {
    const callee = e.expression;
    const name = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : "";
    if (WRAPPERS.has(name)) return "wrapped";
  }
  return "value";
}

/** True when the file only imports and re-exports — a barrel. */
export function isBarrel(sf: ts.SourceFile): boolean {
  let reexports = 0;
  for (const s of sf.statements) {
    if (ts.isImportDeclaration(s)) continue;
    if (ts.isExportDeclaration(s) && s.moduleSpecifier) {
      reexports += 1;
      continue;
    }
    return false;
  }
  return reexports > 0;
}

export function parse(path: string, text: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

export function symbolsOf(sf: ts.SourceFile): Symbols {
  const tsx = sf.fileName.endsWith(".tsx");
  const out = emptySymbols();

  const place = (name: string, shape: Shape) => {
    if (shape === "value") {
      // A hook is a hook by name, however it was made: `useX = createX()`.
      if (HOOK.test(name)) out.hooks.push(name);
      else out.consts += 1;
      return;
    }
    if (HOOK.test(name)) out.hooks.push(name);
    else if (tsx && CAPITAL.test(name)) out.components.push(name);
    else if (shape === "callable") out.functions.push(name);
    else out.consts += 1;
  };

  // Local declarations by name, so `export { a }` and `export default a` can be
  // classified by what `a` is rather than by how it was exported.
  const local = new Map<string, Shape | "class" | "type">();
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && s.name)
      local.set(s.name.text, "callable");
    else if (ts.isClassDeclaration(s) && s.name)
      local.set(s.name.text, "class");
    else if (ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s))
      local.set(s.name.text, "type");
    else if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        if (ts.isIdentifier(d.name))
          local.set(d.name.text, shapeOf(d.initializer));
      }
    }
  }

  const placeLocal = (name: string, exportedAs: string) => {
    const kind = local.get(name);
    // An export list can name something this file imported. That is a
    // re-export — the file that declares it is where it is counted — and
    // counting it here would list one symbol in two places.
    if (kind === undefined) return;
    if (kind === "class") out.classes.push(exportedAs);
    else if (kind === "type") out.types += 1;
    else place(exportedAs, kind);
  };

  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && (isExported(s) || isDefault(s))) {
      if (s.name) place(s.name.text, "callable");
    } else if (ts.isClassDeclaration(s) && isExported(s)) {
      if (s.name) out.classes.push(s.name.text);
    } else if (
      (ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s)) &&
      isExported(s)
    ) {
      out.types += 1;
    } else if (ts.isEnumDeclaration(s) && isExported(s)) {
      out.consts += 1;
    } else if (ts.isVariableStatement(s) && isExported(s)) {
      for (const d of s.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) place(d.name.text, shapeOf(d.initializer));
        else out.consts += d.name.elements.length;
      }
    } else if (ts.isExportDeclaration(s) && !s.moduleSpecifier) {
      const clause = s.exportClause;
      if (!clause || !ts.isNamedExports(clause)) continue;
      for (const el of clause.elements) {
        placeLocal((el.propertyName ?? el.name).text, el.name.text);
      }
    } else if (ts.isExportAssignment(s) && !s.isExportEquals) {
      const e = unwrap(s.expression);
      if (ts.isIdentifier(e)) placeLocal(e.text, e.text);
    }
  }
  return out;
}
