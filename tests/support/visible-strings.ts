import { readFileSync } from "node:fs";
import ts from "typescript";

/**
 * Every string a person could read, pulled out of a source file.
 *
 * "Could read" is decided by where the string sits, not by what it says. A
 * string is skipped when its position proves it is a name for the machine:
 * an import path, an object key, a type, an operand of `===` or a `case`, the
 * argument of an element access, a CSS class, a test id, a link target, a
 * route. Everything else is returned, because the cost of reading a stray
 * identifier is one line in an allow-list and the cost of missing a label is a
 * retired word in front of a customer.
 *
 * Comments are trivia in the syntax tree, so they never arrive here.
 */

export type VisibleString = {
  /** 1-based. */
  line: number;
  text: string;
  /** What kind of node it came from, for a clearer failure message. */
  kind: "jsx-text" | "string" | "template";
  /**
   * The text that follows a `${…}` hole, set only on a template or JSX piece
   * that sits straight after an interpolation. A hard-coded plural there is the
   * "1 tasks" bug.
   */
  afterHole: boolean;
  /**
   * What the string is the value of, for telling a label from an identifier:
   * `prop:label`, `attr:aria-label`, `arg:plural` (an argument of that call),
   * `child` (text between tags or inside `{}`), or `other`.
   */
  where: string;
};

/**
 * The node a string really sits in. `cond ? "a" : "b"`, `x || "a"` and
 * `("a")` are all the value of whatever holds them, so look through them.
 */
function slotOf(node: ts.Node): ts.Node {
  let current = node;
  for (;;) {
    const parent = current.parent;
    if (!parent) return current;
    if (
      (ts.isConditionalExpression(parent) && parent.condition !== current) ||
      ts.isParenthesizedExpression(parent) ||
      ts.isAsExpression(parent) ||
      ts.isNonNullExpression(parent) ||
      ts.isSatisfiesExpression(parent) ||
      (ts.isBinaryExpression(parent) &&
        [
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
          ts.SyntaxKind.AmpersandAmpersandToken,
        ].includes(parent.operatorToken.kind) &&
        parent.right === current)
    ) {
      current = parent;
      continue;
    }
    return current;
  }
}

function whereOf(literal: ts.Node): string {
  const node = slotOf(literal);
  const parent = node.parent;
  if (!parent) return "other";
  if (ts.isPropertyAssignment(parent)) {
    const name = parent.name;
    return `prop:${ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : "?"}`;
  }
  if (ts.isJsxAttribute(parent)) return `attr:${parent.name.getText()}`;
  if (ts.isJsxExpression(parent)) {
    return ts.isJsxAttribute(parent.parent)
      ? `attr:${parent.parent.name.getText()}`
      : "child";
  }
  if (
    ts.isCallExpression(parent) &&
    parent.arguments.includes(node as ts.Expression)
  ) {
    return `arg:${callName(parent) ?? "?"}`;
  }
  return "other";
}

/** JSX attributes whose value is for the browser or the test harness. */
const MACHINE_ATTRS = new Set([
  "className",
  "id",
  "key",
  "href",
  "htmlFor",
  "name",
  "type",
  "role",
  "src",
  "target",
  "rel",
  "method",
  "autoComplete",
  "inputMode",
  "variant",
  "size",
  "tone",
  "side",
  "align",
  "as",
  "viewBox",
  "d",
  "fill",
  "stroke",
]);

/** Calls whose string arguments are paths, keys or class lists. */
const MACHINE_CALLS = new Set([
  "cn",
  "clsx",
  "cva",
  "fetch",
  "require",
  "import",
  "useQuery",
  "useQueryParam",
  "queryKey",
  "get",
  "post",
  "patch",
  "put",
  "delete",
  "request",
  "getItem",
  "setItem",
  "removeItem",
  "querySelector",
  "querySelectorAll",
  "getElementById",
  "addEventListener",
  "removeEventListener",
  "dispatchEvent",
  "Symbol",
  "parseInt",
  "RegExp",
  "includes",
  "startsWith",
  "endsWith",
  "has",
  "set",
  "add",
  "delete",
]);

function isMachineAttr(name: string): boolean {
  return MACHINE_ATTRS.has(name) || name.startsWith("data-");
}

function callName(call: ts.CallExpression): string | null {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

function inTypePosition(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (
      ts.isTypeNode(n) ||
      ts.isInterfaceDeclaration(n) ||
      ts.isTypeAliasDeclaration(n)
    ) {
      return true;
    }
    if (ts.isStatement(n) || ts.isBlock(n)) return false;
  }
  return false;
}

/**
 * Is this string in a position that names something for the machine?
 * `node` is the literal (or template).
 */
function isMachinePosition(literal: ts.Node): boolean {
  const node = slotOf(literal);
  const parent = node.parent;
  if (!parent) return false;
  if (inTypePosition(node)) return true;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent))
    return true;
  if (ts.isExternalModuleReference(parent)) return true;
  if (ts.isImportTypeNode(parent) || ts.isLiteralTypeNode(parent)) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isPropertySignature(parent) && parent.name === node) return true;
  if (ts.isEnumMember(parent) && parent.name === node) return true;
  if (
    ts.isElementAccessExpression(parent) &&
    parent.argumentExpression === node
  )
    return true;
  if (ts.isCaseClause(parent)) return true;
  if (ts.isBinaryExpression(parent)) {
    const op = parent.operatorToken.kind;
    if (
      op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      op === ts.SyntaxKind.EqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsToken
    ) {
      return true;
    }
    if (op === ts.SyntaxKind.InKeyword) return true;
  }
  if (ts.isJsxAttribute(parent) && isMachineAttr(parent.name.getText()))
    return true;
  if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)) {
    if (isMachineAttr(parent.parent.name.getText())) return true;
  }
  // `new Set(["a","b"])`, `["a","b"].includes(x)` : lists of machine tokens.
  if (
    ts.isCallExpression(parent) &&
    parent.arguments.includes(node as ts.Expression)
  ) {
    const name = callName(parent);
    if (name && MACHINE_CALLS.has(name)) return true;
  }
  if (ts.isNewExpression(parent)) {
    const callee = parent.expression.getText();
    if (
      callee === "Set" ||
      callee === "Map" ||
      callee === "URL" ||
      callee === "RegExp"
    )
      return true;
  }
  return false;
}

function text(node: ts.Node): string {
  return (node as ts.StringLiteral).text;
}

export function visibleStrings(file: string): VisibleString[] {
  const source = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out: VisibleString[] = [];
  const lineOf = (node: ts.Node) =>
    sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const t = node.text.replace(/\s+/g, " ").trim();
      if (t) {
        const prev =
          node.parent && ts.isJsxElement(node.parent)
            ? node.parent.children[
                node.parent.children.indexOf(node as never) - 1
              ]
            : undefined;
        out.push({
          line: lineOf(node) + (node.text.match(/^\s*\n/) ? 1 : 0),
          text: t,
          kind: "jsx-text",
          afterHole:
            !!prev && ts.isJsxExpression(prev) && /^\s/.test(node.text),
          where: "child",
        });
      }
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      if (!isMachinePosition(node)) {
        out.push({
          line: lineOf(node),
          text: text(node),
          kind: "string",
          afterHole: false,
          where: whereOf(node),
        });
      }
    } else if (ts.isTemplateExpression(node)) {
      if (!isMachinePosition(node)) {
        const where = whereOf(node);
        out.push({
          line: lineOf(node),
          text: node.head.text,
          kind: "template",
          afterHole: false,
          where,
        });
        for (const span of node.templateSpans) {
          out.push({
            line: lineOf(span),
            text: span.literal.text,
            kind: "template",
            afterHole: true,
            where,
          });
        }
      }
      // Still visit the expressions inside the holes, but not the literal pieces
      // (already taken) — a nested template or string inside `${…}` is its own string.
      for (const span of node.templateSpans) visit(span.expression);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}
