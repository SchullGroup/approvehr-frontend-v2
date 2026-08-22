/**
 * Supplies `DEMO_ENABLED` to a script.
 *
 * In the app, `DEMO_ENABLED` is not an import — it is substituted as a literal
 * by `compiler.define` in `next.config.ts`, which is what lets a production
 * build drop the demo seed and the demo copy entirely (see `src/lib/demo.ts`).
 *
 * A verification script runs under `tsx`, with no bundler, so a bare reference
 * to that identifier throws `ReferenceError` the moment it imports an app
 * module that mentions it. This gives it one, as **`true`**: these scripts
 * verify the demo fixtures — `verify-payroll.ts` reconciles every figure in
 * `lib/mock/demo-payslips.ts` — and with the flag false those arrays are empty
 * and the checks would pass by having nothing to check, which is the worst
 * outcome available.
 *
 * Import it first, before any `@/` module:
 *
 * ```ts
 * import "./demo-global";
 * ```
 */
(globalThis as { DEMO_ENABLED?: boolean }).DEMO_ENABLED = true;
