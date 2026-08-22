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
    /*
     * Any other build directory. `next.config.ts` takes the build directory
     * from `NEXT_DIST_DIR`, so that a production build made to verify the demo
     * gate does not land on top of the one `next dev` is serving. The first such
     * build reported 496 errors and 7592 warnings against `.next-verify` —
     * `require()` imports, `@ts-ignore`, `__turbopack_context__` — which is
     * minified output, not anybody's code. Same class as the worktree below, and
     * the third time this repo has had a gate go red on files nobody wrote.
     */
    ".next-*/**",
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
