import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Where the backend's source is, for the checks that compare this repo with it.
 *
 * Four gates read the backend's files as text: the import dictionaries, the tax
 * schedule, the rating scale and the signature wording. Each used to carry its own
 * `../../../approvehr-api/...`, which is where the backend sat in the first layout
 * and nowhere since: the repo is `approvehr-backend` now, and a worktree sits two
 * levels deeper than the main checkout. The path matched nothing, so all four
 * printed `skip` on every machine and a drift between the two repos had no gate.
 *
 * The backend is found in this order:
 *
 *   1. `APPROVEHR_BACKEND_DIR`, the root of a backend checkout. Explicit, so it is
 *      what to use to compare against an unmerged branch (a worktree of its own).
 *      A path that is not a backend is an error, not a quiet skip: somebody who
 *      named a directory expects it to be read.
 *   2. A folder beside this repo or beside any folder above it, up to six levels
 *      (so a worktree under `.worktrees/` finds the main checkout's neighbour).
 *      `approvehr-api` is looked for before `approvehr-backend`: it is the name a
 *      person gives a link or an old checkout on purpose, while `approvehr-backend`
 *      is the folder every clone gets, so the deliberate one wins when both exist.
 *
 * Nothing found is `null`, and the callers skip, because the frontend's CI clones
 * this repo alone and has no backend to compare with.
 */

/** Every name the backend repo has gone by, the deliberate one first. */
export const BACKEND_FOLDER_NAMES = [
  "approvehr-api",
  "approvehr-backend",
] as const;

/** What every skip line says, so the four gates cannot word it four ways. */
export const NO_BACKEND =
  "no backend checkout beside this repo (looked for approvehr-backend and approvehr-api; APPROVEHR_BACKEND_DIR points at one)";

/** How many folders above the starting point to look in. */
const LEVELS_UP = 6;

/** A folder is a backend when it has the module tree these checks read. */
function isBackend(dir: string): boolean {
  return existsSync(path.join(dir, "src", "modules"));
}

/**
 * The root of the backend checkout, or `null` when there is none beside this repo.
 *
 * `from` is the folder to start in and defaults to this repo's root; tests pass a
 * temporary tree. `env` is injectable for the same reason.
 */
export function findBackendRoot(
  from: string = path.resolve(import.meta.dirname, ".."),
  env: Record<string, string | undefined> = process.env,
): string | null {
  const forced = env["APPROVEHR_BACKEND_DIR"];
  if (forced) {
    const root = path.resolve(forced);
    if (!isBackend(root)) {
      throw new Error(
        `APPROVEHR_BACKEND_DIR is ${root}, which has no src/modules folder. ` +
          `Point it at the root of a backend checkout, or unset it to look beside this repo.`,
      );
    }
    return root;
  }

  /* Start one level up: this repo's own folder is never the answer. */
  let dir = path.dirname(path.resolve(from));
  for (let level = 0; level < LEVELS_UP; level += 1) {
    for (const name of BACKEND_FOLDER_NAMES) {
      const candidate = path.join(dir, name);
      if (isBackend(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * A file inside the backend, or `null` when there is no backend or the file is not
 * in it. `relative` is from the backend's root, e.g. `src/modules/payroll/engine.ts`.
 */
export function backendFile(
  relative: string,
  from?: string,
  env?: Record<string, string | undefined>,
): string | null {
  const root = findBackendRoot(from, env);
  if (!root) return null;
  const file = path.join(root, relative);
  return existsSync(file) ? file : null;
}
