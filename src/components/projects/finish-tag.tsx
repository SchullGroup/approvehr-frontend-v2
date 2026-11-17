"use client";

import { Badge } from "@/components/ui";
import {
  acceptedLine,
  FINISH_TAG,
  wontDoLine,
} from "@/lib/projects/finish-marks";
import type { AcceptedMark, WontDoMark } from "@/lib/projects/types";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateShort } from "@/lib/time";

/**
 * "Won't do" and "Accepted", as plain words beside a task's key or status.
 *
 * A task closed as won't do sits in its Done column and was not finished, so wherever a task is shown
 * with its stage the reader needs to be able to tell the two apart without opening it. Plain muted text,
 * like every status here: the words carry the meaning and nothing is a coloured chip. The hover says
 * who and when for a reader with a mouse; the words alone are enough for everybody else.
 *
 * `wontDo` is the whole mark where the list sent one, or just `true` on a Master list row, which carries
 * no detail. Anything else renders nothing: a task with no mark has nothing to say.
 */
export function FinishTag({
  wontDo,
  accepted,
  className,
}: {
  wontDo?: WontDoMark | boolean | null | undefined;
  accepted?: AcceptedMark | null | undefined;
  className?: string;
}) {
  const timeZone = useOrgTimezone();
  if (!wontDo && !accepted) return null;
  const day = (iso: string) => formatDateShort(iso, timeZone);
  return (
    <>
      {wontDo && (
        <Badge
          size="sm"
          className={className}
          {...(typeof wontDo === "object"
            ? { title: wontDoLine(wontDo, day) }
            : {})}
        >
          {FINISH_TAG.wontDo}
        </Badge>
      )}
      {accepted && (
        <Badge
          size="sm"
          className={className}
          title={acceptedLine(accepted, day)}
        >
          {FINISH_TAG.accepted}
        </Badge>
      )}
    </>
  );
}
