import type { BadgeTone } from "@/components/ui";
import type { OvertimeKind, OvertimeStatus } from "@/lib/overtime/derive";

/**
 * Badge tones, in one place so the list and the profile card cannot drift.
 *
 * Every one of these is paired with a word — `STATUS_LABEL`, `KIND_LABEL` — so
 * the colour is a second signal and never the only one. `PAID` is deliberately
 * `info` rather than `success`: green in this product means somebody approved
 * something, and "on a payslip" is a fact about a run, not an approval.
 */
export const STATUS_TONE: Record<OvertimeStatus, BadgeTone> = {
  PENDING: "warning",
  APPROVED: "success",
  DECLINED: "neutral",
  PAID: "info",
};

/** Weekend and holiday cost more, so they are the ones worth spotting. */
export const KIND_TONE: Record<OvertimeKind, BadgeTone> = {
  WEEKDAY: "neutral",
  WEEKEND: "accent",
  PUBLIC_HOLIDAY: "accent",
};
