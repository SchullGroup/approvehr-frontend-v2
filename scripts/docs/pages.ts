/**
 * The page inventory for the Next app: `docs/pages/frontend-v2.md`.
 *
 * Every row exists because a `page.tsx` is there. The route is the folder path
 * with the route groups taken out, and the title and the one-line description
 * are the page's own `metadata` — so the inventory reads what the browser tab
 * and a search engine would say, and cannot describe a screen differently from
 * the way the screen describes itself. A page that sets none (or computes it in
 * `generateMetadata`) shows an em dash, which is true: nothing was declared.
 *
 * The landing site's pages are not generated here. Its routes live in a React
 * Router table in `src/App.tsx` with no metadata to read, so each description in
 * `docs/pages/landing-frontend.md` is a sentence somebody wrote.
 */

import ts from "typescript";
import { parse } from "./exports";
import { count, table } from "./markdown";
import type { RepoSource } from "./source";

interface RouteGroup {
  /** The folder name, brackets included; `(root)` is files outside any group. */
  key: string;
  /** Printed in bold in the summary table, and after the heading. */
  lead: string;
  rest: string;
  heading: string;
}

const GROUPS: RouteGroup[] = [
  {
    key: "(app)",
    heading: "(app) — The signed-in product",
    lead: "The signed-in product.",
    rest: "Everything behind sign-in. Shares the `AppShell` chrome and the left-hand sidebar; every item is filtered by permission and by feature switch.",
  },
  {
    key: "(marketing)",
    heading: "(marketing) — The public site",
    lead: "The public site.",
    rest: "Served from the same Next app, own chrome and footer. No authentication. Most of it is retired: `src/proxy.ts` sends those routes to the standalone landing site, and the rows below say which.",
  },
  {
    key: "(auth)",
    heading: "(auth) — Sign-in and account recovery",
    lead: "Sign-in and account recovery.",
    rest: "Reachable signed-out. The gate renders in place rather than redirecting, so a deep link survives sign-in.",
  },
  {
    key: "(setup)",
    heading: "(setup) — First-run wizard",
    lead: "First-run wizard.",
    rest: "Seven questions that decide which modules a new company sees.",
  },
  {
    key: "(focus)",
    heading: "(focus) — Full-window screens",
    lead: "Full-window screens.",
    rest: "No sidebar and no top bar, for a task that wants somebody's whole attention. Behind the sign-in gate; today it is answering a review one question at a time.",
  },
  {
    key: "(root)",
    heading: "(root) — Outside every group",
    lead: "Outside every group.",
    rest: "Files that sit directly under `src/app`.",
  },
];

/**
 * What each signed-in module is called in a heading, by its first URL segment.
 * A segment with no entry is its own name, capitalised.
 */
const MODULE_LABELS: Record<string, string> = {
  approvals: "Approvals inbox",
  ask: "Ask",
  assistant: "AI assistant",
  help: "Employee support",
  hiring: "Recruitment",
};

const labelOf = (segment: string): string =>
  MODULE_LABELS[segment] ??
  segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");

interface Page {
  group: string;
  route: string;
  segment: string;
  title: string | null;
  description: string | null;
  file: string;
}

/** A string the source states outright: a literal, a join of literals, or a const of one. */
function textOf(
  expr: ts.Expression,
  consts: Map<string, ts.Expression>,
): string | null {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return expr.text;
  }
  if (ts.isParenthesizedExpression(expr))
    return textOf(expr.expression, consts);
  if (
    ts.isBinaryExpression(expr) &&
    expr.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = textOf(expr.left, consts);
    const right = textOf(expr.right, consts);
    return left !== null && right !== null ? left + right : null;
  }
  if (ts.isIdentifier(expr)) {
    const bound = consts.get(expr.text);
    return bound ? textOf(bound, consts) : null;
  }
  return null;
}

/** `title: "X"`, `title: { absolute: "X" }` or `title: { default: "X" }`. */
function titleOf(
  expr: ts.Expression,
  consts: Map<string, ts.Expression>,
): string | null {
  const direct = textOf(expr, consts);
  if (direct !== null) return direct;
  if (!ts.isObjectLiteralExpression(expr)) return null;
  for (const key of ["absolute", "default"]) {
    const prop = expr.properties.find(
      (p): p is ts.PropertyAssignment =>
        ts.isPropertyAssignment(p) && p.name.getText() === key,
    );
    if (prop) return textOf(prop.initializer, consts);
  }
  return null;
}

type Declared = { title: string | null; description: string | null };
const NOTHING: Declared = { title: null, description: null };

/** `(x)`, `x as T` and `x satisfies T` are all just `x` here. */
function stripped(expr: ts.Expression): ts.Expression {
  let e = expr;
  while (
    ts.isParenthesizedExpression(e) ||
    ts.isAsExpression(e) ||
    ts.isSatisfiesExpression(e)
  ) {
    e = e.expression;
  }
  return e;
}

const keyOf = (p: ts.ObjectLiteralElementLike): string | null =>
  ts.isPropertyAssignment(p) &&
  (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
    ? p.name.text
    : null;

/** What one object literal states outright, per key; a key it computes is absent. */
function declaredBy(
  object: ts.ObjectLiteralExpression,
  consts: Map<string, ts.Expression>,
): {
  title: string | null | undefined;
  description: string | null | undefined;
} {
  const out: { title?: string | null; description?: string | null } = {};
  for (const p of object.properties) {
    const key = keyOf(p);
    if (!key || !ts.isPropertyAssignment(p)) continue;
    if (key === "title") out.title = titleOf(p.initializer, consts);
    if (key === "description") out.description = textOf(p.initializer, consts);
  }
  return { title: out.title, description: out.description };
}

/** Every expression a function returns, without looking inside nested functions. */
function returnsOf(fn: ts.FunctionLikeDeclaration): ts.Expression[] {
  if (!fn.body) return [];
  if (!ts.isBlock(fn.body)) return [fn.body];
  const out: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isFunctionLike(node) && node !== fn) return;
    if (ts.isReturnStatement(node) && node.expression)
      out.push(node.expression);
    ts.forEachChild(node, visit);
  };
  visit(fn.body);
  return out;
}

/**
 * A page's title and description, as far as the source states them.
 *
 * `export const metadata = {…}` is read directly. `generateMetadata` computes
 * its answer, so a value counts only when it can be known without running it:
 * a function with one `return` of an object literal says what that literal
 * says, and one with several returns says a value only if every return agrees.
 * `title: "Job"` in the branch for a missing advert is not the page's title,
 * and an inventory that printed it as one would be wrong in the way a fallback
 * always is — right for the one case nobody is looking at.
 */
export function metadataOf(text: string): Declared {
  const sf = parse("page.tsx", text);
  const consts = new Map<string, ts.Expression>();
  const functions = new Map<string, ts.FunctionLikeDeclaration>();
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && s.name) functions.set(s.name.text, s);
    if (!ts.isVariableStatement(s)) continue;
    for (const d of s.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer) continue;
      const init = stripped(d.initializer);
      consts.set(d.name.text, d.initializer);
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
        functions.set(d.name.text, init);
      }
    }
  }

  const meta = consts.get("metadata");
  if (meta) {
    const object = stripped(meta);
    if (!ts.isObjectLiteralExpression(object)) return NOTHING;
    const { title, description } = declaredBy(object, consts);
    return { title: title ?? null, description: description ?? null };
  }

  const generate = functions.get("generateMetadata");
  if (!generate) return NOTHING;
  const returned = returnsOf(generate).map(stripped);
  const objects = returned.filter(ts.isObjectLiteralExpression);
  const declared = objects.map((o) => declaredBy(o, consts));
  const agreed = (key: "title" | "description"): string | null => {
    // A return that is not an object literal could say anything.
    if (objects.length !== returned.length || declared.length === 0)
      return null;
    if (declared.length === 1) return declared[0]![key] ?? null;
    const values = declared.map((d) => d[key]);
    const first = values[0];
    return typeof first === "string" && values.every((v) => v === first)
      ? first
      : null;
  };
  return { title: agreed("title"), description: agreed("description") };
}

interface Redirects {
  /** Paths `proxy.ts` sends to the standalone landing site. */
  outward: Set<string>;
  prefixes: string[];
  /** Where it sends the app's own root: into the product. */
  inward: string | null;
}

/** The strings in `["a", "b"]` or `new Set(["a", "b"])`. */
function listedStrings(init: ts.Expression | undefined): string[] {
  if (!init) return [];
  const e = stripped(init);
  const array = ts.isNewExpression(e) ? e.arguments?.[0] : e;
  if (!array || !ts.isArrayLiteralExpression(array)) return [];
  return array.elements.filter(ts.isStringLiteralLike).map((x) => x.text);
}

/**
 * Which routes `src/proxy.ts` retires, read from its own constants.
 *
 * A page file that the proxy redirects still exists and still builds, so an
 * inventory made from `page.tsx` alone lists `/demo` as a screen this app
 * serves. It does not: it 308s to the landing site. The file says so in a long
 * comment and in `REDIRECTED_PATHS`, and the second is the one that cannot
 * drift from what happens, so that is what is read.
 */
export function redirectsOf(source: RepoSource): Redirects {
  const none: Redirects = { outward: new Set(), prefixes: [], inward: null };
  if (!source.files().includes("src/proxy.ts")) return none;
  const text = source.read("src/proxy.ts");
  const sf = parse("src/proxy.ts", text);
  const value = new Map<string, ts.Expression>();
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.initializer)
        value.set(d.name.text, d.initializer);
    }
  }
  const entry = value.get("APP_ENTRY");
  const entryText = entry ? textOf(entry, value) : null;
  return {
    outward: new Set(listedStrings(value.get("REDIRECTED_PATHS"))),
    prefixes: listedStrings(value.get("REDIRECTED_PREFIXES")),
    inward: /pathname === "\/"/.test(text) ? entryText : null,
  };
}

/** What a row says about the redirect, or nothing when the route is served. */
function retired(route: string, r: Redirects): string | null {
  if (route === "/" && r.inward) {
    return `Not shown: \`src/proxy.ts\` sends it to \`${r.inward}\` (307).`;
  }
  const out =
    r.outward.has(route) || r.prefixes.some((p) => route.startsWith(`${p}/`));
  return out
    ? "Retired here: `src/proxy.ts` sends it to the landing site (308)."
    : null;
}

/** `src/app/(app)/people/[id]/page.tsx` → group `(app)`, route `/people/[id]`. */
export function routeOf(file: string): { group: string; route: string } {
  const parts = file
    .replace(/^src\/app\//, "")
    .split("/")
    .slice(0, -1);
  const isGroup = (p: string) => /^\([^.)][^)]*\)$/.test(p);
  const first = parts[0];
  const group = first !== undefined && isGroup(first) ? first : "(root)";
  const url = parts.filter((p) => !isGroup(p));
  return { group, route: "/" + url.join("/") };
}

export function pagesMarkdown(source: RepoSource): string {
  const pages: Page[] = [];
  for (const file of source.files()) {
    if (!/^src\/app\/(.*\/)?page\.tsx$/.test(file)) continue;
    const { group, route } = routeOf(file);
    const { title, description } = metadataOf(source.read(file));
    pages.push({
      group,
      route,
      segment: route.split("/")[1] ?? "",
      title,
      description,
      file,
    });
  }
  pages.sort((a, b) => (a.route < b.route ? -1 : a.route > b.route ? 1 : 0));

  const known = new Set(GROUPS.map((g) => g.key));
  for (const p of pages) {
    if (!known.has(p.group))
      throw new Error(`No heading for route group ${p.group} (${p.file}).`);
  }

  const redirects = redirectsOf(source);
  const rowOf = (p: Page) => {
    const note = retired(p.route, redirects);
    return [
      `\`${p.route}\``,
      p.title ?? "—",
      note
        ? [note, p.description].filter(Boolean).join(" ")
        : (p.description ?? "—"),
      `\`${p.file}\``,
    ];
  };
  const header = ["Route", "Title", "What it is", "File"];

  const sections: string[] = [];
  for (const group of GROUPS) {
    const mine = pages.filter((p) => p.group === group.key);
    if (mine.length === 0) continue;
    const parts = [`## ${group.heading}`, group.rest];

    if (group.key === "(app)") {
      const segments = [...new Set(mine.map((p) => p.segment))].sort();
      for (const segment of segments) {
        const inSegment = mine.filter((p) => p.segment === segment);
        parts.push(
          `### ${labelOf(segment)}`,
          `\`/${segment}\` — ${count(inSegment.length, "page")}`,
          table(header, inSegment.map(rowOf)),
        );
      }
    } else {
      parts.push(table(header, mine.map(rowOf)));
    }
    sections.push(parts.join("\n\n"));
  }

  const summary = GROUPS.filter((g) =>
    pages.some((p) => p.group === g.key),
  ).map((g) => [
    `\`${g.key}\``,
    String(pages.filter((p) => p.group === g.key).length),
    `**${g.lead}** ${g.rest}`,
  ]);

  return (
    [
      "# Pages — ApproveHR frontend v2",
      `_Repo:_ \`approvehr-frontend-v2\` · _Framework:_ Next.js 16, App Router · _Generated from_ \`src/app/**/page.tsx\``,
      `_Snapshot:_ ${source.describe} · regenerate with \`npm run docs\`, never by hand`,
      [
        `**${pages.length} pages** in total. Route groups in brackets — \`(app)\`, \`(marketing)\` — are folders that organise the`,
        "code and **do not appear in the URL**. A segment in square brackets is a parameter.",
      ].join("\n"),
      table(["Group", "Pages", "What it is"], summary, [
        "left",
        "right",
        "left",
      ]),
      "---",
      sections.join("\n\n---\n\n"),
    ].join("\n\n") + "\n"
  );
}
