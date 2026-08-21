/**
 * The performance module's public surface.
 *
 * `index.ts` is inert to the App Router — only `page`, `layout`, `route` and
 * their siblings are special — so this is a plain barrel, and it exists so a
 * screen somewhere else can compose one of these panels without importing a
 * path into a route directory:
 *
 * ```tsx
 * import { AppraisalsTab } from "@/app/(app)/performance";
 * ```
 *
 * `ReviewFormModal` is exported because "fill in the review that is waiting on
 * you" belongs anywhere a task list is shown — the dashboard, the approvals
 * inbox, a notification — and it should open the same form rather than a second
 * one that drifts from it.
 */
export { AppraisalsTab } from "./appraisals";
export { AppraiserMapTab } from "./appraiser-map";
export { KpisTab } from "./kpis";
export { ReviewFormModal } from "./review-form";
export { SkillsTab } from "./skills";
