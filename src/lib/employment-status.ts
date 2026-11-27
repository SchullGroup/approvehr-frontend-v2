import type { BadgeTone } from "@/components/ui/badge";

/**
 * An employment status as a chip, for any status the API can send.
 *
 * The directory's own map holds the six statuses the screen draws a filter for. The database has two
 * more, `SUSPENDED` and `EXITED`, and everybody on the Archived tab is `EXITED`. Reading
 * `STATUS[e.status].tone` for them threw, and the whole tab ("Something went wrong on this screen"),
 * which is the company's history of people who left, could not be opened. Anything unrecognised still
 * reads as a sentence rather than as a crash.
 */
const LOOKS: Record<string, { tone: BadgeTone; label: string }> = {
  active: { tone: "success", label: "Active" },
  onboarding: { tone: "info", label: "Onboarding" },
  probation: { tone: "warning", label: "Probation" },
  on_leave: { tone: "info", label: "On leave" },
  offboarding: { tone: "warning", label: "Offboarding" },
  inactive: { tone: "neutral", label: "Inactive" },
  suspended: { tone: "danger", label: "Suspended" },
  exited: { tone: "neutral", label: "Left the company" },
};

export function employmentStatusLook(status: string): {
  tone: BadgeTone;
  label: string;
} {
  return (
    LOOKS[status.toLowerCase()] ?? {
      tone: "neutral",
      label: status
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/^./, (c) => c.toUpperCase()),
    }
  );
}
