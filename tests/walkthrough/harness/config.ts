import path from "node:path";

/**
 * One run's settings, read once from the environment.
 *
 * Nothing here is a default for where output goes: `WALK_OUT` has to be named.
 * The harness runs from a worktree, and a worktree is removed when the work is
 * done, so a default relative to the working directory would put a recording
 * somewhere it is deleted with the branch. Naming the main checkout's `out/` is a
 * deliberate act, and the check below turns the forgotten one into a refusal.
 */

export type Mode = "strict" | "soft";

export type RunConfig = {
  /** Names the folder under `_evidence/` for anything that is not the final run. */
  runId: string;
  /**
   * `strict`: the first failed step fails the run, which is the only kind of run
   * that may produce the deliverables. `soft`: a failed step is recorded as a
   * finding and the run carries on to the next chapter (recon only).
   */
  mode: Mode;
  /** The final run writes the deliverables to the output root itself. */
  final: boolean;
  outRoot: string;
  /** Where this run's files go. */
  runDir: string;
  webUrl: string;
  apiUrl: string;
  mailUrl: string;
  atlassianUrl: string;
  typingBudgetMs: number;
  viewport: { width: number; height: number };
};

const need = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(
      `${name} is not set. The walkthrough writes its recording and screenshots to the main checkout's out/ folder, never to a worktree, so it will not guess.`,
    );
  }
  return value;
};

const stamp = (): string =>
  new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..*$/, "")
    .replace("T", "-");

export function readConfig(): RunConfig {
  const outRoot = path.resolve(need("WALK_OUT"));
  if (outRoot.includes(`${path.sep}.worktrees${path.sep}`)) {
    throw new Error(
      `WALK_OUT is inside a worktree (${outRoot}). Deliverables go to the main checkout's out/ folder.`,
    );
  }
  const mode: Mode = process.env["WALK_MODE"] === "soft" ? "soft" : "strict";
  const final = process.env["WALK_FINAL"] === "1";
  if (final && mode !== "strict") {
    throw new Error(
      "The final run is strict: WALK_FINAL=1 cannot be combined with WALK_MODE=soft.",
    );
  }
  const runId = process.env["WALK_RUN_ID"] ?? `run-${stamp()}`;
  return {
    runId,
    mode,
    final,
    outRoot,
    runDir: final ? outRoot : path.join(outRoot, "_evidence", runId),
    webUrl: process.env["WALK_WEB_URL"] ?? "http://localhost:3297",
    apiUrl: process.env["WALK_API_URL"] ?? "http://127.0.0.1:8797",
    mailUrl: process.env["WALK_MAIL_URL"] ?? "http://127.0.0.1:8798",
    atlassianUrl: process.env["WALK_ATLASSIAN_URL"] ?? "http://127.0.0.1:8799",
    typingBudgetMs: Number(process.env["WALK_TYPING_MINUTES"] ?? "12") * 60_000,
    viewport: { width: 1280, height: 720 },
  };
}
