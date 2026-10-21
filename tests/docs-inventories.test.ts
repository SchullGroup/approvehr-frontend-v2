import { describe, expect, it } from "vitest";
import { alsoCell, slug } from "../scripts/docs/markdown";
import {
  byTree,
  componentsMarkdown,
  type ComponentsSpec,
} from "../scripts/docs/components";
import { isBarrel, parse, symbolsOf } from "../scripts/docs/exports";
import {
  metadataOf,
  pagesMarkdown,
  redirectsOf,
  routeOf,
} from "../scripts/docs/pages";
import type { RepoSource } from "../scripts/docs/source";

/**
 * The generators behind `docs/pages` and `docs/components`.
 *
 * These files are what `CLAUDE.md` tells everybody to search before writing a
 * second copy of something, so a row in the wrong column or a missing route is
 * the failure they exist to prevent. The cases are the rules the generators
 * state, each on a snippet small enough to read, and the ones that were wrong in
 * the first, hand-made version of the inventory: a `forwardRef` component, an
 * `export { a }` list, a page whose title is a fallback.
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

describe("how an export is classified", () => {
  const classify = (path: string, text: string) => symbolsOf(parse(path, text));

  it("sorts by the shape of the declaration and the name", () => {
    const found = classify(
      "x.tsx",
      `
      import { forwardRef, memo } from "react";
      import { imported } from "./other";
      export function useThing() {}
      export function Widget() { return null; }
      export function helper() {}
      export const arrow = () => 1;
      export const Button = forwardRef<HTMLButtonElement>(function Button() { return null; });
      export const Row = memo(function Row() { return null; });
      export const useStore = createStore();
      export const LIMIT = 5;
      export type A = string;
      export interface B {}
      export class Thing {}
      function local() {}
      const Hidden = () => null;
      export { local, Hidden as Shown, imported };
      export default function Page() { return null; }
      `,
    );
    expect(found.components).toEqual([
      "Widget",
      "Button",
      "Row",
      "Shown",
      "Page",
    ]);
    expect(found.hooks).toEqual(["useThing", "useStore"]);
    expect(found.functions).toEqual(["helper", "arrow", "local"]);
    expect(found.classes).toEqual(["Thing"]);
    expect(found.consts).toBe(1);
    expect(found.types).toBe(2);
  });

  it("counts a `forwardRef` or `memo` of a capitalised name as a component, which the first inventory missed", () => {
    const found = classify(
      "x.tsx",
      `export const Input = forwardRef(function Input() { return null; });
       export const Cell = memo(() => null);
       export const helper = memo(() => null);`,
    );
    expect(found.components).toEqual(["Input", "Cell"]);
    // A lower-case wrapped value is not something that renders by that name.
    expect(found.consts).toBe(1);
  });

  it("does not list what an export list only forwards, because it is counted where it is declared", () => {
    const found = classify(
      "x.ts",
      `import { Shared, useShared } from "./elsewhere";
       export { Shared, useShared };`,
    );
    expect(found.components).toEqual([]);
    expect(found.hooks).toEqual([]);
    expect(found.consts).toBe(0);
  });

  it("never calls anything in a `.ts` file a component", () => {
    const found = classify("x.ts", `export const Thing = () => 1;`);
    expect(found.components).toEqual([]);
    expect(found.functions).toEqual(["Thing"]);
  });

  it("calls a hook by its name however it was made, and `userId` is not one", () => {
    const found = classify(
      "x.ts",
      `export const useStore = createStore();
       export const userId = 5;
       export const useX = () => 1;`,
    );
    expect(found.hooks).toEqual(["useStore", "useX"]);
    expect(found.consts).toBe(1);
  });

  it("leaves a barrel out, and only a barrel", () => {
    const barrel = parse(
      "index.ts",
      `import { a } from "./a";\nexport * from "./a";\nexport { b } from "./b";`,
    );
    expect(isBarrel(barrel)).toBe(true);
    const real = parse(
      "index.ts",
      `export * from "./a";\nexport const own = 1;`,
    );
    expect(isBarrel(real)).toBe(false);
  });
});

describe("the words in a row", () => {
  it("writes what is counted rather than listed", () => {
    expect(alsoCell({ classes: [], consts: 0, types: 0 })).toBe("—");
    expect(alsoCell({ classes: ["A", "B"], consts: 2, types: 1 })).toBe(
      "`A`, `B` (class) · 2 const · 1 type",
    );
    expect(alsoCell({ classes: [], consts: 0, types: 3 })).toBe("3 types");
  });

  it("gives a heading the anchor GitHub does, so a link in the summary table works", () => {
    expect(slug("Design system — `src/components/ui`")).toBe(
      "design-system--srccomponentsui",
    );
    expect(slug("Screens — `/people`")).toBe("screens--people");
  });

  it("orders a folder's own files before its subfolders, as a file tree reads", () => {
    const sorted = [
      "src/lib/audit/a.ts",
      "src/lib/csv.ts",
      "src/lib/b.ts",
      "src/lib/audit/b/c.ts",
    ].sort(byTree);
    expect(sorted).toEqual([
      "src/lib/b.ts",
      "src/lib/csv.ts",
      "src/lib/audit/a.ts",
      "src/lib/audit/b/c.ts",
    ]);
  });
});

describe("a page's title and description", () => {
  it("reads `metadata` as the page states it", () => {
    expect(
      metadataOf(
        `export const metadata = { title: "My approvals", description: "Everything waiting." };`,
      ),
    ).toEqual({ title: "My approvals", description: "Everything waiting." });
  });

  it("reads a literal joined from literals and a constant, and `title: { absolute }`", () => {
    expect(
      metadataOf(
        `const WHAT = "Run an appraisal period";
         export const metadata = { title: { absolute: "Appraisal period" }, description: WHAT + ": set it up." };`,
      ),
    ).toEqual({
      title: "Appraisal period",
      description: "Run an appraisal period: set it up.",
    });
  });

  it("prints nothing for what the page computes, so it never claims a title nobody declared", () => {
    expect(
      metadataOf(
        `export const metadata = { title: someTitle(), description: "Fixed." };`,
      ),
    ).toEqual({ title: null, description: "Fixed." });
    expect(metadataOf(`export default function Page() {}`)).toEqual({
      title: null,
      description: null,
    });
  });

  it("takes a `generateMetadata` value only when it can be known without running it", () => {
    // One return of a literal says what the literal says.
    expect(
      metadataOf(
        `export async function generateMetadata() { return { title: "Candidate", description: "One person." }; }`,
      ),
    ).toEqual({ title: "Candidate", description: "One person." });
    // Several returns agree on a value, or it is not the page's value: "Job" in
    // the branch for a missing advert is a fallback and not a title.
    expect(
      metadataOf(
        `export async function generateMetadata({ params }) {
           const job = await load(params);
           if (!job) return { title: "Job", description: "Not here." };
           return { title: job.title, description: "Not here." };
         }`,
      ),
    ).toEqual({ title: null, description: "Not here." });
  });
});

describe("a route", () => {
  it("is the folder path with the route groups taken out", () => {
    expect(routeOf("src/app/(app)/people/[id]/page.tsx")).toEqual({
      group: "(app)",
      route: "/people/[id]",
    });
    expect(routeOf("src/app/(auth)/auth/sign-in/page.tsx")).toEqual({
      group: "(auth)",
      route: "/auth/sign-in",
    });
    expect(routeOf("src/app/page.tsx")).toEqual({
      group: "(root)",
      route: "/",
    });
    expect(routeOf("src/app/design-system/page.tsx")).toEqual({
      group: "(root)",
      route: "/design-system",
    });
  });
});

describe("the pages inventory", () => {
  const PROXY = `
    const APP_ENTRY = "/dashboard";
    const REDIRECTED_PATHS = new Set(["/demo"]);
    const REDIRECTED_PREFIXES = ["/product"];
    export function proxy(request) {
      if (request.nextUrl.pathname === "/") return redirect(APP_ENTRY);
    }
  `;
  const page = (title: string) =>
    `export const metadata = { title: "${title}", description: "About ${title}." };\nexport default function P() { return null; }`;

  const source = repo({
    "src/proxy.ts": PROXY,
    "src/app/page.tsx": page("Home"),
    "src/app/(app)/approvals/page.tsx": page("My approvals"),
    "src/app/(marketing)/demo/page.tsx": page("Demo"),
    "src/app/(marketing)/pricing/page.tsx": page("Pricing"),
    "src/app/(marketing)/product/[module]/page.tsx": page("Product"),
  });
  const markdown = pagesMarkdown(source);
  const row = (route: string) =>
    markdown.split("\n").find((line) => line.startsWith(`| \`${route}\``)) ??
    "";

  it("reads what the proxy retires from its own constants", () => {
    const redirects = redirectsOf(source);
    expect([...redirects.outward]).toEqual(["/demo"]);
    expect(redirects.prefixes).toEqual(["/product"]);
    expect(redirects.inward).toBe("/dashboard");
  });

  it("reads the lists from lib/marketing/redirected.ts once the proxy imports them", () => {
    /* #439 moved `REDIRECTED_PATHS` out of the proxy so the footer links and the
       proxy read one list. The generator went on reading the proxy, found
       nothing, and the next regeneration would have dropped "Retired here" from
       every one of those routes while they still redirected. */
    const moved = repo({
      "src/proxy.ts": `
        import { isRedirectedOffSite } from "@/lib/marketing/redirected";
        const APP_ENTRY = "/dashboard";
        export function proxy(request) {
          if (request.nextUrl.pathname === "/") return redirect(APP_ENTRY);
        }
      `,
      "src/lib/marketing/redirected.ts": `
        export const REDIRECTED_PATHS: ReadonlySet<string> = new Set(["/demo", "/privacy"]);
        export const REDIRECTED_PREFIXES: readonly string[] = ["/product"];
      `,
    });
    const redirects = redirectsOf(moved);
    expect([...redirects.outward]).toEqual(["/demo", "/privacy"]);
    expect(redirects.prefixes).toEqual(["/product"]);
    expect(redirects.inward).toBe("/dashboard");
  });

  it("marks a route the application does not serve, and leaves the rest alone", () => {
    expect(row("/demo")).toContain("Retired here");
    expect(row("/product/[module]")).toContain("Retired here");
    expect(row("/")).toContain("sends it to `/dashboard`");
    expect(row("/pricing")).not.toContain("Retired");
    expect(row("/approvals")).not.toContain("Retired");
  });

  it("counts the pages and groups them", () => {
    expect(markdown).toContain("**5 pages** in total.");
    expect(markdown).toContain("## (app) — The signed-in product");
    expect(markdown).toContain("### Approvals inbox");
  });

  it("refuses a route group it has no heading for, rather than dropping its pages", () => {
    expect(() =>
      pagesMarkdown(repo({ "src/app/(mystery)/x/page.tsx": page("X") })),
    ).toThrow(/No heading for route group \(mystery\)/);
  });
});

describe("the components inventory", () => {
  const spec: ComponentsSpec = {
    title: "Components — test",
    repo: "test",
    from: "`src`",
    intro: "Intro.",
    groups: [
      {
        title: "UI",
        blurb: "The library.",
        has: (path) => path.startsWith("src/ui/"),
      },
      { title: "Everything else", blurb: "Loose files.", has: () => true },
    ],
  };
  const source = repo({
    "src/ui/index.ts": `export * from "./button";`,
    "src/ui/button.tsx": `export const Button = forwardRef(function Button() { return null; });\nexport type Props = {};`,
    "src/ui/sub/chip.tsx": `export function Chip() { return null; }`,
    "src/ui/button.test.tsx": `export const ignored = 1;`,
    "src/types.d.ts": `export const ignored = 1;`,
    "src/lib/csv.ts": `export function parse() {}\nexport const useX = () => 1;`,
  });
  const markdown = componentsMarkdown(source, spec);

  it("totals what it lists, leaving out a barrel, a test and a declaration file", () => {
    expect(markdown).toContain("| **Total** | **3** | **2** | **1** | **1** |");
  });

  it("puts a folder's own files before its subfolders, and says what is counted rather than listed", () => {
    const rows = markdown
      .split("\n")
      .filter((line) => line.startsWith("| `src/ui/"));
    expect(rows.map((r) => r.split("|")[1]?.trim())).toEqual([
      "`src/ui/button.tsx`",
      "`src/ui/sub/chip.tsx`",
    ]);
    expect(rows[0]).toContain("1 type");
  });

  it("stops rather than leaving a file out when no group claims it", () => {
    const strict: ComponentsSpec = { ...spec, groups: [spec.groups[0]!] };
    expect(() => componentsMarkdown(source, strict)).toThrow(
      /No group claims src\/lib\/csv\.ts/,
    );
  });
});
