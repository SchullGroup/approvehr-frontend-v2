import { ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui";
import { formatDateShort } from "@/lib/time";

/**
 * Two small facts a person's card can carry: their interview score and, for somebody
 * rejected or withdrawn, the day their record is scheduled to be deleted.
 *
 * Neither is ever invented. Nobody scored means no badge at all (never a 0), and no
 * retention period means no date.
 */

/** The interview score out of 5, or nothing while there is none. */
export function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return null;
  return (
    <Badge
      tone="accent"
      size="sm"
      icon={<ClipboardCheck />}
      title="Interview score, out of 5"
    >
      Score {score.toFixed(2)}
    </Badge>
  );
}

/** "Scheduled for deletion on 3 Nov 2027", or nothing when there is no date. */
export function DeletionLine({
  day,
  className,
}: {
  day: string | null | undefined;
  className?: string;
}) {
  if (!day) return null;
  return (
    <p className={className ?? "text-meta text-muted"}>
      Scheduled for deletion on {formatDateShort(`${day}T00:00:00Z`, "UTC")}
    </p>
  );
}
