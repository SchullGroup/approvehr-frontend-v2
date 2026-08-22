/**
 * The offboarding module's public surface.
 *
 * `index.ts` is inert to the App Router — only `page`, `layout`, `route` and
 * their siblings are special — so this is a plain barrel. It exists so a screen
 * somewhere else can compose an offboarding component without importing a path
 * into a route directory:
 *
 * ```tsx
 * import { Resign } from "@/app/(app)/people/offboarding";
 * ```
 *
 * `Resign` is what `/profile` needs: the employee's own door out. `StartExitDialog`
 * is exported beside it so that a dashboard tile or an employee's record page
 * offering "record their exit" opens the same form rather than a second one that
 * drifts from it. `/people/[id]` is that second caller now, and it passes
 * `employeeId` + `employeeName` so the dialog states who is leaving instead of
 * asking. ("Exit", never "leaver" — the product's own vocabulary.)
 */
export { Resign } from "./resign";
export { StartExitDialog } from "./start-exit";
