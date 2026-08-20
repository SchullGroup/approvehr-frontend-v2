import type { BadgeTone } from "@/components/ui";
import type { ExitStatus } from "@/lib/api/offboarding";

/**
 * One badge colour per state, in one place.
 *
 * The list and the detail page both show the status, and a status that is amber
 * on one screen and grey on the other reads as two different things.
 *
 * `DRAFT` is here because the enum has it, not because anything creates one —
 * the API goes straight to a decision. A status a screen cannot render is a
 * blank badge.
 */
export function statusTone(status: ExitStatus): BadgeTone {
  switch (status) {
    case "AWAITING_MANAGER":
    case "AWAITING_HR":
      return "warning";
    case "IN_PROGRESS":
      return "accent";
    case "COMPLETED":
      return "success";
    case "DECLINED":
      return "danger";
    case "CANCELLED":
    case "DRAFT":
      return "neutral";
  }
}
