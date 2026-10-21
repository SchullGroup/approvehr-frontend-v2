import { describe, expect, it } from "vitest";
import {
  backendApiMarkdown,
  inventoryOf,
  routesOf,
} from "../scripts/docs/backend-api";
import type { RepoSource } from "../scripts/docs/source";

/**
 * What the API inventory's route interpreter follows, and what it refuses.
 *
 * `scripts/docs/backend-api.ts` finds endpoints by executing the wiring from
 * `app.ts` over a small subset of TypeScript. That is only worth having if it
 * is exact where it understands the code and loud where it does not, so each
 * case here is one of those two claims on a hand-made repository.
 *
 * The real backend is not read: the generator is checked against it by running
 * it on the commit the first inventory described (`npm run docs` documents how),
 * and this file is what keeps the interpreter honest between those runs.
 */

const repo = (files: Record<string, string>): RepoSource => ({
  files: () => Object.keys(files).sort(),
  read: (path) => {
    const text = files[path];
    if (text === undefined) throw new Error(`no ${path}`);
    return text;
  },
  describe: "synthetic",
});

/** `app.ts` as the backend writes it: an app, a `v1` router, and what is mounted on them. */
const app = (mounts: string, imports = "", extra = "") => `
import express from "express";
${imports}
export function createApp() {
  const app = express();
  app.get("/health", (_req, res) => res.end());
  const v1 = express.Router();
  ${mounts}
  app.use("/api/v1", v1);
  ${extra}
  return app;
}
`;

const ROUTER = `import { Router } from "express";`;

/** The routes in module files, as `METHOD path`, in the order Express would match them. */
const paths = (source: RepoSource) =>
  routesOf(source)
    .all.filter((route) => route.file !== "src/app.ts")
    .map((route) => `${route.method} ${route.path}`);

/** A module `a` mounted at `/a`, with a router body of the test's choosing. */
const withRouter = (body: string, mount = `v1.use("/a", aRouter);`) =>
  repo({
    "src/app.ts": app(
      mount,
      `import { aRouter } from "./modules/a/router.js";`,
    ),
    "src/modules/a/router.ts": `${ROUTER}\nexport const aRouter = Router();\n${body}`,
  });

describe("what the interpreter follows", () => {
  it("follows mounts, sub-routers and prefix-less use, keeps a root slash, drops /api/v1 and keeps /admin", () => {
    const source = repo({
      "src/app.ts": app(
        `v1.use("/a", aRouter);\n  v1.use("/b/deep", bRouter);`,
        `import { aRouter } from "./modules/a/router.js";\nimport { bRouter } from "./modules/b/router.js";\nimport { adminRouter } from "./modules/admin/router.js";`,
        `app.use("/admin", adminRouter);`,
      ),
      "src/modules/a/router.ts": `
        ${ROUTER}
        import { childRouter } from "./child.js";
        export const aRouter = Router();
        const pub = Router();
        pub.get("/open", h);
        aRouter.get("/", h);
        aRouter.use("/public", pub);
        aRouter.use(childRouter);
        aRouter.post("/x/:id", h);
      `,
      "src/modules/a/child.ts": `
        ${ROUTER}
        export const childRouter = Router();
        childRouter.delete("/kid", h);
      `,
      "src/modules/b/router.ts": `
        ${ROUTER}
        export const bRouter = Router();
        bRouter.put("/", h);
      `,
      "src/modules/admin/router.ts": `
        ${ROUTER}
        export const adminRouter = Router();
        adminRouter.get("/login", h);
      `,
    });
    expect(paths(source)).toEqual([
      "GET /a/",
      "GET /a/public/open",
      "DELETE /a/kid",
      "POST /a/x/:id",
      "PUT /b/deep/",
      "GET /admin/login",
    ]);
  });

  it("returns routes declared on the app itself apart, and gives them to no module", () => {
    const source = repo({
      "src/app.ts": app(
        `v1.use("/a", aRouter);`,
        `import { aRouter } from "./modules/a/router.js";`,
      ),
      "src/modules/a/router.ts": `${ROUTER}\nexport const aRouter = Router();\naRouter.get("/x", h);`,
    });
    const inventory = inventoryOf(source);
    expect(inventory.appRoutes.map((route) => route.path)).toEqual(["/health"]);
    // Not vacuous: there is a module, and the one route in it is its own.
    expect(inventory.modules.map((group) => group.name)).toEqual(["a"]);
    for (const group of inventory.modules) {
      expect(group.endpoints).toHaveLength(1);
      for (const endpoint of group.endpoints) {
        expect(endpoint.file.startsWith(`src/modules/${group.name}/`)).toBe(
          true,
        );
      }
    }
  });

  it("counts a file with no exports of its own, and names it under the table instead of listing it", () => {
    const source = repo({
      "src/app.ts": app(``),
      "src/server.ts": `import { createApp } from "./app.js";\ncreateApp().listen(1);`,
      "src/lib/y.ts": `export const y = 1;`,
    });
    const markdown = backendApiMarkdown(source, {});
    const shared = markdown.slice(markdown.indexOf("## Shared"));
    expect(markdown).toContain(
      "| [Shared — everything outside `src/modules`](#shared--everything-outside-srcmodules) | 3 | 1 | — |",
    );
    expect(shared).not.toContain("| `src/server.ts` |");
    expect(shared).toContain(
      "_No exports of their own, so not listed:_ `src/server.ts`.",
    );
  });

  it("resolves a loop over a registry in another file, through four files, and skips what is never registered", () => {
    const source = repo({
      "src/app.ts": app(
        `v1.use("/imp", impRouter);`,
        `import { impRouter } from "./modules/imp/router.js";`,
      ),
      "src/modules/imp/router.ts": `
        ${ROUTER}
        import * as reg from "./registry.js";
        export const impRouter = Router();
        for (const e of reg.ALL) { impRouter.get(\`/t/\${e.slug}\`, h); }
        impRouter.get("/", h);
        function mount(e: reg.Entity) { impRouter.post(\`/\${e.slug}/go\`, h); }
        for (const e of reg.ALL) mount(e);
      `,
      "src/modules/imp/registry.ts": `
        import { ONE, TWO } from "./entities.js";
        export type Entity = { slug: string };
        export function register(entity: { dictionary: { slug: string } }): Entity {
          return { slug: entity.dictionary.slug };
        }
        export const ALL: readonly Entity[] = [register(ONE), ...[register(TWO)]];
      `,
      "src/modules/imp/entities.ts": `
        import { dict } from "./dict.js";
        export const ONE = { dictionary: dict("alpha") };
        const TWO_DICT = dict("beta-gamma");
        export const TWO = { dictionary: TWO_DICT } as const;
        export const NEVER_REGISTERED = { dictionary: dict("ghost") };
      `,
      "src/modules/imp/dict.ts": `
        export function dict(slug: string) { const x = 1; return { slug, x }; }
      `,
    });
    expect(paths(source)).toEqual([
      "GET /imp/t/alpha",
      "GET /imp/t/beta-gamma",
      "GET /imp/",
      "POST /imp/alpha/go",
      "POST /imp/beta-gamma/go",
    ]);
    // The four built from a loop variable are the ones a pattern over string
    // literals cannot see, and the document says so.
    expect(routesOf(source).all.filter((route) => route.derived)).toHaveLength(
      4,
    );
  });

  it("reaches routers through `export *`, a renamed re-export, a default export and `export { x as y }`", () => {
    const source = repo({
      "src/app.ts": app(
        `v1.use("/star", starRouter);\n  v1.use("/renamed", renamedRouter);\n  v1.use("/dflt", dfltRouter);\n  v1.use("/alias", aliasRouter);`,
        `import { starRouter } from "./modules/star/index.js";\nimport { renamedRouter } from "./modules/ren/index.js";\nimport dfltRouter from "./modules/dflt/router.js";\nimport { aliasRouter } from "./modules/alias/router.js";`,
      ),
      "src/modules/star/index.ts": `export * from "./router.js";`,
      "src/modules/star/router.ts": `${ROUTER}\nexport const starRouter = Router();\nstarRouter.get("/s", h);`,
      "src/modules/ren/index.ts": `export { inner as renamedRouter } from "./router.js";`,
      "src/modules/ren/router.ts": `${ROUTER}\nexport const inner = Router();\ninner.get("/r", h);`,
      "src/modules/dflt/router.ts": `${ROUTER}\nconst router = Router();\nrouter.get("/d", h);\nexport default router;`,
      "src/modules/alias/router.ts": `${ROUTER}\nconst local = Router();\nlocal.get("/a", h);\nexport { local as aliasRouter };`,
    });
    expect(paths(source)).toEqual([
      "GET /star/s",
      "GET /renamed/r",
      "GET /dflt/d",
      "GET /alias/a",
    ]);
  });

  it("escapes a pipe in a route path, because it would end the table cell", () => {
    const source = repo({
      "src/app.ts": app(
        `v1.use("/p", pRouter);`,
        `import { pRouter } from "./modules/p/router.js";`,
      ),
      "src/modules/p/router.ts": `${ROUTER}\nexport const pRouter = Router();\npRouter.get("/:kind(a|b)", h);`,
    });
    expect(backendApiMarkdown(source, {})).toContain(
      "| `GET` | `/p/:kind(a\\|b)` |",
    );
  });

  it("lists hooks and functions as one list in source order, once each, and does not call `userId` a hook", () => {
    const source = repo({
      "src/app.ts": app(``),
      "src/lib/x.ts": `
        export function b() {}
        export const useThing = () => 1;
        export function a() {}
        export function a(x: number): void;
        function late() {}
        export { late };
        export const userId = 5;
      `,
    });
    const first = backendApiMarkdown(source, {});
    expect(backendApiMarkdown(source, {})).toBe(first);
    const row = first.split("\n").find((l) => l.startsWith("| `src/lib/x.ts`"));
    expect(row).toBe(
      "| `src/lib/x.ts` | `b`, `useThing`, `a`, `late` | 1 const |",
    );
  });
});

describe("what the interpreter refuses", () => {
  // An inventory that quietly leaves a route out is the failure this exists to
  // prevent, so each of these must stop the run and say where.
  it("refuses a route inside an `if`", () => {
    expect(() =>
      routesOf(withRouter(`if (process.env.X) { aRouter.get("/x", h); }`)),
    ).toThrow(/control flow/);
  });

  it("refuses a `.route()` chain", () => {
    expect(() => routesOf(withRouter(`aRouter.route("/x").get(h);`))).toThrow(
      /not modelled/,
    );
  });

  it("refuses `.all()`", () => {
    expect(() => routesOf(withRouter(`aRouter.all("/x", h);`))).toThrow(
      /not modelled/,
    );
  });

  it("refuses a path it cannot evaluate, naming the call", () => {
    const source = repo({
      "src/app.ts": app(
        `v1.use("/a", aRouter);`,
        `import { aRouter } from "./modules/a/router.js";`,
      ),
      "src/modules/a/router.ts": `${ROUTER}\nimport { PATH } from "somewhere-else";\nexport const aRouter = Router();\naRouter.get(PATH, h);`,
    });
    expect(() => routesOf(source)).toThrow(/cannot be evaluated/);
  });

  it("refuses a route call inside a callback no walk reaches", () => {
    expect(() =>
      routesOf(withRouter(`[1, 2].forEach(() => { aRouter.get("/x", h); });`)),
    ).toThrow(/never executed/);
  });

  it("refuses a loop over something it cannot enumerate when the loop registers routes", () => {
    expect(() =>
      routesOf(
        withRouter(
          `import_something(); for (const x of mystery()) aRouter.get(\`/\${x}\`, h);`,
        ),
      ),
    ).toThrow(/cannot be enumerated/);
  });

  it("refuses a router that has routes and is never mounted", () => {
    const source = repo({
      "src/app.ts": app(
        `v1.use("/a", aRouter);`,
        `import { aRouter } from "./modules/a/router.js";`,
      ),
      "src/modules/a/router.ts": `${ROUTER}\nexport const aRouter = Router();\nexport const orphan = Router();\naRouter.get("/ok", h);\norphan.get("/lost", h);`,
    });
    expect(() => routesOf(source)).toThrow(/never mounted/);
  });

  it("refuses a file that creates a router no mount reaches", () => {
    const source = repo({
      "src/app.ts": app(
        `v1.use("/a", aRouter);`,
        `import { aRouter } from "./modules/a/router.js";`,
      ),
      "src/modules/a/router.ts": `${ROUTER}\nexport const aRouter = Router();\naRouter.get("/ok", h);`,
      "src/modules/zombie/router.ts": `${ROUTER}\nexport const zombieRouter = Router();\nzombieRouter.get("/boo", h);`,
    });
    expect(() => routesOf(source)).toThrow(
      /nothing mounted from app\.ts reaches/,
    );
  });

  it("refuses a router mounted inside itself", () => {
    expect(() =>
      routesOf(withRouter(`aRouter.use("/loop", aRouter);`)),
    ).toThrow(/inside itself/);
  });
});
