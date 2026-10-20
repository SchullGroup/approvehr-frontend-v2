/**
 * Where the generator reads a repository from.
 *
 * Two shapes, and the reason there are two is the reason this file exists. The
 * inventories describe `src` as it is **in a commit**, not as it happens to be
 * on somebody's disk: a checkout can be on a stale branch, carry untracked
 * scratch files or hold half an edit, and an inventory generated from that is a
 * description of nothing anybody can name. So a sibling repository is read at a
 * named ref, and this repository is read as the files git tracks.
 *
 * Neither touches the working tree of a repository it only reads from — a ref
 * is read through `git cat-file --batch`, in one process, so a thousand files
 * cost one spawn rather than a thousand.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface RepoSource {
  /** Every file under the requested roots: repo-relative, `/`, sorted. */
  files(): string[];
  /** The text of one of them. Throws for a path `files()` did not return. */
  read(path: string): string;
  /** What this is a snapshot of, in words a reader can check. */
  readonly describe: string;
}

const git = (repo: string, args: string[], input?: Buffer): Buffer =>
  execFileSync("git", ["-C", repo, ...args], {
    maxBuffer: 1 << 30,
    ...(input ? { input } : {}),
  });

const names = (raw: Buffer): string[] =>
  raw
    .toString("utf8")
    .split("\0")
    .filter((p) => p.length > 0)
    .sort();

/** `` `3e86763` (2026-10-20) `` — the commit a ref names, and when it was made. */
function commitOf(repo: string, ref: string): string {
  const [sha, day] = git(repo, ["show", "-s", "--format=%h %cs", ref])
    .toString()
    .trim()
    .split(" ");
  return `\`${sha}\` (${day})`;
}

/** The files git tracks under `roots` in a checkout, read from disk. */
export function trackedFiles(repo: string, roots: string[]): RepoSource {
  const listed = names(git(repo, ["ls-files", "-z", "--", ...roots]));
  return {
    files: () => listed,
    read: (path) => readFileSync(join(repo, path), "utf8"),
    describe: `commit ${commitOf(repo, "HEAD")}`,
  };
}

/**
 * The files under `roots` in the commit `ref` names, without checking it out.
 *
 * `git cat-file --batch` answers each request with `<oid> blob <size>`, the
 * bytes, and a newline. Sizes are in bytes, so the buffer is walked as bytes and
 * only decoded once each file's slice is known; decoding first would put the
 * boundaries in the wrong place for any file with a multi-byte character in it.
 */
export function atRef(repo: string, ref: string, roots: string[]): RepoSource {
  const listed = names(
    git(repo, ["ls-tree", "-r", "-z", "--name-only", ref, "--", ...roots]),
  );
  const request = Buffer.from(listed.map((p) => `${ref}:${p}\n`).join(""));
  const out =
    listed.length > 0
      ? git(repo, ["cat-file", "--batch"], request)
      : Buffer.alloc(0);

  const text = new Map<string, string>();
  let at = 0;
  for (const path of listed) {
    const eol = out.indexOf(0x0a, at);
    const [, type, size] = out.toString("utf8", at, eol).split(" ");
    if (type !== "blob" || size === undefined) {
      throw new Error(`${ref}:${path} is not a readable file (${type}).`);
    }
    const start = eol + 1;
    const end = start + Number(size);
    text.set(path, out.toString("utf8", start, end));
    at = end + 1;
  }

  return {
    files: () => listed,
    read: (path) => {
      const body = text.get(path);
      if (body === undefined) throw new Error(`${path} is not in ${ref}.`);
      return body;
    },
    describe: `\`${ref}\` at ${commitOf(repo, ref)}`,
  };
}
