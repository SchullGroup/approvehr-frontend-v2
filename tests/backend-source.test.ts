import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backendFile, findBackendRoot } from "../scripts/backend-source";

/**
 * Where the four cross-repo gates look for the backend.
 *
 * They all pointed at `../../../approvehr-api`, which matched nothing in this
 * layout, so every one printed `skip` and a drift between the two repos had no
 * gate. These pin the lookup: the folder names, the worktree depth, the order when
 * two exist, and the explicit override. Each case builds its own tree under a
 * temporary folder and passes `env` explicitly so the caller's own
 * `APPROVEHR_BACKEND_DIR` cannot change the answer.
 */

let root: string;

/** A folder that looks like a backend checkout: it has the module tree. */
const backend = (...parts: string[]) => {
  const dir = path.join(root, ...parts);
  mkdirSync(path.join(dir, "src", "modules"), { recursive: true });
  return dir;
};

const folder = (...parts: string[]) => {
  const dir = path.join(root, ...parts);
  mkdirSync(dir, { recursive: true });
  return dir;
};

const NONE = {};

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "backend-source-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("findBackendRoot", () => {
  it("finds approvehr-backend beside the repo", () => {
    const repo = folder("ws", "approvehr-frontend-v2");
    const found = backend("ws", "approvehr-backend");
    expect(findBackendRoot(repo, NONE)).toBe(found);
  });

  it("still finds a checkout called approvehr-api", () => {
    const repo = folder("ws", "approvehr-frontend-v2");
    const found = backend("ws", "approvehr-api");
    expect(findBackendRoot(repo, NONE)).toBe(found);
  });

  it("prefers the deliberate name when both exist", () => {
    /* A link or an old checkout named approvehr-api is somebody's choice; the
       folder every clone gets is not. That is how a check is pointed at an
       unmerged branch without moving the main checkout. */
    const repo = folder("ws", "approvehr-frontend-v2");
    backend("ws", "approvehr-backend");
    const chosen = backend("ws", "approvehr-api");
    expect(findBackendRoot(repo, NONE)).toBe(chosen);
  });

  it("finds the main checkout's neighbour from a worktree two levels down", () => {
    const worktree = folder("ws", ".worktrees", "fe-thing");
    const found = backend("ws", "approvehr-backend");
    expect(findBackendRoot(worktree, NONE)).toBe(found);
  });

  it("does not count a folder without a module tree as a backend", () => {
    const repo = folder("ws", "approvehr-frontend-v2");
    folder("ws", "approvehr-backend");
    expect(findBackendRoot(repo, NONE)).toBeNull();
  });

  it("is null when there is nothing beside the repo, which is the frontend's CI", () => {
    const repo = folder("ws", "approvehr-frontend-v2");
    expect(findBackendRoot(repo, NONE)).toBeNull();
  });

  it("lets APPROVEHR_BACKEND_DIR win over a folder beside the repo", () => {
    const repo = folder("ws", "approvehr-frontend-v2");
    backend("ws", "approvehr-backend");
    const branch = backend("elsewhere", "be-unmerged");
    expect(findBackendRoot(repo, { APPROVEHR_BACKEND_DIR: branch })).toBe(
      branch,
    );
  });

  it("refuses an APPROVEHR_BACKEND_DIR that is not a backend, rather than skipping", () => {
    /* Somebody who named a folder expects it to be read. A quiet skip would be the
       original failure again, with an extra step. */
    const repo = folder("ws", "approvehr-frontend-v2");
    backend("ws", "approvehr-backend");
    const wrong = folder("not-a-backend");
    expect(() =>
      findBackendRoot(repo, { APPROVEHR_BACKEND_DIR: wrong }),
    ).toThrow(/APPROVEHR_BACKEND_DIR/);
  });
});

describe("backendFile", () => {
  it("returns the file inside the backend", () => {
    const repo = folder("ws", "approvehr-frontend-v2");
    const dir = backend("ws", "approvehr-backend");
    const file = path.join(dir, "src", "modules", "payroll", "engine.ts");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "export {};\n");
    expect(backendFile("src/modules/payroll/engine.ts", repo, NONE)).toBe(file);
  });

  it("is null when the backend is there and the file is not", () => {
    const repo = folder("ws", "approvehr-frontend-v2");
    backend("ws", "approvehr-backend");
    expect(backendFile("src/modules/payroll/engine.ts", repo, NONE)).toBeNull();
  });

  it("is null when there is no backend", () => {
    const repo = folder("ws", "approvehr-frontend-v2");
    expect(backendFile("src/modules/payroll/engine.ts", repo, NONE)).toBeNull();
  });
});
