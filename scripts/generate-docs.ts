/**
 * Re-derives the generated inventories under `docs/`.
 *
 * ## Why this exists
 *
 * `docs/pages/` and `docs/components/` are the answer to "does this already
 * exist?", and they are only worth asking while they are true. They were first
 * written by a one-off pass on 2026-09-11 and then patched by hand, and a
 * patched inventory goes stale in the way nobody notices: by October the pages
 * list had 113 routes against 145 in the code, the component list covered 659
 * files against 1,054, and the API list was missing seven whole modules. Every
 * hand patch was a row somebody remembered to add; the ones nobody remembered
 * were exactly the ones a reader needed. `CLAUDE.md` says to re-derive the file
 * rather than patch the row, and until this script there was nothing to
 * re-derive it with.
 *
 * ## What it does
 *
 * - `docs/pages/frontend-v2.md` from every `page.tsx` under `src/app` in this
 *   checkout — route, and the page's own `metadata` title and description.
 * - `docs/components/frontend-v2.md` from every `.ts` and `.tsx` under `src`.
 * - `docs/components/landing-frontend.md` from the landing site's `src`, read at
 *   a git ref so another checkout's working tree is never involved.
 * - `docs/components/backend-api.md` from the backend's `src`, the same way,
 *   with every endpoint's full mounted path.
 *
 * Then `prettier`, last, so the table widths are never this script's opinion.
 * Re-running it on an unchanged tree changes nothing.
 *
 * ## Usage
 *
 * ```
 * npm run docs                      # rewrite every file it can
 * npm run docs -- --check           # exit 1 if any committed file is stale
 * npm run docs -- --only frontend-pages,frontend-components
 * LANDING_REPO=… LANDING_REF=… BACKEND_REPO=… BACKEND_REF=… npm run docs
 * ```
 *
 * The sibling repositories default to `../aprrovehr-frontend` at `origin/main`
 * and `../approvehr-backend` at `origin/staging` (also `../../…`, which is where
 * they sit from a worktree). A ref is read as it was last fetched, so run
 * `git fetch` in each sibling first; the snapshot line in the output names the
 * commit that was read. When a sibling is absent its file is skipped and the
 * script says so; it never writes a smaller file in its place.
 *
 * `--check` is not part of `npm run check`. It would fail every pull request
 * that adds an export without regenerating, which is a rule for the team to
 * choose rather than for a script to introduce. It is here so the question
 * "are the inventories current?" has a command.
 *
 * ## What it does not do
 *
 * Nothing under `docs/walkthroughs/` or `docs/adr/` — those are written by
 * hand, about the product and about decisions, and a generator has nothing to
 * say about either. `docs/pages/landing-frontend.md` is also by hand: the
 * landing site's routes carry no metadata to read.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { format, resolveConfig } from "prettier";
import { backendApiMarkdown, MODULE_PURPOSE } from "./docs/backend-api";
import { componentsMarkdown, FRONTEND_V2, LANDING } from "./docs/components";
import { pagesMarkdown } from "./docs/pages";
import { atRef, trackedFiles, type RepoSource } from "./docs/source";

/** `npm run` always starts in the package root, which is where `docs/` is. */
const ROOT = process.cwd();

interface Target {
  name: string;
  file: string;
  /** Null means "could not be produced here", with the reason. */
  build(): Promise<string | { skipped: string }>;
}

/** A sibling repository: an env override first, then the usual places. */
function sibling(env: string, folders: string[]): string | null {
  const given = process.env[env];
  if (given) return resolve(given);
  for (const folder of folders) {
    for (const up of ["..", join("..", "..")]) {
      const candidate = resolve(ROOT, up, folder);
      if (existsSync(join(candidate, ".git"))) return candidate;
    }
  }
  return null;
}

function remote(
  env: string,
  refEnv: string,
  folders: string[],
  defaultRef: string,
): RepoSource | { skipped: string } {
  const repo = sibling(env, folders);
  if (!repo) {
    return { skipped: `no checkout of ${folders[0]} found (set ${env})` };
  }
  return atRef(repo, process.env[refEnv] ?? defaultRef, ["src"]);
}

const frontend = () => trackedFiles(ROOT, ["src"]);

const TARGETS: Target[] = [
  {
    name: "frontend-pages",
    file: "docs/pages/frontend-v2.md",
    build: async () => pagesMarkdown(frontend()),
  },
  {
    name: "frontend-components",
    file: "docs/components/frontend-v2.md",
    build: async () => componentsMarkdown(frontend(), FRONTEND_V2),
  },
  {
    name: "landing-components",
    file: "docs/components/landing-frontend.md",
    build: async () => {
      const source = remote(
        "LANDING_REPO",
        "LANDING_REF",
        ["aprrovehr-frontend"],
        "origin/main",
      );
      return "skipped" in source ? source : componentsMarkdown(source, LANDING);
    },
  },
  {
    name: "backend-api",
    file: "docs/components/backend-api.md",
    build: async () => {
      const source = remote(
        "BACKEND_REPO",
        "BACKEND_REF",
        ["approvehr-backend"],
        "origin/staging",
      );
      return "skipped" in source
        ? source
        : backendApiMarkdown(source, MODULE_PURPOSE);
    },
  },
];

/** The snapshot line names a commit, so it changes whenever the code does. */
const withoutSnapshot = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.startsWith("_Snapshot:_"))
    .join("\n");

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const onlyAt = args.indexOf("--only");
  const only =
    onlyAt >= 0 ? new Set((args[onlyAt + 1] ?? "").split(",")) : null;

  const unknown = [...(only ?? [])].filter(
    (n) => !TARGETS.some((t) => t.name === n),
  );
  if (unknown.length > 0) {
    console.error(
      `Unknown target ${unknown.join(", ")}. Known: ${TARGETS.map((t) => t.name).join(", ")}.`,
    );
    process.exit(2);
  }

  let stale = 0;
  for (const target of TARGETS) {
    if (only && !only.has(target.name)) continue;
    const built = await target.build();
    if (typeof built !== "string") {
      console.log(`skip   ${target.file} — ${built.skipped}`);
      continue;
    }
    const path = join(ROOT, target.file);
    const options = (await resolveConfig(path)) ?? {};
    const text = await format(built, { ...options, parser: "markdown" });
    const current = existsSync(path) ? readFileSync(path, "utf8") : "";

    if (check) {
      const same = withoutSnapshot(current) === withoutSnapshot(text);
      console.log(`${same ? "ok    " : "STALE "} ${target.file}`);
      if (!same) stale += 1;
    } else {
      writeFileSync(path, text);
      console.log(`wrote  ${target.file}`);
    }
  }

  if (check && stale > 0) {
    console.error(
      `\n${stale} inventory file(s) no longer match the code. Run \`npm run docs\` and commit the result.`,
    );
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
