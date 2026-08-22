/**
 * The performance module's public surface.
 *
 * `index.ts` is inert to the App Router — only `page`, `layout`, `route` and
 * their siblings are special — so this is a plain barrel, and it exists so a
 * screen somewhere else can compose one of these panels without importing a
 * path into a route directory:
 *
 * ```tsx
 * import { StartPeriodButton } from "@/app/(app)/performance";
 * ```
 *
 * `ReviewFormModal` is exported because "fill in the review that is waiting on
 * you" belongs anywhere a task list is shown — the dashboard, the approvals
 * inbox, a notification — and it should open the same form rather than a second
 * one that drifts from it.
 */
export { AppraiserMapTab } from "./appraiser-map";
export { KpisTab } from "./kpis";
export { WhatNeedsYouTab } from "./now";
export { PeriodsTab } from "./periods";
export { ReviewFormModal } from "./review-form";
export { SkillsTab } from "./skills";

/**
 * Starting an appraisal period, and the dialog behind it.
 *
 * The single most exported thing here, on purpose. The product owner's rule:
 * "there should always be multiple buttons leading to the same action to ensure
 * users aren't looking for stuff." So the dashboard, the approvals inbox, the
 * objectives queue and one person's record all render **this** button — one
 * dialog, several doors. Three implementations would drift in three directions
 * and the one somebody found would be the one nobody had fixed.
 */
export { StartPeriodButton, StartPeriodDialog } from "./start-period";

/**
 * The reason dialog is exported for the same reason `ReviewFormModal` is:
 * sending an objective back, refusing it and reopening an agreed target all
 * happen in more than one place — the approval queue and the KPI cascade — and
 * both must ask for the reason in the same words, because the wording is what
 * tells somebody what they are about to do.
 */
export { ApprovalReasonDialog, type ApprovalAct } from "./approval-dialogs";

/**
 * The pieces a review is made of, so a third surface that opens one does not
 * write its own copy of what a question looks like.
 */
export {
  AnswerField,
  AppraiserStrip,
  ReadAnswer,
  draftFrom,
  filled,
  type Draft,
} from "./review-parts";
