"use client";

import { useState } from "react";
import { Eye, Users } from "lucide-react";
import {
  Badge,
  Drawer,
  EmptyState,
  ListSkeleton,
  LoadState,
  ProgressMeter,
  Tabs,
} from "@/components/ui";
import type { TabItem } from "@/components/ui";
import { LoadMore } from "@/components/portal/load-more";
import {
  audienceLabel,
  type ApiAnnouncement,
  type ApiReader,
  type ReaderState,
} from "@/lib/api/announcements";
import { useAnnouncementReaders } from "@/lib/store/announcements";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateTimeShort } from "@/lib/time";

/**
 * Who has opened a notice, and who still has to.
 *
 * A drawer beside the list and not a page of its own: the question is "did they
 * see the thing I just posted", asked from the row, and the answer is a list of
 * names and a way back to the list. Read-only. There is no export on purpose, and
 * no way to nudge anybody from here: the API sends no reminders for a must-read
 * notice, and a button that looked like one would be promising it.
 *
 * ## Two lists, and the chase list leads for a must-read notice
 *
 * "Read" is the evidence, newest first; "Still to read" is who to ask, by name.
 * For a notice staff must read, the second is the reason anybody opens this, so
 * the drawer opens on it. For an ordinary notice it opens on the evidence. Either
 * way both counts are on the tabs, from the first answer.
 *
 * ## The numbers are the API's
 *
 * "7 of 12" is `counts.read` of `counts.reach`, and the rate is the API's own
 * whole percent. Nothing is added up here: the two lists are different pages of
 * different orderings, and a count made by adding rows would disagree with the
 * server the moment there is a second page. With nobody in the audience the rate
 * is `null`, which is not 0%, and is said in words.
 *
 * ## A person with no staff record is still a person
 *
 * The list is per account. An owner can read a company-wide notice without being
 * on the staff register, and appears with no department; the row says so rather
 * than leaving a blank that looks like missing data.
 *
 * ## It asks nothing for somebody who may not read it
 *
 * The API refuses the list to anybody without the settings permission, and so
 * does `useAnnouncementReaders`, by not asking. This screen is only reachable from
 * the management list, which has the same gate.
 */

/** The notice the drawer last showed, kept through the exit so it does not go blank on the way out. */
export function ReadersDrawer({
  notice,
  onClose,
}: {
  notice: ApiAnnouncement | null;
  onClose: () => void;
}) {
  const [shown, setShown] = useState<ApiAnnouncement | null>(notice);
  if (notice !== null && notice !== shown) setShown(notice);

  return (
    <Drawer
      open={notice !== null}
      onClose={onClose}
      size="lg"
      title={shown ? `Who has read “${shown.title}”` : "Who has read this"}
      {...(shown
        ? {
            description: `For ${audienceLabel(shown.audience, shown.departmentNames).toLowerCase()}`,
          }
        : {})}
    >
      {/* Mounted afresh for each notice: the tab it opens on and the pages it
          has loaded belong to one notice. */}
      {shown && <ReadersBody key={shown.id} notice={shown} />}
    </Drawer>
  );
}

function ReadersBody({ notice }: { notice: ApiAnnouncement }) {
  const timeZone = useOrgTimezone();
  /* The chase list first for a must-read notice. `notice.mandatory` is the row's
     own value, there before any request has answered. */
  const [tab, setTab] = useState<ReaderState>(
    notice.mandatory ? "unread" : "read",
  );
  const readers = useAnnouncementReaders(notice.id, tab);
  const { meta } = readers;

  /* A count on a tab is a count, so it waits for an answer. */
  const items: TabItem[] = [
    {
      id: "read",
      label: "Read",
      ...(meta ? { count: meta.counts.read } : {}),
    },
    {
      id: "unread",
      label: "Still to read",
      ...(meta ? { count: meta.counts.unread } : {}),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Summary meta={meta} />

      <Tabs
        items={items}
        value={tab}
        onChange={(next) => setTab(next === "unread" ? "unread" : "read")}
      >
        <LoadState
          loading={readers.loading}
          error={readers.error}
          onRetry={readers.reload}
          subject="who has read this notice"
          skeleton={<ListSkeleton rows={6} />}
        >
          {readers.rows.length === 0 ? (
            <Empty tab={tab} reach={meta?.counts.reach ?? null} />
          ) : (
            <>
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                {readers.rows.map((reader) => (
                  <ReaderRow
                    key={reader.userId}
                    reader={reader}
                    showWhen={tab === "read"}
                    timeZone={timeZone}
                  />
                ))}
              </ul>
              <div className="mt-3">
                <LoadMore
                  shown={readers.rows.length}
                  total={readers.total}
                  noun={["person", "people"]}
                  hasMore={readers.hasMore}
                  loading={readers.loadingMore}
                  error={readers.moreError}
                  onLoadMore={readers.loadMore}
                />
              </div>
            </>
          )}
        </LoadState>
      </Tabs>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * "7 of 12 have read it", and how loudly to say who has not.
 *
 * Nothing until the first answer: a figure read off nothing is not a zero.
 */
function Summary({
  meta,
}: {
  meta: ReturnType<typeof useAnnouncementReaders>["meta"];
}) {
  if (!meta) return null;
  const { counts, readRate } = meta;

  if (counts.reach === 0 || readRate === null) {
    return (
      <p className="text-body-sm text-muted">
        Nobody is in this notice&rsquo;s audience yet, so there is nobody to
        have read it.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {meta.mandatory && (
          <Badge tone="accent" size="sm">
            Must read
          </Badge>
        )}
        <p className="text-body-sm text-ink">
          <span className="tabular font-semibold">{counts.read}</span> of{" "}
          <span className="tabular font-semibold">{counts.reach}</span>{" "}
          {counts.reach === 1 ? "person has" : "people have"} read it
        </p>
      </div>
      <ProgressMeter
        value={readRate}
        label="Read"
        valueLabel={`${readRate}%`}
        size="sm"
      />
      {meta.mandatory && counts.unread > 0 && (
        <p className="text-body-sm text-muted">
          Staff are expected to open this one. {counts.unread}{" "}
          {counts.unread === 1 ? "person has" : "people have"} not yet.
        </p>
      )}
    </div>
  );
}

function Empty({ tab, reach }: { tab: ReaderState; reach: number | null }) {
  if (tab === "read") {
    return (
      <EmptyState
        compact
        icon={<Eye aria-hidden="true" />}
        title="Nobody has opened it yet"
        description={
          reach === 0
            ? "Nobody is in its audience yet."
            : "A name appears here the first time that person opens it."
        }
      />
    );
  }
  return (
    <EmptyState
      compact
      icon={<Users aria-hidden="true" />}
      title={
        reach === 0
          ? "Nobody is in its audience yet"
          : "Everybody it is for has read it"
      }
    />
  );
}

/**
 * One account: the name, where they sit, and when they opened it.
 *
 * Two lines at most. The date is only on the "read" list, where it is the point;
 * on the chase list there is nothing to date.
 */
function ReaderRow({
  reader,
  showWhen,
  timeZone,
}: {
  reader: ApiReader;
  showWhen: boolean;
  timeZone: string;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
      <div className="min-w-0">
        <p
          className="truncate text-body-sm font-medium text-ink"
          title={reader.name}
        >
          {reader.name}
        </p>
        <p className="truncate text-meta text-muted">
          {reader.department ??
            (reader.employeeId === null ? "No staff record" : "No department")}
        </p>
      </div>
      {showWhen && reader.readAt && (
        <p className="tabular shrink-0 text-meta text-muted">
          {formatDateTimeShort(reader.readAt, timeZone)}
        </p>
      )}
    </li>
  );
}
