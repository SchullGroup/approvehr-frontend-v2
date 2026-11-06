"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import Link from "next/link";
import {
  Button,
  EmptyState,
  LoadState,
  SegmentedControl,
} from "@/components/ui";
import { LoadMore } from "@/components/portal/load-more";
import { CompletedItem } from "@/components/performance/completed-item";
import { BulkLinkDialog } from "@/components/projects/bulk-link-dialog";
import { BULK_LINK_LIMIT } from "@/lib/projects/bulk-link";
import type { TeamCompletedPerson } from "@/lib/projects/completions";
import {
  periodAfter,
  periodAround,
  periodBefore,
  type WorkPeriodKind,
} from "@/lib/projects/work-periods";
import { useBulkLink, useTeamCompleted } from "@/lib/store/completions";
import { useOrgTimezone } from "@/lib/store/session";
import { todayIn } from "@/lib/time";

/**
 * Team tasks, "Completed": what the people you lead finished.
 *
 * The finished tasks of the people you lead over a week, a month or a quarter,
 * a person at a time, with the project, the day it was finished and whether that
 * was by its due date. It is a list of facts for a manager to read. There is no
 * grade on any row and nothing here asks to be graded: finishing project work
 * files nothing for anybody to mark.
 *
 * The period steps like the Work record. People come a page at a time, and one
 * person's list is capped with a link to their full work record. A task can be
 * linked to an objective from here, one person's at a time, which is optional
 * and never required of anyone.
 */

const PERIODS: { value: Exclude<WorkPeriodKind, "day">; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
];

export function CompletedTeam() {
  const timeZone = useOrgTimezone();
  const today = todayIn(timeZone);
  const [kind, setKind] = useState<Exclude<WorkPeriodKind, "day">>("week");
  /* Any day inside the period; undefined is today. */
  const [anchor, setAnchor] = useState<string | undefined>(undefined);

  const period = periodAround(kind, anchor ?? today);
  const list = useTeamCompleted(kind, anchor ?? today);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Period"
          options={PERIODS}
          value={kind}
          onChange={(next) => {
            setKind(next);
            setAnchor(undefined);
          }}
        />
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-label="Previous period"
            onClick={() => setAnchor(periodBefore(period).start)}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Button>
          <span className="min-w-40 text-center text-body-sm font-medium text-ink">
            {period.label}
          </span>
          <Button
            variant="secondary"
            size="sm"
            aria-label="Next period"
            onClick={() => setAnchor(periodAfter(period).start)}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>

      {/* Loading, failure and the answer are one decision, so nothing is drawn
          from a read that has not answered. */}
      <LoadState
        loading={list.loading}
        error={list.error}
        subject="completed tasks"
        onRetry={list.reload}
        hasData={list.people.length > 0}
        skeleton="list"
      >
        {list.people.length === 0 ? (
          <EmptyState
            icon={<ListChecks aria-hidden="true" />}
            title={`Nobody you lead finished a task in this ${period.kind}.`}
          />
        ) : (
          <>
            <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
              {list.people.map((person) => (
                <PersonCompleted
                  key={person.employee.id}
                  person={person}
                  timeZone={timeZone}
                  startOpen={list.people.length <= 3}
                  onChanged={list.reload}
                />
              ))}
            </ul>
            <LoadMore
              shown={list.people.length}
              total={list.total}
              noun={["person", "people"]}
              hasMore={list.hasMore}
              loading={list.loadingMore}
              error={list.moreError}
              onLoadMore={list.loadMore}
            />
          </>
        )}
      </LoadState>
    </div>
  );
}

/* ------------------------------------------------------------ one person */

function PersonCompleted({
  person,
  timeZone,
  startOpen,
  onChanged,
}: {
  person: TeamCompletedPerson;
  timeZone: string;
  startOpen: boolean;
  onChanged: () => void;
}) {
  const run = useBulkLink();
  const { employee, summary, items, itemsTotal } = person;
  const [open, setOpen] = useState(startOpen);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [linking, setLinking] = useState(false);
  const panel = `completed-${employee.id}`;

  const chosen = useMemo(
    () => items.filter((item) => picked.has(item.id)),
    [items, picked],
  );
  const atLimit = picked.size >= BULK_LINK_LIMIT;

  const toggle = (id: string) =>
    setPicked((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const facts = [
    `${String(summary.finished)} finished`,
    summary.withDueDate > 0
      ? `${String(summary.onTime)} on time, ${String(summary.late)} late`
      : null,
    `${String(summary.linked)} linked to an objective`,
  ].filter(Boolean);

  return (
    <li data-person-row>
      <div className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-center sm:gap-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text sm:w-64 sm:shrink-0"
        >
          <ChevronRight
            aria-hidden="true"
            className={
              open
                ? "size-4 shrink-0 rotate-90 text-muted motion-safe:transition-transform"
                : "size-4 shrink-0 text-muted motion-safe:transition-transform"
            }
          />
          <span className="min-w-0">
            <span className="block break-words text-body-sm font-medium text-ink">
              {employee.name}
            </span>
            {employee.jobTitle && (
              <span className="block break-words text-meta text-muted">
                {employee.jobTitle}
              </span>
            )}
          </span>
        </button>
        <p className="pl-6 text-meta text-muted sm:pl-0">{facts.join(" · ")}</p>
      </div>

      {open && (
        <div id={panel} className="border-t border-line bg-canvas px-3 py-3">
          {chosen.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-body-sm">
              <span className="text-ink">
                {chosen.length === 1
                  ? "1 chosen"
                  : `${String(chosen.length)} chosen`}
              </span>
              <Button size="sm" onClick={() => setLinking(true)}>
                Link to an objective
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPicked(new Set())}
              >
                Clear choice
              </Button>
              {atLimit && (
                <span className="text-meta text-muted">
                  Up to {String(BULK_LINK_LIMIT)} at a time.
                </span>
              )}
            </div>
          )}
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <CompletedItem
                key={item.id}
                item={item}
                timeZone={timeZone}
                selection={{
                  checked: picked.has(item.id),
                  onChange: () => toggle(item.id),
                  disabled: atLimit,
                }}
              />
            ))}
          </ul>
          {itemsTotal > items.length && (
            <p className="mt-3 text-meta text-muted">
              Showing the latest {String(items.length)} of {String(itemsTotal)}.{" "}
              <Link
                href={`/performance/history/${employee.id}`}
                className="font-medium text-accent hover:underline"
              >
                Open {employee.name}&apos;s work record
              </Link>{" "}
              for all of it.
            </p>
          )}
        </div>
      )}

      <BulkLinkDialog
        open={linking}
        onClose={() => setLinking(false)}
        tasks={chosen}
        assigneeId={employee.id}
        run={(target) =>
          run(
            chosen.map((item) => ({
              id: item.id,
              key: item.key,
              personId: item.personId,
            })),
            target,
          )
        }
        onDone={() => {
          /* The dialog says what happened, task by task. Here the tasks are no
             longer "chosen", and the list asks again so its links are current. */
          setPicked(new Set());
          onChanged();
        }}
      />
    </li>
  );
}
