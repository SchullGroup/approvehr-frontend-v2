/**
 * The component-and-function inventories: `docs/components/frontend-v2.md` and
 * `docs/components/landing-frontend.md`.
 *
 * One engine and one spec per repository. A spec says how a repository's files
 * are grouped and what each group is for; the engine does the rest — walk
 * `src`, classify every export (`exports.ts`), and print a table per group.
 *
 * Why the groups are code and not a convention: they decide where somebody
 * looks. "Is there already a component for this" is answered by scanning one
 * group, so a file in the wrong group is a component nobody finds, which is the
 * failure these files exist to prevent. The order below is the order a reader
 * meets them, and the first group that claims a file keeps it.
 */

import { isBarrel, parse, symbolsOf, type Symbols } from "./exports";
import { alsoCell, names, slug, table } from "./markdown";
import type { RepoSource } from "./source";

export interface Group {
  title: string;
  blurb: string;
  has(path: string): boolean;
}

export interface ComponentsSpec {
  title: string;
  repo: string;
  /** What the first line says the inventory was generated from. */
  from: string;
  intro: string;
  groups: Group[];
}

const under =
  (...prefixes: string[]) =>
  (path: string) =>
    prefixes.some((p) => path.startsWith(p));

/** `src/app/(app)/<module>/…` — one screens group per module that has one. */
const screensOf = (mod: string): Group => ({
  title: `Screens — \`/${mod}\``,
  blurb: `Screen components for the ${mod} module, including its dialogs and panels.`,
  has: under(`src/app/(app)/${mod}/`),
});

/**
 * Modules under `src/app/(app)` that get a group of their own. The rest — a
 * profile page, a notifications list, an equipment page — are one or two files
 * each and share the group after them. A module earns its own once it is large
 * enough that finding a file in a shared list is the slow part.
 */
export const SCREEN_MODULES = [
  "dashboard",
  "people",
  "payroll",
  "performance",
  "hiring",
  "projects",
  "help",
  "reports",
  "settings",
  "approvals",
  "assistant",
] as const;

export const FRONTEND_V2: ComponentsSpec = {
  title: "Components and functions — ApproveHR frontend v2",
  repo: "approvehr-frontend-v2",
  from: "`src/**/*.{ts,tsx}` (tests and type declarations excluded)",
  intro: [
    "Every exported symbol, grouped by what it is for. **Components** render; **hooks** start with `use` and",
    "hold state or data; **functions** are plain callables. Constants and types are counted rather than listed —",
    "there are too many to be useful as a list, and they are always in the file named beside the count.",
    "",
    "Barrel files — an `index.ts` that only re-exports — are left out: they declare nothing of their own, and",
    "listing what they forward would list every symbol twice. A `forwardRef` or `memo` component counts as a",
    "component, and so does a symbol exported through an `export { … }` list.",
  ].join("\n"),
  groups: [
    {
      title: "Design system — `src/components/ui`",
      blurb:
        "The signed-in app's component library. Import from the barrel `@/components/ui`; check `index.ts` for the exported surface before assuming a prop exists.",
      has: under("src/components/ui/"),
    },
    {
      title: "App chrome — `src/components/portal`",
      blurb:
        "The shell every signed-in screen sits inside: sidebar, page header, sign-in gate, the shared failure and export controls.",
      has: under("src/components/portal/"),
    },
    {
      title: "Marketing components — `src/components/marketing`",
      blurb:
        "A deliberately separate visual language for the public site. Do not cross-import between this and the design system above.",
      has: under("src/components/marketing/"),
    },
    {
      title: "Module components — `src/components/*`",
      blurb:
        "Shared pieces owned by one module but used from more than one screen.",
      has: under("src/components/"),
    },
    {
      title: "API wrappers — `src/lib/api`",
      blurb:
        "One typed wrapper per endpoint, plus the kobo-to-naira boundary and the shared error classifier. Nothing here renders.",
      has: under("src/lib/api/"),
    },
    {
      title: "Data hooks — `src/lib/store`",
      blurb:
        "How a screen asks for data. Each hook picks its own source — the API when one answers, local storage in demo mode — so screens do not care which. Every `useX()` returns a new object each render; never put one in a dependency array.",
      has: under("src/lib/store/"),
    },
    {
      title: "Seed data — `src/lib/mock`",
      blurb:
        "The day-one dataset for demo mode. Gated out of a production build entirely.",
      has: under("src/lib/mock/"),
    },
    {
      title: "Domain helpers — `src/lib/*`",
      blurb:
        "Pure logic with no React in it: payroll settings, the import framework, CSV and XLSX, the review-language checker, permissions.",
      has: under("src/lib/"),
    },
    {
      title: "Standalone hooks — `src/hooks`",
      blurb: "Generic hooks not tied to one data source.",
      has: under("src/hooks/"),
    },
    ...SCREEN_MODULES.map(screensOf),
    {
      title: "Screens — the rest of the signed-in app",
      blurb: "Everything else under `src/app/(app)`.",
      has: under("src/app/(app)/"),
    },
    {
      title: "Screens — full-window, `(focus)`",
      blurb:
        "Screens that take the whole window, with no sidebar and no top bar. Today that is answering a review one question at a time.",
      has: under("src/app/(focus)/"),
    },
    {
      title: "Screens — public site, auth and setup",
      blurb:
        "`src/app/(marketing)`, `src/app/(auth)`, `src/app/(setup)` and the root files.",
      has: under("src/app/"),
    },
    {
      title: "Everything else",
      blurb:
        "Files outside `src/app`, `src/lib`, `src/components` and `src/hooks`.",
      has: () => true,
    },
  ],
};

export const LANDING: ComponentsSpec = {
  title: "Components and functions — ApproveHR landing site",
  repo: "aprrovehr-frontend",
  from: "`src/**/*.{ts,tsx}`",
  intro:
    "The smallest of the three frontends. Every exported symbol, grouped by folder.",
  groups: [
    {
      title: "Layout — `src/layout`",
      blurb: "The marketing shell: nav, footer, page frame.",
      has: under("src/layout/"),
    },
    {
      title: "Components — `src/components`",
      blurb: "Sections, cards, mockups and the page transition wrapper.",
      has: under("src/components/"),
    },
    {
      title: "Pages — `src/pages`",
      blurb: "One folder per screen.",
      has: under("src/pages/"),
    },
    {
      title: "Content — `src/data`",
      blurb:
        "The words and figures the site renders. Nothing here is fabricated proof.",
      has: under("src/data/"),
    },
    {
      title: "Helpers — `src/lib`, `src/services`",
      blurb: "Formatting, the careers API client and anything else shared.",
      has: under("src/lib/", "src/services/"),
    },
    {
      title: "Everything else",
      blurb: "Entry points and loose files.",
      has: () => true,
    },
  ],
};

const SOURCE_FILE = /\.tsx?$/;
const NOT_INVENTORIED = /\.d\.ts$|\.(test|spec)\.tsx?$/;

interface Row {
  path: string;
  symbols: Symbols;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * A folder's own files first, then its subfolders, each ordered the same way.
 * It is how a file tree reads, and it keeps `src/lib/csv.ts` with the other
 * helpers rather than after every file in `src/lib/audit/`.
 */
export function byTree(a: string, b: string): number {
  const x = a.split("/");
  const y = b.split("/");
  for (let i = 0; ; i += 1) {
    const aLeaf = i === x.length - 1;
    const bLeaf = i === y.length - 1;
    if (aLeaf !== bLeaf) return aLeaf ? -1 : 1;
    const order = compare(x[i]!, y[i]!);
    if (order !== 0 || aLeaf) return order;
  }
}

export function componentsMarkdown(
  source: RepoSource,
  spec: ComponentsSpec,
): string {
  const rows: Row[] = [];
  for (const path of source.files()) {
    if (!SOURCE_FILE.test(path) || NOT_INVENTORIED.test(path)) continue;
    const sf = parse(path, source.read(path));
    if (isBarrel(sf)) continue;
    rows.push({ path, symbols: symbolsOf(sf) });
  }

  const byGroup = spec.groups.map(() => [] as Row[]);
  for (const row of rows) {
    const at = spec.groups.findIndex((g) => g.has(row.path));
    if (at < 0) throw new Error(`No group claims ${row.path}.`);
    byGroup[at]!.push(row);
  }

  const total = { files: 0, components: 0, hooks: 0, functions: 0 };
  const summary: string[][] = [];
  const sections: string[] = [];

  spec.groups.forEach((group, i) => {
    const mine = byGroup[i]!;
    if (mine.length === 0) return;
    mine.sort((a, b) => byTree(a.path, b.path));

    const sum = (pick: (s: Symbols) => string[]) =>
      mine.reduce((n, r) => n + pick(r.symbols).length, 0);
    const c = sum((s) => s.components);
    const h = sum((s) => s.hooks);
    const f = sum((s) => s.functions);
    total.files += mine.length;
    total.components += c;
    total.hooks += h;
    total.functions += f;
    summary.push([
      `[${group.title}](#${slug(group.title)})`,
      String(mine.length),
      String(c),
      String(h),
      String(f),
    ]);

    sections.push(
      [
        `## ${group.title}`,
        group.blurb,
        table(
          ["File", "Components", "Hooks", "Functions", "Also"],
          mine.map((r) => [
            `\`${r.path}\``,
            names(r.symbols.components),
            names(r.symbols.hooks),
            names(r.symbols.functions),
            alsoCell(r.symbols),
          ]),
        ),
      ].join("\n\n"),
    );
  });

  summary.push([
    "**Total**",
    `**${total.files}**`,
    `**${total.components}**`,
    `**${total.hooks}**`,
    `**${total.functions}**`,
  ]);

  return (
    [
      `# ${spec.title}`,
      `_Repo:_ \`${spec.repo}\` · _Generated from_ ${spec.from}`,
      `_Snapshot:_ ${source.describe} · regenerate with \`npm run docs\`, never by hand`,
      spec.intro,
      table(["Group", "Files", "Components", "Hooks", "Functions"], summary, [
        "left",
        "right",
        "right",
        "right",
        "right",
      ]),
      "---",
      sections.join("\n\n---\n\n"),
    ].join("\n\n") + "\n"
  );
}
