/**
 * The backend inventory: `docs/components/backend-api.md`.
 *
 * One section per folder under `src/modules`, each with a table of its files and
 * what they export and a table of its HTTP endpoints, then the files outside
 * `src/modules`. This file turns a `RepoSource` of the backend's `src` into that
 * document and has no opinion about where the source came from.
 *
 * ## Why it is a parser and not a pattern
 *
 * The first version of this document was produced by a one-off process nobody
 * recorded. Run against the commit it describes (`a04bc6a`, 2026-09-10), this
 * generator reproduces its 644 routes — every route written as a string literal
 * in a `router.ts` — and its 244 file rows, and differs from it only where the
 * original was incomplete or wrong:
 *
 * - **A sub-router's mount was dropped.** `careers` listed its public postings
 *   as `/:orgSlug` and `payments` listed its webhooks as `/webhooks/9japay`. They
 *   are `/careers/public/:orgSlug` and `/payments/webhooks/9japay`, because
 *   `careersRouter.use("/public", publicRouter)` and
 *   `paymentsRouter.use(publicRouter)` put a prefix on everything inside.
 * - **A router that is not in `router.ts` was not read.** The biometric ingest
 *   route lives in `attendance/ingest.ts` and is mounted by `app.ts`.
 * - **Routes built in a loop were not seen.** `imports` registers a template, a
 *   validate and an apply route for every entity in `ENTITIES`; a pattern over
 *   `.get("...")` cannot see a path written as a template literal.
 * - **Names starting `use` were listed last, hook or not.** `userPermissions`,
 *   a plain function, sat at the end of its row, and `userIdParam`, a `z.object`
 *   constant, was listed as a function. Here a hook is `use` followed by a
 *   capital or a digit, as in `exports.ts`, and it keeps its place in the row.
 * - **An `abstract` class was not named.** `AppError` was missing from the
 *   classes in `src/lib/errors.ts`.
 *
 * So routes are found the way Express finds them, by following the mounts from
 * `app.ts`: `createApp` is executed symbolically, every router it mounts is
 * resolved through the imports to the file that creates it, and that file's own
 * top-level statements are executed in turn. "Executed" means a small subset of
 * TypeScript — identifiers, imports, property access, object and array literals,
 * calls to functions the repository declares, template strings, and a `for...of`
 * over something that evaluates to an array — which is what it takes to evaluate
 * `imports.ENTITIES` to the entity slugs that are actually registered:
 * `register(EMPLOYEE_IMPORT)` returns an object whose `slug` is
 * `entity.dictionary.slug`, which is the first argument of a `buildDictionary`
 * call, and a dictionary that is built but never registered is not a route.
 *
 * ## What it refuses to do
 *
 * Guess. A route whose path cannot be evaluated, a `.route()` or `.all()` chain,
 * a mount or route inside an `if` or a `try`, a `for...of` over something it
 * cannot enumerate, a route call that no execution reached, a router that has
 * routes and is never mounted, and a file that creates a router nothing mounts
 * all **throw**, naming the line. An inventory that quietly leaves a route out is
 * the failure this exists to prevent, and a generator that stops is easy to
 * teach: write the route as a literal, or extend the interpreter below.
 *
 * ## What it records
 *
 * Paths are `mount + route`, joined as text, so a router's root route keeps its
 * trailing slash (`/advances/`). `/api/v1` is left off: `app.ts` creates the
 * `v1` router itself and mounts it once, which makes that prefix the API's own
 * rather than any module's. `/admin` is mounted on the app directly, outside
 * `v1`, and keeps its prefix. Routes declared on the app itself (`/health`) belong
 * to no module and are not listed.
 *
 * Within a module, endpoints are in the order Express would match them: mounts
 * in `app.ts` order, and inside each router, routes and sub-router mounts in
 * the order they are registered.
 *
 * A file counts toward its module's file total whether or not it exports
 * anything of its own, and gets a row only if it does, so `src/server.ts` is
 * counted and not listed; the files left out of a table are named under it.
 * Hooks and plain functions share one column in source order, because the only
 * difference between them is a name. A name exported more than once (an
 * overloaded function) is listed once.
 */

import path from "node:path";
import ts from "typescript";
import { parse, symbolsOf, unwrap, type Symbols } from "./exports";
import { alsoCell, names, slug, table } from "./markdown";
import type { RepoSource } from "./source";

/* ------------------------------------------------------------------ prose */

/**
 * What each module is for, in a sentence. Printed under its heading, and absent
 * for a module with no entry here: a blurb nobody wrote is better left out than
 * invented by a script.
 *
 * Eleven of these are the original inventory's, copied as they were. The seven
 * for `ai2`, `billing`, `job-roles`, `projects`, `screening`, `surveys` and
 * `work-trackers` were written from each module's own header comments, and say
 * only what those comments and the code behind them state.
 *
 * These sentences are the only hand-written text in the file they produce, and
 * so the only part that can go stale on its own: `ai` said "chat" for weeks
 * after `POST /ai/chat` was removed (the conversation moved to `ai2`). When the
 * endpoint table under a heading stops matching the sentence above it, fix the
 * sentence here.
 */
export const MODULE_PURPOSE: Record<string, string> = {
  ai: "The assistant: ask, suggest, draft, and the confirm-before-write actions.",
  ai2: "Read-only questions about the company's own records, answered by Gemini with every entity and field gated against the caller, and token use counted per organisation; mounted alongside `ai`.",
  billing:
    "Plans, the company's subscription and checkout, and the paywall that refuses a module the company has not paid for; nothing is deleted when a company lapses.",
  departments: "**The reference module.** Copy this shape for a new one.",
  employees: "The staff record, the reporting line and the directory.",
  imports:
    "The bulk-upload framework: one machine, many column dictionaries. Two callers with different contracts — the spreadsheet upload and the legacy ETL.",
  "job-roles":
    "The catalogue of the company's job roles, with a target level per competency for each; nothing is compulsory, and a record keeps the title it was written with.",
  notifications: "In-app messages. Nothing here sends email.",
  payments:
    "The wallet, the ledger and the provider seam. With no provider registered, releasing refuses rather than faking success.",
  payroll:
    "The statutory engine, the run lifecycle, exclusions, hand adjustments and the reconciliation gate.",
  performance:
    "Appraisal periods, objectives, competencies, scoring, sign-off and the nine-box.",
  permissions: "Roles, the permission catalogue and the grant guards.",
  projects:
    "Projects, their members and workflow, sprints, issues and comments, behind the `projects` feature switch; a finished issue can file a weekly task for the performance module.",
  recruitment: "Requisitions, pipelines, interviews, scorecards and offers.",
  screening:
    "Scores an advert's applicants against its criteria from the words in their CVs, applies the pass mark and assessment results, and runs re-scoring.",
  setup:
    "The first-run wizard, the feature switches and the readiness checklist.",
  surveys:
    "Staff surveys: on an anonymous survey a response never records who wrote it, and results are withheld below a minimum number of responses.",
  "work-trackers":
    "Connections to Jira, Asana, ClickUp, Monday.com and Trello that pull in each person's tickets as evidence and file a finished ticket as an ungraded weekly task for a person to grade.",
};

const TITLE = "Functions and modules — ApproveHR API";

const INTRO = [
  "This platform has no pages. It is Express 5 + Prisma, arranged as one folder per module, each with the",
  "same three files: `router.ts` (the HTTP surface), `schemas.ts` (what a request may contain) and",
  "`service.ts` (what actually happens). Read `src/modules/departments/` first — it is the reference shape.",
  "",
  "Constants and types are counted rather than listed. Endpoint paths below are the full mounted path, without the",
  "`/api/v1` that the API puts in front of all of them except the `/admin` routes.",
];

const SHARED_HEADING = "Shared — everything outside `src/modules`";
const SHARED_PURPOSE =
  "Database and tenancy, middleware, config, helpers, scripts and the server entry point.";

/* ------------------------------------------------------------------ shapes */

export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type Method = (typeof METHODS)[number];

export interface Endpoint {
  method: Method;
  /** The mount and the route, joined as text, without `/api/v1`. */
  path: string;
  /** The file the route is declared in, and the line. */
  file: string;
  line: number;
  /**
   * True when the path had to be evaluated — a template literal built from a
   * loop variable — rather than read off the page. These are the routes a
   * pattern over string literals cannot see.
   */
  derived: boolean;
}

export interface FileEntry {
  path: string;
  /** Hooks and plain functions, in source order, each name once. */
  functions: string[];
  classes: string[];
  consts: number;
  types: number;
}

/** A module, or everything outside `src/modules`. */
export interface Group {
  /** Every non-test `.ts` file, including those with nothing of their own to list. */
  files: number;
  /** The files that export something, sorted by path. */
  entries: FileEntry[];
  /** The files counted in `files` that have no row. */
  unlisted: string[];
  functions: number;
  endpoints: Endpoint[];
}

export interface ModuleReport extends Group {
  /** The folder under `src/modules`. */
  name: string;
}

export interface BackendInventory {
  modules: ModuleReport[];
  shared: Group;
  /** Routes declared on the app itself, which belong to no module. */
  appRoutes: Endpoint[];
}

/* --------------------------------------------------------------- the files */

const SRC = "src/";
const MODULES = "src/modules/";
const ENTRY_FILE = "src/app.ts";
const ENTRY_FUNCTION = "createApp";

const isTest = (file: string): boolean => /\.(test|spec)\.ts$/.test(file);

/** Every file the inventory is about: `src/**\/*.ts`, tests excluded. */
function inventoryFiles(source: RepoSource): string[] {
  return source
    .files()
    .filter((f) => f.startsWith(SRC) && f.endsWith(".ts") && !isTest(f))
    .sort();
}

/** `src/modules/payments/providers/config.ts` is the `payments` module's. */
function moduleOf(file: string): string | undefined {
  if (!file.startsWith(MODULES)) return undefined;
  const rest = file.slice(MODULES.length);
  const slash = rest.indexOf("/");
  return slash === -1 ? undefined : rest.slice(0, slash);
}

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);

/**
 * The exported callables of a file in the order they are exported.
 *
 * `symbolsOf` sorts hooks and functions into two lists, and the column is one
 * list in source order. A name is positioned where it is *exported*: the
 * declaration for `export function f`, but the specifier for `export { f }`,
 * because that is where `symbolsOf` counts it.
 */
function callablesInOrder(sf: ts.SourceFile, symbols: Symbols): string[] {
  const names = [...new Set([...symbols.functions, ...symbols.hooks])];
  if (names.length < 2) return names;

  const at = new Map<string, number>();
  const note = (name: string, node: ts.Node): void => {
    if (!at.has(name)) at.set(name, node.getStart(sf));
  };
  for (const s of sf.statements) {
    if (
      ts.isFunctionDeclaration(s) &&
      s.name &&
      (hasModifier(s, ts.SyntaxKind.ExportKeyword) ||
        hasModifier(s, ts.SyntaxKind.DefaultKeyword))
    ) {
      note(s.name.text, s);
    } else if (
      ts.isVariableStatement(s) &&
      hasModifier(s, ts.SyntaxKind.ExportKeyword)
    ) {
      for (const d of s.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) note(d.name.text, d);
      }
    } else if (
      ts.isExportDeclaration(s) &&
      !s.moduleSpecifier &&
      s.exportClause &&
      ts.isNamedExports(s.exportClause)
    ) {
      for (const el of s.exportClause.elements) note(el.name.text, el);
    } else if (ts.isExportAssignment(s) && !s.isExportEquals) {
      const e = unwrap(s.expression);
      if (ts.isIdentifier(e)) note(e.text, s);
    }
  }

  // Stable for a name with no position (there should be none): those go last.
  return names
    .map((name, i) => ({ name, i, pos: at.get(name) ?? Infinity }))
    .sort((a, b) => a.pos - b.pos || a.i - b.i)
    .map((x) => x.name);
}

function entryOf(file: string, text: string): FileEntry | undefined {
  const sf = parse(file, text);
  const symbols = symbolsOf(sf);
  const entry: FileEntry = {
    path: file,
    functions: callablesInOrder(sf, symbols),
    classes: symbols.classes,
    consts: symbols.consts,
    types: symbols.types,
  };
  const empty =
    entry.functions.length === 0 &&
    entry.classes.length === 0 &&
    entry.consts === 0 &&
    entry.types === 0;
  return empty ? undefined : entry;
}

/* --------------------------------------------------------------- the routes */

/*
 * Everything from here to "the inventory" is the route interpreter. It is long
 * because the claim it makes — "these are the routes" — has to hold for a code
 * base nobody wrote with a generator in mind, and the only honest way to hold it
 * is to run the same wiring Express runs, over a subset of the language small
 * enough to be checked and strict enough to stop when it leaves it.
 */

const VERBS = new Set(METHODS.map((m) => m.toLowerCase()));
/** Registration forms that are routes and that this does not model. */
const UNMODELLED = new Set(["all", "head", "options", "route"]);
const REGISTERS = new Set([...VERBS, ...UNMODELLED, "use"]);
const DEFAULT = "%default";
/** How deep calls may nest before this gives up rather than overflows. */
const MAX_DEPTH = 60;

type Callable =
  ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

/** A router (or the app) and what has been registered on it, in order. */
class RouterNode {
  readonly items: Item[] = [];
  constructor(
    readonly file: string,
    readonly line: number,
  ) {}
}

type Item =
  | { kind: "route"; route: Endpoint }
  | { kind: "mount"; prefix: string; child: RouterNode };

type Fn = { t: "function"; node: Callable; scope: Scope };

type Value =
  | { t: "string"; v: string }
  | { t: "router"; r: RouterNode }
  | { t: "array"; items: Thunk[] }
  | { t: "object"; props: Map<string, Thunk> }
  | Fn
  | { t: "namespace"; file: string }
  | { t: "external"; from: string; path: string }
  | { t: "unknown" };

const UNKNOWN: Value = { t: "unknown" };

/** A value computed on first use, once. A cycle yields `unknown` rather than a hang. */
class Thunk {
  private state: "idle" | "busy" | "done" = "idle";
  private value: Value = UNKNOWN;
  constructor(private readonly make: () => Value) {}
  get(): Value {
    if (this.state === "done") return this.value;
    if (this.state === "busy") return UNKNOWN;
    this.state = "busy";
    try {
      this.value = this.make();
    } finally {
      this.state = "done";
    }
    return this.value;
  }
}

const settled = (v: Value): Thunk => new Thunk(() => v);

class Scope {
  readonly vars = new Map<string, Thunk>();
  constructor(
    readonly file: string,
    readonly parent?: Scope,
  ) {}
}

interface ImportBinding {
  /** The file it resolves to inside the snapshot, if it does. */
  target: string | undefined;
  /** What was written after `from`. */
  specifier: string;
  /** The imported name, `default` or `*`. */
  name: string;
}

interface FileInfo {
  sf: ts.SourceFile;
  scope: Scope;
  imports: Map<string, ImportBinding>;
  /** Exported name -> local name. */
  exported: Map<string, string>;
  /** `export { a as b } from "./x"`: b -> { from, a }. */
  reexports: Map<string, { from: string; name: string }>;
  /** `export * from "./x"`. */
  stars: string[];
}

function refuse(node: ts.Node, why: string): Error {
  const sf = node.getSourceFile();
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return new Error(
    `${sf.fileName}:${String(line + 1)}: ${why}. The backend inventory follows ` +
      `routes by executing the wiring and will not guess: write the route as a ` +
      `literal, or teach scripts/docs/backend-api.ts about this form.`,
  );
}

const lineOf = (node: ts.Node): number => {
  const sf = node.getSourceFile();
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
};

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((el) =>
    ts.isOmittedExpression(el) ? [] : bindingNames(el.name),
  );
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.text;
  }
  return undefined;
}

/** True for a call that makes an Express app or router: `express()`, `Router()`. */
function createsRouter(n: ts.Node): boolean {
  if (!ts.isCallExpression(n)) return false;
  const callee = unwrap(n.expression);
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : "";
  return name === "Router" || name === "express";
}

class RouterProgram {
  private readonly infos = new Map<string, FileInfo>();
  private readonly ran = new Set<string>();
  private readonly visited = new Set<ts.Node>();
  private readonly created: RouterNode[] = [];
  private depth = 0;

  constructor(
    private readonly files: ReadonlySet<string>,
    private readonly read: (file: string) => string,
  ) {}

  /* ---- the entry point ------------------------------------------------- */

  /** Every route in the order Express would match them, and those on the app. */
  routes(): { all: Endpoint[]; app: Endpoint[] } {
    const entry = this.info(ENTRY_FILE);
    const create = entry.scope.vars.get(ENTRY_FUNCTION)?.get();
    if (create?.t !== "function") {
      throw new Error(`${ENTRY_FILE} has no function ${ENTRY_FUNCTION}.`);
    }
    const scope = this.enter(create, [], entry.scope, true);
    const app = scope.vars.get("app")?.get();
    if (app?.t !== "router") {
      throw new Error(
        `${ENTRY_FUNCTION} in ${ENTRY_FILE} never creates \`app\`.`,
      );
    }
    // Its own top-level statements declare `createApp` and nothing to execute.
    this.ran.add(ENTRY_FILE);

    const all: Endpoint[] = [];
    const mounted = new Set<RouterNode>();
    this.flatten(app.r, "", [], all, mounted);
    this.audit(mounted);
    return { all, app: all.filter((e) => e.file === ENTRY_FILE) };
  }

  private flatten(
    router: RouterNode,
    prefix: string,
    trail: RouterNode[],
    out: Endpoint[],
    mounted: Set<RouterNode>,
  ): void {
    if (trail.includes(router)) {
      throw new Error(
        `A router at ${router.file}:${String(router.line)} is mounted inside itself.`,
      );
    }
    mounted.add(router);
    this.run(router.file);
    for (const item of router.items) {
      if (item.kind === "route") {
        out.push({ ...item.route, path: prefix + item.route.path });
        continue;
      }
      // A router `app.ts` creates is the version envelope, not a module's.
      const own = item.child.file === ENTRY_FILE ? "" : item.prefix;
      this.flatten(item.child, prefix + own, [...trail, router], out, mounted);
    }
  }

  /**
   * Nothing the interpreter did not reach may look like a route.
   *
   * Three ways to lose one: a router that has routes and is never mounted, a
   * file that creates a router no mount ever reached, and a route call written
   * somewhere the walk does not go (inside a callback, say). Each would leave an
   * endpoint out of the document without a sound.
   */
  private audit(mounted: ReadonlySet<RouterNode>): void {
    for (const r of this.created) {
      if (r.items.length > 0 && !mounted.has(r)) {
        throw new Error(
          `The router created at ${r.file}:${String(r.line)} has routes and is never ` +
            `mounted from ${ENTRY_FILE}, so they would be missing from the inventory.`,
        );
      }
    }

    for (const file of this.files) {
      if (file === ENTRY_FILE) continue;
      // Cheap first: most files say neither word, and need no parse.
      if (!/\bRouter\s*\(|\bexpress\s*\(/.test(this.read(file))) continue;
      const info = this.info(file);

      let creates: ts.Node | undefined;
      const scan = (n: ts.Node): void => {
        if (createsRouter(n)) creates ??= n;
        ts.forEachChild(n, scan);
      };
      scan(info.sf);
      if (!creates) continue;
      if (!this.ran.has(file)) {
        throw refuse(
          creates,
          "This file creates a router that nothing mounted from app.ts reaches",
        );
      }

      const check = (n: ts.Node): void => {
        if (
          ts.isCallExpression(n) &&
          ts.isPropertyAccessExpression(n.expression) &&
          REGISTERS.has(n.expression.name.text) &&
          ts.isIdentifier(n.expression.expression)
        ) {
          const receiver = info.scope.vars
            .get(n.expression.expression.text)
            ?.get();
          if (receiver?.t === "router" && !this.visited.has(n)) {
            const name = n.expression.name.text;
            throw refuse(
              n,
              UNMODELLED.has(name)
                ? `\`.${name}(...)\` registers routes in a form not modelled here`
                : "A route is registered here but the walk never executed this call",
            );
          }
        }
        ts.forEachChild(n, check);
      };
      check(info.sf);
    }
  }

  /** Execute a file's top-level statements, once. */
  private run(file: string): void {
    if (this.ran.has(file)) return;
    this.ran.add(file);
    const info = this.info(file);
    this.execStatements(info.sf.statements, info.scope);
  }

  /* ---- files, imports, exports ---------------------------------------- */

  private info(file: string): FileInfo {
    const known = this.infos.get(file);
    if (known) return known;

    const sf = parse(file, this.read(file));
    const scope = new Scope(file);
    const info: FileInfo = {
      sf,
      scope,
      imports: new Map(),
      exported: new Map(),
      reexports: new Map(),
      stars: [],
    };
    // Registered before anything is evaluated: evaluation is lazy, and two files
    // that import each other must find each other.
    this.infos.set(file, info);

    this.declare(sf.statements, scope);
    for (const s of sf.statements) {
      if (ts.isImportDeclaration(s)) this.noteImport(info, file, s);
      else if (ts.isExportDeclaration(s)) this.noteExportList(info, file, s);
      else if (ts.isExportAssignment(s) && !s.isExportEquals) {
        scope.vars.set(
          DEFAULT,
          new Thunk(() => this.evaluate(s.expression, scope)),
        );
        info.exported.set("default", DEFAULT);
      } else if (ts.isFunctionDeclaration(s) && s.name) {
        if (hasModifier(s, ts.SyntaxKind.DefaultKeyword)) {
          info.exported.set("default", s.name.text);
        } else if (hasModifier(s, ts.SyntaxKind.ExportKeyword)) {
          info.exported.set(s.name.text, s.name.text);
        }
      } else if (
        ts.isVariableStatement(s) &&
        hasModifier(s, ts.SyntaxKind.ExportKeyword)
      ) {
        for (const d of s.declarationList.declarations) {
          for (const name of bindingNames(d.name))
            info.exported.set(name, name);
        }
      } else if (
        (ts.isClassDeclaration(s) || ts.isEnumDeclaration(s)) &&
        s.name &&
        hasModifier(s, ts.SyntaxKind.ExportKeyword)
      ) {
        info.exported.set(s.name.text, s.name.text);
      }
    }
    return info;
  }

  /** `./x.js` -> `src/.../x.ts`, when that file is part of the snapshot. */
  private resolve(from: string, specifier: string): string | undefined {
    if (!specifier.startsWith(".")) return undefined;
    const base = path.posix.normalize(
      path.posix.join(path.posix.dirname(from), specifier),
    );
    const bare = base.replace(/\.(js|ts)$/, "");
    for (const candidate of [`${bare}.ts`, `${bare}/index.ts`]) {
      if (this.files.has(candidate)) return candidate;
    }
    return undefined;
  }

  private noteImport(
    info: FileInfo,
    file: string,
    s: ts.ImportDeclaration,
  ): void {
    const clause = s.importClause;
    if (!clause || clause.isTypeOnly) return;
    if (!ts.isStringLiteral(s.moduleSpecifier)) return;
    const specifier = s.moduleSpecifier.text;
    const target = this.resolve(file, specifier);
    const bind = (local: string, name: string): void => {
      info.imports.set(local, { target, specifier, name });
    };
    if (clause.name) bind(clause.name.text, "default");
    const bindings = clause.namedBindings;
    if (!bindings) return;
    if (ts.isNamespaceImport(bindings)) bind(bindings.name.text, "*");
    else {
      for (const el of bindings.elements) {
        if (!el.isTypeOnly)
          bind(el.name.text, (el.propertyName ?? el.name).text);
      }
    }
  }

  private noteExportList(
    info: FileInfo,
    file: string,
    s: ts.ExportDeclaration,
  ): void {
    if (s.isTypeOnly) return;
    const clause = s.exportClause;
    if (s.moduleSpecifier) {
      const from = ts.isStringLiteral(s.moduleSpecifier)
        ? this.resolve(file, s.moduleSpecifier.text)
        : undefined;
      if (from === undefined) return;
      if (!clause) info.stars.push(from);
      else if (ts.isNamedExports(clause)) {
        for (const el of clause.elements) {
          info.reexports.set(el.name.text, {
            from,
            name: (el.propertyName ?? el.name).text,
          });
        }
      }
      return;
    }
    if (clause && ts.isNamedExports(clause)) {
      for (const el of clause.elements) {
        info.exported.set(el.name.text, (el.propertyName ?? el.name).text);
      }
    }
  }

  /** Make a block's variables and functions nameable before anything runs. */
  private declare(statements: readonly ts.Statement[], scope: Scope): void {
    for (const s of statements) {
      if (ts.isFunctionDeclaration(s) && s.name) {
        scope.vars.set(s.name.text, settled({ t: "function", node: s, scope }));
      } else if (ts.isVariableStatement(s)) {
        for (const d of s.declarationList.declarations) {
          const init = d.initializer;
          if (ts.isIdentifier(d.name)) {
            scope.vars.set(
              d.name.text,
              init
                ? new Thunk(() => this.evaluate(init, scope))
                : settled(UNKNOWN),
            );
          } else {
            for (const name of bindingNames(d.name)) {
              scope.vars.set(name, settled(UNKNOWN));
            }
          }
        }
      }
    }
  }

  private lookup(name: string, scope: Scope): Value {
    for (let s: Scope | undefined = scope; s; s = s.parent) {
      const thunk = s.vars.get(name);
      if (thunk) return thunk.get();
    }
    const imported = this.info(scope.file).imports.get(name);
    if (!imported) return UNKNOWN;
    if (imported.target === undefined) {
      return { t: "external", from: imported.specifier, path: imported.name };
    }
    if (imported.name === "*") return { t: "namespace", file: imported.target };
    return this.exportOf(imported.target, imported.name, 0);
  }

  private exportOf(file: string, name: string, depth: number): Value {
    if (depth > 24) return UNKNOWN;
    const info = this.info(file);
    const local = info.exported.get(name);
    if (local !== undefined) return this.lookup(local, info.scope);
    const re = info.reexports.get(name);
    if (re) return this.exportOf(re.from, re.name, depth + 1);
    for (const star of info.stars) {
      const v = this.exportOf(star, name, depth + 1);
      if (v.t !== "unknown") return v;
    }
    return UNKNOWN;
  }

  /* ---- evaluating an expression --------------------------------------- */

  private evaluate(node: ts.Expression, scope: Scope): Value {
    const e = unwrap(node);

    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) {
      return { t: "string", v: e.text };
    }
    if (ts.isTemplateExpression(e)) {
      let out = e.head.text;
      for (const span of e.templateSpans) {
        const v = this.evaluate(span.expression, scope);
        if (v.t !== "string") return UNKNOWN;
        out += v.v + span.literal.text;
      }
      return { t: "string", v: out };
    }
    if (ts.isIdentifier(e)) return this.lookup(e.text, scope);
    if (ts.isPropertyAccessExpression(e)) {
      return this.member(this.evaluate(e.expression, scope), e.name.text);
    }
    if (ts.isAwaitExpression(e)) return this.evaluate(e.expression, scope);
    if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) {
      return { t: "function", node: e, scope };
    }
    if (ts.isArrayLiteralExpression(e)) return this.array(e, scope);
    if (ts.isObjectLiteralExpression(e)) return this.object(e, scope);
    if (ts.isCallExpression(e)) return this.call(e, scope);
    if (
      ts.isBinaryExpression(e) &&
      e.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      const a = this.evaluate(e.left, scope);
      const b = this.evaluate(e.right, scope);
      return a.t === "string" && b.t === "string"
        ? { t: "string", v: a.v + b.v }
        : UNKNOWN;
    }
    return UNKNOWN;
  }

  private member(base: Value, name: string): Value {
    switch (base.t) {
      case "object":
        return base.props.get(name)?.get() ?? UNKNOWN;
      case "namespace":
        return this.exportOf(base.file, name, 0);
      case "external":
        return { t: "external", from: base.from, path: `${base.path}.${name}` };
      default:
        return UNKNOWN;
    }
  }

  private array(e: ts.ArrayLiteralExpression, scope: Scope): Value {
    const items: Thunk[] = [];
    for (const el of e.elements) {
      if (ts.isOmittedExpression(el)) continue;
      if (ts.isSpreadElement(el)) {
        const inner = this.evaluate(el.expression, scope);
        // A spread of something unknown leaves the membership unknown too.
        if (inner.t !== "array") return UNKNOWN;
        items.push(...inner.items);
      } else {
        items.push(new Thunk(() => this.evaluate(el, scope)));
      }
    }
    return { t: "array", items };
  }

  private object(e: ts.ObjectLiteralExpression, scope: Scope): Value {
    const props = new Map<string, Thunk>();
    for (const p of e.properties) {
      if (ts.isPropertyAssignment(p)) {
        const key = propertyName(p.name);
        if (key !== undefined) {
          props.set(key, new Thunk(() => this.evaluate(p.initializer, scope)));
        }
      } else if (ts.isShorthandPropertyAssignment(p)) {
        const name = p.name.text;
        props.set(name, new Thunk(() => this.lookup(name, scope)));
      } else if (ts.isSpreadAssignment(p)) {
        const inner = this.evaluate(p.expression, scope);
        if (inner.t === "object") {
          for (const [k, t] of inner.props) props.set(k, t);
        }
      }
    }
    return { t: "object", props };
  }

  private call(e: ts.CallExpression, scope: Scope): Value {
    const callee = this.evaluate(e.expression, scope);
    if (callee.t === "external") {
      // Express itself: `express()` is the app, `Router()` and
      // `express.Router()` are routers. Every other package call is opaque.
      const makesRouter =
        callee.from === "express" &&
        (callee.path === "default" ||
          callee.path === "Router" ||
          callee.path === "default.Router");
      if (!makesRouter) return UNKNOWN;
      const router = new RouterNode(scope.file, lineOf(e));
      this.created.push(router);
      return { t: "router", r: router };
    }
    if (callee.t !== "function") return UNKNOWN;
    return this.returned(callee, e.arguments, scope);
  }

  /* ---- calling a function the repository declares ---------------------- */

  private nested<T>(at: ts.Node, work: () => T): T {
    if (this.depth > MAX_DEPTH) {
      throw refuse(at, "Calls nest too deeply to follow");
    }
    this.depth += 1;
    try {
      return work();
    } finally {
      this.depth -= 1;
    }
  }

  /** The scope a call runs in: parameters bound lazily to the caller's arguments. */
  private enter(
    fn: Fn,
    args: readonly ts.Expression[],
    caller: Scope,
    execute: boolean,
  ): Scope {
    return this.nested(fn.node, () => {
      const scope = new Scope(fn.scope.file, fn.scope);
      fn.node.parameters.forEach((p, i) => {
        if (!ts.isIdentifier(p.name)) {
          for (const name of bindingNames(p.name)) {
            scope.vars.set(name, settled(UNKNOWN));
          }
          return;
        }
        const arg = args[i];
        const fallback = p.initializer;
        scope.vars.set(
          p.name.text,
          arg
            ? new Thunk(() => this.evaluate(arg, caller))
            : fallback
              ? new Thunk(() => this.evaluate(fallback, scope))
              : settled(UNKNOWN),
        );
      });
      const body = fn.node.body;
      if (body && ts.isBlock(body)) {
        this.declare(body.statements, scope);
        if (execute) this.execStatements(body.statements, scope);
      }
      return scope;
    });
  }

  /** What a call evaluates to: its single `return`, in the call's own scope. */
  private returned(
    fn: Fn,
    args: readonly ts.Expression[],
    caller: Scope,
  ): Value {
    const body = fn.node.body;
    if (!body) return UNKNOWN;
    const scope = this.enter(fn, args, caller, false);
    return this.nested(fn.node, () => {
      if (!ts.isBlock(body)) return this.evaluate(body, scope);
      const returns = body.statements.filter(ts.isReturnStatement);
      const only = returns.length === 1 ? returns[0] : undefined;
      return only?.expression ? this.evaluate(only.expression, scope) : UNKNOWN;
    });
  }

  /* ---- executing statements ------------------------------------------- */

  private execStatements(
    statements: readonly ts.Statement[],
    scope: Scope,
  ): void {
    for (const s of statements) this.execStatement(s, scope);
  }

  private execStatement(s: ts.Statement, scope: Scope): void {
    if (ts.isExpressionStatement(s)) {
      const e = unwrap(s.expression);
      const call = ts.isAwaitExpression(e) ? unwrap(e.expression) : e;
      if (ts.isCallExpression(call)) this.execCall(call, scope);
      return;
    }
    if (ts.isBlock(s)) {
      const inner = new Scope(scope.file, scope);
      this.declare(s.statements, inner);
      this.execStatements(s.statements, inner);
      return;
    }
    if (ts.isForOfStatement(s)) {
      this.execForOf(s, scope);
      return;
    }
    if (
      ts.isFunctionDeclaration(s) ||
      ts.isVariableStatement(s) ||
      ts.isImportDeclaration(s) ||
      ts.isExportDeclaration(s) ||
      ts.isExportAssignment(s) ||
      ts.isInterfaceDeclaration(s) ||
      ts.isTypeAliasDeclaration(s) ||
      ts.isClassDeclaration(s) ||
      ts.isEnumDeclaration(s) ||
      ts.isModuleDeclaration(s) ||
      ts.isReturnStatement(s) ||
      ts.isThrowStatement(s) ||
      ts.isEmptyStatement(s)
    ) {
      return;
    }
    // `if`, `try`, `switch`, `while`, `for`: only a problem if a route is in it.
    if (this.touchesRouter(s, scope)) {
      throw refuse(
        s,
        "A route or mount is inside control flow the walk cannot follow",
      );
    }
  }

  /** True when a call in `node` registers something on a router. */
  private touchesRouter(node: ts.Node, scope: Scope): boolean {
    let found = false;
    const visit = (n: ts.Node): void => {
      if (found) return;
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        REGISTERS.has(n.expression.name.text) &&
        this.evaluate(n.expression.expression, scope).t === "router"
      ) {
        found = true;
        return;
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
    return found;
  }

  /** True when `node` calls a function the repository declares. */
  private callsLocal(node: ts.Node, scope: Scope): boolean {
    let found = false;
    const visit = (n: ts.Node): void => {
      if (found) return;
      if (ts.isCallExpression(n)) {
        const callee = unwrap(n.expression);
        if (
          ts.isIdentifier(callee) &&
          this.lookup(callee.text, scope).t === "function"
        ) {
          found = true;
          return;
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
    return found;
  }

  private execForOf(s: ts.ForOfStatement, scope: Scope): void {
    const init = s.initializer;
    const iterable = this.evaluate(s.expression, scope);
    const single =
      ts.isVariableDeclarationList(init) && init.declarations.length === 1
        ? init.declarations[0]
        : undefined;
    const variable =
      single && ts.isIdentifier(single.name) ? single.name.text : undefined;

    if (iterable.t !== "array" || variable === undefined) {
      // A loop that has nothing to do with routes is none of this file's business.
      if (
        this.touchesRouter(s.statement, scope) ||
        this.callsLocal(s.statement, scope)
      ) {
        throw refuse(
          s,
          `A loop that may register routes runs over \`${s.expression.getText()}\`, which cannot be enumerated`,
        );
      }
      return;
    }
    for (const item of iterable.items) {
      const inner = new Scope(scope.file, scope);
      inner.vars.set(variable, item);
      this.execStatement(s.statement, inner);
    }
  }

  private execCall(call: ts.CallExpression, scope: Scope): void {
    const callee = unwrap(call.expression);

    if (ts.isPropertyAccessExpression(callee)) {
      const name = callee.name.text;
      if (!REGISTERS.has(name)) return;
      const receiver = this.evaluate(callee.expression, scope);
      // `map.get(...)`, `res.set(...)`, `cache.delete(...)`: not a router.
      if (receiver.t !== "router") return;
      this.visited.add(call);

      if (UNMODELLED.has(name)) {
        throw refuse(
          call,
          `\`.${name}(...)\` registers routes in a form not modelled here`,
        );
      }
      if (name === "use") {
        this.execUse(receiver.r, call, scope);
        return;
      }

      const arg = call.arguments[0];
      const path = arg ? this.evaluate(arg, scope) : UNKNOWN;
      const method = METHODS.find((m) => m === name.toUpperCase());
      if (!arg || path.t !== "string" || method === undefined) {
        throw refuse(
          call,
          `The path of \`.${name}(${arg ? arg.getText() : ""})\` cannot be evaluated`,
        );
      }
      const written = unwrap(arg);
      receiver.r.items.push({
        kind: "route",
        route: {
          method,
          path: path.v,
          file: scope.file,
          line: lineOf(call),
          derived:
            !ts.isStringLiteral(written) &&
            !ts.isNoSubstitutionTemplateLiteral(written),
        },
      });
      return;
    }

    if (ts.isIdentifier(callee)) {
      const fn = this.lookup(callee.text, scope);
      if (fn.t === "function") this.enter(fn, call.arguments, scope, true);
    }
  }

  /** `router.use(...)`: a sub-router, with or without a prefix, or middleware. */
  private execUse(
    router: RouterNode,
    call: ts.CallExpression,
    scope: Scope,
  ): void {
    let args = [...call.arguments];
    let prefix = "";
    const first = args[0];
    if (first) {
      if (ts.isRegularExpressionLiteral(unwrap(first))) {
        throw refuse(
          call,
          "A `use` mounted on a regular expression is not modelled here",
        );
      }
      const v = this.evaluate(first, scope);
      if (v.t === "string") {
        prefix = v.v === "/" ? "" : v.v;
        args = args.slice(1);
      }
    }
    for (const arg of args) {
      const v = this.evaluate(arg, scope);
      if (v.t === "router") {
        router.items.push({ kind: "mount", prefix, child: v.r });
      }
    }
  }
}

/** Every route the app serves, in match order, and those declared on the app itself. */
export function routesOf(source: RepoSource): {
  all: Endpoint[];
  app: Endpoint[];
} {
  const files = inventoryFiles(source);
  return new RouterProgram(new Set(files), (f) => source.read(f)).routes();
}

/* ----------------------------------------------------------- the inventory */

/** Build the structured inventory. `backendApiMarkdown` is this, printed. */
export function inventoryOf(source: RepoSource): BackendInventory {
  const files = inventoryFiles(source);
  const { all, app } = routesOf(source);

  const empty = (): Group => ({
    files: 0,
    entries: [],
    unlisted: [],
    functions: 0,
    endpoints: [],
  });
  const groups = new Map<string, Group>();
  const shared = empty();
  const groupFor = (name: string | undefined): Group => {
    if (name === undefined) return shared;
    let group = groups.get(name);
    if (!group) {
      group = empty();
      groups.set(name, group);
    }
    return group;
  };

  for (const file of files) {
    const group = groupFor(moduleOf(file));
    group.files += 1;
    const entry = entryOf(file, source.read(file));
    if (entry) {
      group.entries.push(entry);
      group.functions += entry.functions.length;
    } else {
      group.unlisted.push(file);
    }
  }
  for (const endpoint of all) {
    const name = moduleOf(endpoint.file);
    // A route outside every module is the app's own, and is returned apart.
    if (name !== undefined) groupFor(name).endpoints.push(endpoint);
  }

  const modules = [...groups.entries()]
    .map(([name, group]) => ({ name, ...group }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { modules, shared, appRoutes: app };
}

/* ------------------------------------------------------------ the document */

const code = (s: string): string => `\`${s}\``;
const DASH = "—";

function fileTable(group: Group): string {
  const rows = group.entries.map((e) => [
    code(e.path),
    names(e.functions),
    alsoCell(e),
  ]);
  const out = [table(["File", "Exported functions", "Also"], rows)];
  if (group.unlisted.length > 0) {
    out.push(
      "",
      `_No exports of their own, so not listed:_ ${names(group.unlisted)}.`,
    );
  }
  return out.join("\n");
}

function endpointTable(endpoints: readonly Endpoint[]): string {
  return table(
    ["Method", "Path"],
    endpoints.map((e) => [code(e.method), code(e.path)]),
  );
}

/**
 * The whole document.
 *
 * `modulePurpose` maps a folder under `src/modules` to the sentence under its
 * heading; pass `MODULE_PURPOSE`, or that with additions. Tables are not padded:
 * run the result through prettier.
 */
export function backendApiMarkdown(
  source: RepoSource,
  modulePurpose: Record<string, string>,
): string {
  const inv = inventoryOf(source);
  const heading = (name: string): string => `src/modules/${name}`;

  const groups: Group[] = [...inv.modules, inv.shared];
  const files = groups.reduce((n, g) => n + g.files, 0);
  const functions = groups.reduce((n, g) => n + g.functions, 0);
  const endpoints = inv.modules.reduce((n, m) => n + m.endpoints.length, 0);
  const orDash = (n: number): string => (n > 0 ? String(n) : DASH);

  const summary = [
    ...inv.modules.map((m) => [
      `[${code(heading(m.name))}](#${slug(heading(m.name))})`,
      String(m.files),
      String(m.functions),
      orDash(m.endpoints.length),
    ]),
    [
      `[${SHARED_HEADING}](#${slug(SHARED_HEADING)})`,
      String(inv.shared.files),
      String(inv.shared.functions),
      DASH,
    ],
    [
      "**Total**",
      `**${String(files)}**`,
      `**${String(functions)}**`,
      `**${String(endpoints)}**`,
    ],
  ];

  const out: string[] = [
    `# ${TITLE}`,
    "",
    "_Repo:_ `approvehr-backend` · _Generated from_ `src/**/*.ts` (tests excluded)",
    "",
    `_Snapshot:_ ${source.describe} · regenerate with \`npm run docs\`, never by hand`,
    "",
    ...INTRO,
    "",
    table(["Module", "Files", "Exported functions", "Endpoints"], summary, [
      "left",
      "right",
      "right",
      "right",
    ]),
    "",
    "---",
    "",
  ];

  for (const m of inv.modules) {
    out.push(`## ${code(heading(m.name))}`, "");
    const purpose = modulePurpose[m.name];
    if (purpose) out.push(purpose, "");
    out.push(fileTable(m), "");
    if (m.endpoints.length > 0) {
      out.push(
        `**Endpoints — ${String(m.endpoints.length)}**`,
        "",
        endpointTable(m.endpoints),
        "",
      );
    }
    out.push("---", "");
  }

  out.push(
    `## ${SHARED_HEADING}`,
    "",
    SHARED_PURPOSE,
    "",
    fileTable(inv.shared),
  );
  return `${out.join("\n")}\n`;
}
