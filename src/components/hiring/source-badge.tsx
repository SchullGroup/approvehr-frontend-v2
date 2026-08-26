import { sourceNote } from "@/lib/demo";
import { Badge } from "@/components/ui";

/**
 * Where the figures beside this badge came from.
 *
 * The hiring module reads from two places at once and that is not going to
 * change soon: adverts and the applications they bring in have API routes, while
 * the pipeline board, interviews, scorecards and offers have Prisma models and no
 * routes at all. So a connected screen can carry a live panel and a seeded panel
 * side by side, and the badge belongs to the **panel** rather than to the page.
 *
 * `live` is passed in rather than read from the session here, deliberately. A
 * panel with no endpoint behind it is seeded whatever the session says, and this
 * component renders on the server for the pages that never had a live source —
 * so it holds no hook and asks no questions.
 *
 * The two strings are the ones the rest of the app already uses; keeping them
 * identical is what lets somebody scan a screen for them.
 */
export function SourceBadge({
  live,
  /** Shown after the badge when a page mixes sources and needs to say which. */
  note,
}: {
  live: boolean;
  note?: string;
}) {
  const label = sourceNote(live);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {label && (
        <Badge tone="warning" size="sm" dot>
          {label}
        </Badge>
      )}
      {note && <span className="text-meta text-muted">{note}</span>}
    </span>
  );
}
