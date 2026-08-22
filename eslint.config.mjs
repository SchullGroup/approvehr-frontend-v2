import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    /*
     * Linked git worktrees. `git worktree list` puts a whole second checkout
     * under here, complete with its own `.next`, and eslint walks straight into
     * it: 578 errors in another branch's build output, reported against this
     * one. `.git/info/exclude` hides it from git and from nothing else, and it
     * is local and uncommitted, so it cannot be the fix — this is the committed
     * counterpart. The API repo has the same line in `.prettierignore` for the
     * same reason.
     */
    ".claude/**",
  ]),
]);

export default eslintConfig;
