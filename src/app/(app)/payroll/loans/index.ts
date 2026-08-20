/**
 * The loans module's public surface.
 *
 * `index.ts` is inert to the App Router — only `page`, `layout`, `route` and
 * their siblings are special — so this is a plain barrel, and it exists so that
 * a screen somewhere else can compose a loans component without importing a path
 * into a route directory:
 *
 * ```tsx
 * import { MyLoans } from "@/app/(app)/payroll/loans";
 * ```
 *
 * `MyLoans` is what `/profile` needs. `ApplyLoanModal` is exported alongside it
 * because a screen that offers "apply for a loan" from somewhere else — a
 * dashboard tile, an approvals inbox — should open the same form with the same
 * take-home preview rather than a second one that drifts from it.
 */
export { MyLoans } from "./my-loans";
export { ApplyLoanModal } from "./apply-loan";
