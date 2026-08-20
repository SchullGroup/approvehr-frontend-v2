/**
 * Export the public marketing site as a standalone Next.js project.
 *
 * Why a script rather than a hand-maintained second copy: the public repo and
 * `web/` would drift within a week otherwise, and a stale privacy policy or a
 * pricing page quoting last month's tiers is worse than no public repo at all.
 * Run this, commit the result, and the two are identical by construction.
 *
 *   npx tsx scripts/export-marketing.ts [targetDir]
 *
 * Defaults to `../../approvehr-marketing` (a sibling of the ApproveHR repo, so
 * it is never nested inside this git worktree).
 *
 * The script is destructive inside the directories it owns (`src/`, `public/`
 * and the generated config files) and leaves everything else in the target
 * alone — crucially `.git`, so re-exporting into a cloned repo just shows up as
 * a diff. It refuses to touch a target that looks like anything other than a
 * previous export or an empty/fresh directory.
 *
 * The last stage is a set of assertions, and they are the point of the whole
 * file: if someone reaches from a marketing component into `@/components/ui`,
 * `@/lib/payroll` or the app routes, the export fails loudly here rather than
 * shipping a public repo that cannot build.
 */

import fs from "node:fs";
import path from "node:path";

const WEB_ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_TARGET = path.resolve(WEB_ROOT, "..", "..", "approvehr-marketing");
const TARGET = path.resolve(process.argv[2] ?? DEFAULT_TARGET);

/* -------------------------------------------------------------------------- */
/* What ships                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The marketing import closure, verified by `assertClosure` below rather than
 * trusted. Every entry is a path relative to `web/`.
 */
const COPY: string[] = [
  "src/app/layout.tsx",
  "src/app/globals.css",
  "src/app/favicon.ico",
  "src/app/sitemap.ts",
  "src/app/robots.ts",
  "src/app/(marketing)",
  "src/components/marketing",
  "src/components/brand",
  "src/lib/cn.ts",
  "src/lib/marketing",
  "public/brand",
  "public/clients",
  "public/avatars",
  "public/photos",
];

/**
 * Third-party packages the closure actually imports. Deliberately not copied
 * from `web/package.json` wholesale — the app pulls in dnd-kit, react-hook-form,
 * zod and date-fns that the site never touches, and a public repo advertising
 * dependencies it does not use invites questions it should not have to answer.
 */
const RUNTIME_DEPS = [
  "clsx",
  "geist",
  "lucide-react",
  "next",
  "react",
  "react-dom",
  "tailwind-merge",
] as const;

const DEV_DEPS = [
  "@tailwindcss/postcss",
  "@types/node",
  "@types/react",
  "@types/react-dom",
  "eslint",
  "eslint-config-next",
  "tailwindcss",
  "typescript",
] as const;

/** Paths the export must never contain a reference to. */
const FORBIDDEN_IMPORTS = [
  "@/components/ui",
  "@/components/portal",
  "@/components/payroll",
  "@/components/people",
  "@/components/hiring",
  "@/lib/mock",
  "@/lib/store",
  "@/lib/payroll",
  "@/hooks",
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const log = (msg: string) => console.log(`  ${msg}`);

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

/** Files the export owns and will replace. Anything else in the target is left. */
const OWNED_ROOT_FILES = [
  ".gitignore",
  ".env.example",
  "README.md",
  "eslint.config.mjs",
  "next.config.ts",
  "package.json",
  "postcss.config.mjs",
  "tsconfig.json",
];

const OWNED_DIRS = ["src", "public"];

/**
 * Refuse to clobber a directory that is not ours. A target is safe if it does
 * not exist, is empty, or already looks like a previous export.
 */
function assertSafeTarget() {
  if (!fs.existsSync(TARGET)) return;
  const entries = fs
    .readdirSync(TARGET)
    .filter((e) => e !== ".git" && e !== ".DS_Store" && e !== "node_modules");
  if (entries.length === 0) return;

  const marker = path.join(TARGET, "package.json");
  if (fs.existsSync(marker)) {
    const pkg = JSON.parse(fs.readFileSync(marker, "utf8")) as {
      name?: string;
    };
    if (pkg.name === "approvehr-marketing") return;
  }
  fail(
    `${TARGET} is not empty and does not look like a previous export ` +
      `(no package.json named "approvehr-marketing"). Refusing to overwrite it. ` +
      `Pass a different target directory if this was intentional.`,
  );
}

function resolveVersion(name: string): string {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(WEB_ROOT, "package.json"), "utf8"),
  ) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
  const version = pkg.dependencies[name] ?? pkg.devDependencies[name];
  if (!version) fail(`${name} is not a dependency of web/package.json`);
  return version;
}

/**
 * Size of what was actually exported.
 *
 * Measured by walking the COPY manifest rather than the target directory: a
 * re-export into a directory that has already had `npm install` run in it would
 * otherwise report node_modules and .next as though they were the payload,
 * which is how this first reported "572M" for a 1.8M site.
 */
function exportedBytes(): number {
  const walk = (p: string): number => {
    const stat = fs.statSync(p);
    if (!stat.isDirectory()) return stat.size;
    return fs
      .readdirSync(p)
      .reduce((sum, entry) => sum + walk(path.join(p, entry)), 0);
  };
  return COPY.reduce((sum, rel) => sum + walk(path.join(TARGET, rel)), 0);
}

function humanSize(bytes: number): string {
  const mb = bytes / 1_048_576;
  return mb >= 1 ? `${mb.toFixed(1)}M` : `${Math.round(bytes / 1024)}K`;
}

/** Every .ts/.tsx file under a directory, recursively. */
function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|css)$/.test(entry.name) ? [full] : [];
  });
}

/* -------------------------------------------------------------------------- */
/* Generated files                                                            */
/* -------------------------------------------------------------------------- */

function packageJson() {
  const dep = (names: readonly string[]) =>
    Object.fromEntries(names.map((n) => [n, resolveVersion(n)]));
  return `${JSON.stringify(
    {
      name: "approvehr-marketing",
      version: "0.1.0",
      private: true,
      description:
        "The public ApproveHR website — HR, payroll and hiring for Nigerian companies.",
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
        lint: "eslint",
        typecheck: "tsc --noEmit",
        check: "npm run typecheck && npm run lint && npm run build",
      },
      dependencies: dep(RUNTIME_DEPS),
      devDependencies: dep(DEV_DEPS),
    },
    null,
    2,
  )}\n`;
}

const NEXT_CONFIG = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
`;

const GITIGNORE = `/node_modules
/.next/
/out/
/build
.DS_Store
*.pem
npm-debug.log*
.env*
.vercel
*.tsbuildinfo
next-env.d.ts
`;

const ENV_EXAMPLE = `# Absolute URL this site is served from. Used by sitemap.xml and robots.txt.
NEXT_PUBLIC_SITE_URL=https://approvehr.io

# Where the signed-in product lives. Leave this UNSET (or commented out) and the
# site drops every "sign in" / "see it live" affordance rather than linking at an
# app that is not deployed. Set it once the product is reachable, e.g.
# NEXT_PUBLIC_APP_URL=https://app.approvehr.io
`;

function readme() {
  return `# ApproveHR — website

The public marketing site for [ApproveHR](https://approvehr.io), Schull
Technologies' HR, payroll and hiring platform for Nigerian companies.

Next.js ${resolveVersion("next").replace(/^[^0-9]*/, "")} (App Router, Turbopack), React 19, TypeScript, Tailwind v4.

## Running it

\`\`\`bash
npm install
npm run dev     # http://localhost:3000
npm run check   # typecheck + lint + production build
\`\`\`

## Pages

| Route | What it is |
|---|---|
| \`/\` | Homepage — the argument, the module grid, pricing teaser |
| \`/pricing\` | Tiers plus a live per-employee calculator |
| \`/product/[module]\` | One walkthrough per module: payroll, core-hr, hiring, time, performance, desk |
| \`/demo\` | Demo request form |
| \`/privacy\`, \`/terms\`, \`/security\`, \`/dpa\` | Legal and trust documents |

\`/sitemap.xml\` and \`/robots.txt\` are generated from the same content modules
the pages render from, so a new module or legal document appears in both without
anyone remembering to add it.

## How it is put together

- **\`src/lib/marketing/\`** holds the copy — module descriptions, pricing tiers,
  the legal documents. Text lives in these modules rather than inline in JSX so
  the homepage, the module pages and the footer quote the product identically. A
  claim cannot drift between two places if it only exists in one.
- **\`src/components/marketing/mockups.tsx\`** and \`module-mockups.tsx\` are
  hand-drawn SVG and CSS illustrations of the product, not screenshots. They
  never go stale and weigh nothing. Each one has a hover animation that performs
  the sentence its card is making.
- **\`src/app/globals.css\`** carries the design tokens. The marketing surface
  has its own block: warm sand ground, near-black warm ink, tight display type.
  Every colour pair in use is checked against WCAG 2.1 AA.
- **\`src/lib/marketing/links.ts\`** decides whether the "sign in" and "see it
  live" links appear at all, from \`NEXT_PUBLIC_APP_URL\`. Unset means no app is
  deployed, so those affordances are dropped rather than pointed at a 404. See
  \`.env.example\`.

## Two rules this site is built on

1. **Nothing is claimed that is not true.** No invented customer logos, no
   made-up statistics, no testimonials for features that do not exist. The
   security page leads with the assurances we do *not* have. The legal documents
   say they are drafts.
2. **Never link to a page that is not there.** Any affordance for something
   unbuilt is either absent or visibly marked as unbuilt.

## Deploying

Any Node host that runs Next.js. Set \`NEXT_PUBLIC_SITE_URL\` so the sitemap
emits absolute URLs for the right domain.

---

Generated from the \`web/\` project in the ApproveHR monorepo by
\`scripts/export-marketing.ts\`. Edit the site there and re-run the export —
changes made directly in this repo will be overwritten on the next one.
`;
}

/* -------------------------------------------------------------------------- */
/* Stages                                                                     */
/* -------------------------------------------------------------------------- */

function clean() {
  for (const dir of OWNED_DIRS) {
    fs.rmSync(path.join(TARGET, dir), { recursive: true, force: true });
  }
  for (const file of OWNED_ROOT_FILES) {
    fs.rmSync(path.join(TARGET, file), { force: true });
  }
}

function copy() {
  for (const rel of COPY) {
    const from = path.join(WEB_ROOT, rel);
    if (!fs.existsSync(from)) fail(`${rel} does not exist in web/ — stale COPY manifest`);
    const to = path.join(TARGET, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true });
    log(`copied ${rel}`);
  }
}

function generate() {
  const files: [string, string][] = [
    ["package.json", packageJson()],
    ["next.config.ts", NEXT_CONFIG],
    [".gitignore", GITIGNORE],
    [".env.example", ENV_EXAMPLE],
    ["README.md", readme()],
    ["tsconfig.json", fs.readFileSync(path.join(WEB_ROOT, "tsconfig.json"), "utf8")],
    [
      "postcss.config.mjs",
      fs.readFileSync(path.join(WEB_ROOT, "postcss.config.mjs"), "utf8"),
    ],
    [
      "eslint.config.mjs",
      fs.readFileSync(path.join(WEB_ROOT, "eslint.config.mjs"), "utf8"),
    ],
  ];
  for (const [name, contents] of files) {
    fs.writeFileSync(path.join(TARGET, name), contents);
    log(`wrote ${name}`);
  }
}

/**
 * The assertions that make this script trustworthy. Each one corresponds to a
 * way the export has broken or could break.
 */
function assertClosure() {
  const files = sourceFiles(path.join(TARGET, "src"));
  if (files.length === 0) fail("no source files were copied");

  const problems: string[] = [];

  for (const file of files) {
    const rel = path.relative(TARGET, file);
    const src = fs.readFileSync(file, "utf8");

    for (const forbidden of FORBIDDEN_IMPORTS) {
      if (src.includes(`"${forbidden}`)) {
        problems.push(
          `${rel} imports ${forbidden} — the marketing surface must not reach ` +
            `into the app's component or data layers.`,
        );
      }
    }

    /* An import of a path that was not copied would build here but 404 the
       module. Catch it now rather than in the public repo's CI. */
    for (const match of src.matchAll(/from "(@\/[^"]+)"/g)) {
      const spec = match[1].replace("@/", "");
      const candidates = [
        `${spec}.ts`,
        `${spec}.tsx`,
        `${spec}/index.ts`,
        `${spec}/index.tsx`,
      ];
      if (!candidates.some((c) => fs.existsSync(path.join(TARGET, "src", c)))) {
        problems.push(`${rel} imports @/${spec}, which was not exported.`);
      }
    }
  }

  /* Marketing pages must not link at app routes directly — they go through
     lib/marketing/links.ts so an undeployed app degrades instead of 404ing. */
  const appRoutes = /href="\/(dashboard|approvals|payroll|hiring|performance|reports|settings|design-system|people)(\/|")/;
  for (const file of files) {
    if (file.endsWith(".css")) continue;
    const rel = path.relative(TARGET, file);
    if (rel.endsWith("lib/marketing/links.ts")) continue;
    const match = fs.readFileSync(file, "utf8").match(appRoutes);
    if (match) {
      problems.push(
        `${rel} hardcodes a link to ${match[0]} — route it through ` +
          `lib/marketing/links.ts so it degrades when no app is deployed.`,
      );
    }
  }

  /* Every footer/legal route the content layer advertises must have a page. */
  const routeDir = path.join(TARGET, "src", "app", "(marketing)");
  for (const id of ["privacy", "terms", "security", "dpa", "pricing", "demo"]) {
    if (!fs.existsSync(path.join(routeDir, id, "page.tsx"))) {
      problems.push(`/${id} is advertised in the footer but has no page.tsx.`);
    }
  }

  if (problems.length > 0) {
    console.error("\n✗ Export closure check failed:\n");
    for (const p of problems) console.error(`   • ${p}`);
    console.error("");
    process.exit(1);
  }
  log(`closure verified across ${files.length} files`);
}

/* -------------------------------------------------------------------------- */

console.log(`\nExporting marketing site → ${TARGET}\n`);

assertSafeTarget();
fs.mkdirSync(TARGET, { recursive: true });
clean();
copy();
generate();
assertClosure();

console.log(`\n✓ Exported (${humanSize(exportedBytes())}). Next:\n`);
console.log(`    cd ${TARGET}`);
console.log(`    npm install && npm run check\n`);
