"use client";

import { useState } from "react";
import { Megaphone, Pin } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader } from "@/components/ui";
import type { ApiBoard, ApiBoardNotice } from "@/lib/api/announcements";

/**
 * The noticeboard on the dashboard.
 *
 * ## It renders nothing when there is nothing
 *
 * The incumbent's dashboard shows a panel reading "Your Announcements Will
 * Appear Here". That is furniture: it occupies the most valuable space on the
 * screen people open first in order to say that a feature exists. This component
 * returns `null` on an empty board, and the grid closes over the gap.
 *
 * Empty is not the same as forbidden, and neither is drawn. `announcements` is
 * always present in the dashboard payload — a noticeboard needs no permission —
 * so unlike the payroll card there is no "you may not see this" state to
 * distinguish. There is only "nothing is up", and the honest rendering of
 * nothing is nothing.
 *
 * ## Three, then the rest, without a second request
 *
 * The API sends up to ten notices with the dashboard and says how many exist in
 * total. So "show the rest" expands what is already in memory rather than
 * fetching, and there is no link to a page a staff member cannot open — every
 * notice they may read is already here. When even ten was a cap, the panel says
 * so rather than dropping the remainder silently.
 *
 * ## The body is shown, not teased
 *
 * A notice is its wording. Truncating it to one line would make the panel a list
 * of headlines about things nobody can read, so the first three are shown in
 * full — the API caps a notice at 4,000 characters, and `whitespace-pre-line`
 * keeps the paragraph breaks somebody typed. Plain text throughout: the API
 * stores plain text and rendering it as HTML would aim a stored-XSS surface at
 * everybody in the company.
 */

/** Shown before the reader asks for more. Three notices is a panel; ten is a page. */
const SHOWN = 3;

export function AnnouncementsPanel({ board }: { board: ApiBoard }) {
  const [expanded, setExpanded] = useState(false);

  /* Nothing to say, so nothing is drawn. Not an empty state, not a placeholder. */
  if (board.notices.length === 0) return null;

  const visible = expanded ? board.notices : board.notices.slice(0, SHOWN);
  const hiddenHere = board.notices.length - visible.length;
  /* The API caps one read at ten. Anything beyond that was never sent, and
     "showing 10 of 14" is information a reader can act on — it explains why the
     notice they half-remember is not here. */
  const beyondTheCap = board.total - board.notices.length;

  return (
    <Card>
      <CardHeader
        title="Noticeboard"
        level={3}
        description={
          board.total === 1
            ? "One notice from your company."
            : `${board.total} notices from your company.`
        }
        action={<Megaphone aria-hidden="true" className="size-4 text-faint" />}
      />
      <CardBody className="flex flex-col gap-4">
        {visible.map((notice) => (
          <Notice key={notice.id} notice={notice} />
        ))}

        {hiddenHere > 0 && (
          <div>
            <Button variant="secondary" size="sm" onClick={() => setExpanded(true)}>
              Show {hiddenHere} more {hiddenHere === 1 ? "notice" : "notices"}
            </Button>
          </div>
        )}

        {expanded && beyondTheCap > 0 && (
          <p className="text-body-sm text-muted">
            Showing the {board.notices.length} most recent of {board.total}.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function Notice({ notice }: { notice: ApiBoardNotice }) {
  return (
    <article className="border-l-2 border-line pl-3.5">
      <div className="flex flex-wrap items-center gap-2">
        {notice.pinned && (
          /* A word as well as an icon. An icon alone is a colour-and-shape cue
             that a screen reader has to guess at. */
          <Badge tone="accent" size="sm" icon={<Pin aria-hidden="true" className="size-3" />}>
            Pinned
          </Badge>
        )}
        {notice.departmentNames.length > 0 && (
          /* Why they got it. A departmental notice reaching somebody who does
             not know why reads as a message sent to the wrong person. */
          <Badge tone="neutral" size="sm">
            {notice.departmentNames.join(", ")}
          </Badge>
        )}
      </div>

      <h4 className="mt-1.5 text-body font-medium text-ink">{notice.title}</h4>

      {/* Plain text, paragraph breaks kept. Never `dangerouslySetInnerHTML`:
          the API stores what somebody typed, and rendering it as markup would
          put a stored-XSS surface on the screen everybody opens first. */}
      <p className="mt-1 whitespace-pre-line text-body-sm leading-relaxed text-body">
        {notice.body}
      </p>

      <p className="mt-1.5 text-meta text-muted">
        {notice.postedByName
          ? `${notice.postedByName} · ${dayLabel(notice.publishedAt)}`
          : dayLabel(notice.publishedAt)}
      </p>
    </article>
  );
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * `19 Aug 2026`, formatted by hand.
 *
 * Not `toLocaleDateString`: this tree renders on the server as well, and a
 * server in one locale and a browser in another produce two different strings
 * for the same date, which React reports as a hydration mismatch.
 */
function dayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()] ?? ""} ${date.getUTCFullYear()}`;
}
