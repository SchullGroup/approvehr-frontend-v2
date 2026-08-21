/**
 * The overtime module's public surface.
 *
 * `index.ts` is inert to the App Router — only `page`, `layout`, `route` and
 * their siblings are special — so this is a plain barrel, and it exists so a
 * screen elsewhere can compose the personal view without importing a path into
 * a route directory:
 *
 * ```tsx
 * import { MyOvertime } from "@/app/(app)/people/overtime";
 * ```
 *
 * `MyOvertime` is what `/profile` needs. `DeclineOvertimeModal` is exported
 * beside it because "turn this down, and say why" belongs anywhere a pending
 * row is shown — an approvals inbox, a dashboard tile — and it should open the
 * same box rather than a second one that drifts from it.
 */
export { MyOvertime } from "./my-overtime";
export { DeclineOvertimeModal } from "./decline-overtime";
export { KIND_TONE, STATUS_TONE } from "./tone";
