"use client";

import { useState } from "react";
import { Pin } from "lucide-react";
import { Badge, Button, Disclosure } from "@/components/ui";
import { NoticeImage } from "@/components/announcements/notice-image";
import type { ApiBoard, ApiBoardNotice } from "@/lib/api/announcements";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateShort } from "@/lib/time";

/**
 * The noticeboard on the dashboard.
 *
 * ## Closed, and last
 *
 * It used to be a full-width card of up to three whole notices, under the Today
 * panel that lists the very same unread ones. Two presentations of one notice on
 * one screen, and they disagreed about what reading means: Today records a
 * receipt when a notice is opened and this never did. So the Today panel is the
 * place an unread notice is read, and this is what is left that Today cannot be
 * — **everything on the board right now, read or not**. Today lists unread ones
 * only; without this, a notice read at nine could not be found again at ten.
 *
 * It is one closed line with a count, at the foot of the page. Opening it shows
 * the notices in full, as before, and still records nothing: a receipt given by
 * expanding a list that holds ten notices would be evidence of nothing.
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
    <Disclosure
      title="Noticeboard"
      level={3}
      meta={<Badge size="sm">{board.total}</Badge>}
    >
      <div className="flex flex-col gap-4">
        <p className="text-meta text-muted">
          Everything on the board now, read or not. To record that you have read
          one, open it from Today.
        </p>
        {visible.map((notice) => (
          <Notice key={notice.id} notice={notice} />
        ))}

        {hiddenHere > 0 && (
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setExpanded(true)}
            >
              Show {hiddenHere} more {hiddenHere === 1 ? "notice" : "notices"}
            </Button>
          </div>
        )}

        {expanded && beyondTheCap > 0 && (
          <p className="text-body-sm text-muted">
            Showing the {board.notices.length} most recent of {board.total}.
          </p>
        )}
      </div>
    </Disclosure>
  );
}

/* -------------------------------------------------------------------------- */

function Notice({ notice }: { notice: ApiBoardNotice }) {
  const timeZone = useOrgTimezone();

  return (
    <article className="border-l-2 border-line pl-3.5">
      <div className="flex flex-wrap items-center gap-2">
        {notice.mandatory && (
          /* The indigo, and a word: a notice staff are expected to open is not
             a warning. */
          <Badge tone="accent" size="sm">
            Must read
          </Badge>
        )}
        {notice.pinned && (
          /* A word as well as an icon. An icon alone is a colour-and-shape cue
             that a screen reader has to guess at. */
          <Badge
            tone="accent"
            size="sm"
            icon={<Pin aria-hidden="true" className="size-3" />}
          >
            Pinned
          </Badge>
        )}
        {notice.personal && (
          /* Why they got it, as for a department: a message for them alone. */
          <Badge tone="neutral" size="sm">
            Sent to you
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

      <h4 className="mt-1.5 text-body-md font-medium text-ink">
        {notice.title}
      </h4>

      {/* Plain text, paragraph breaks kept. Never `dangerouslySetInnerHTML`:
          the API stores what somebody typed, and rendering it as markup would
          put a stored-XSS surface on the screen everybody opens first. */}
      <p className="mt-1 whitespace-pre-line text-body-sm leading-relaxed text-body">
        {notice.body}
      </p>

      {notice.hasImage && (
        <NoticeImage id={notice.id} alt={notice.title} className="mt-2" />
      )}

      <p className="mt-1.5 text-meta text-muted">
        {notice.postedByName
          ? `${notice.postedByName} · ${formatDateShort(notice.publishedAt, timeZone)}`
          : formatDateShort(notice.publishedAt, timeZone)}
      </p>
    </article>
  );
}
