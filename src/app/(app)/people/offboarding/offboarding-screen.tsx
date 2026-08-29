"use client";

import { useState } from "react";
import Link from "next/link";
import { DoorOpen, ListChecks, Search, UserMinus } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  EmptyState,
  Input,
  ProgressMeter,
  SegmentedControl,
  Skeleton,
  Stat,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { Can, useCan } from "@/lib/permissions";
import { useExits } from "@/lib/store/offboarding";
import { shortDate } from "@/lib/today";
import { statusTone } from "./status-tone";
import { StartExitDialog } from "./start-exit";

/**
 * Exit management.
 *
 * One list and one detail page, where the incumbent has
 * `/exit/resignation-requests`, `/exit/clearance-checklist`, `/exit/interviews`
 * and `/exit/reports`. Those are four filings of one fact — somebody is leaving
 * and these things have to happen before they go — and a business owner should
 * not have to learn a filing system to close an employment record.
 *
 * A row is a person, a date, and how far through they are. Everything you can
 * *do* is on the row's own page, because every action needs to know which task
 * it is about.
 */
export function OffboardingScreen() {
  const [view, setView] = useState<"open" | "closed" | "all">("open");
  const [query, setQuery] = useState("");
  const [starting, setStarting] = useState(false);

  const exits = useExits({ state: view, q: query.trim() || undefined, pageSize: 50 });
  const isHr = useCan("EDIT_RECORDS");

  const leavingSoon = exits.rows.filter(
    (row) => row.status !== "COMPLETED" && row.status !== "DECLINED",
  ).length;
  const waitingOnSomebody = exits.rows.filter(
    (row) => row.status === "AWAITING_MANAGER" || row.status === "AWAITING_HR",
  ).length;

  return (
    <>
      <PageHeader
        title="Exit management"
        meta={
          DEMO_ENABLED && exits.source === "demo" ? (
            <Badge tone="warning" size="sm">
              Demo · this browser only
            </Badge>
          ) : undefined
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* Second, and quieter. The checklist is something a company edits
                once if at all — the defaults are seeded so that nobody has to
                open it before processing their first leaver. */}
            <Can permission="MANAGE_SETTINGS">
              <ButtonLink
                href="/people/offboarding/checklist"
                variant="secondary"
                size="sm"
              >
                <ListChecks aria-hidden="true" className="size-4" />
                Exit checklist
              </ButtonLink>
            </Can>
            <Can permission="EDIT_RECORDS">
              <Button variant="accent" size="sm" onClick={() => setStarting(true)}>
                <UserMinus aria-hidden="true" className="size-4" />
                Start an exit
              </Button>
            </Can>
          </div>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {exits.error && (
          <LoadFailure subject="the list" error={exits.error}  onRetry={exits.reload}/>
        )}

        {/* Two numbers, not three. "Working through a checklist" would be
            "Leaving" minus "Waiting on a decision", and a tile that restates
            arithmetic already on screen is padding — three of them is most of a
            phone screen before the actual list. */}
        {view === "open" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat label="Leaving" value={String(leavingSoon)} hint="still open" />
            <Stat
              label="Waiting on a decision"
              value={String(waitingOnSomebody)}
              hint="nobody has approved yet"
            />
          </div>
        )}

        {/* "Start an exit" above is the door for a layoff, a contract ending,
            or HR recording something on somebody's behalf — every exit
            somebody else has to decide to raise. A resignation or retirement
            has a second, more common door that does not live here: staff
            raise their own from their own Profile page, with no permission
            needed, and it lands in this same list the moment they send it. A
            reader looking for that door on this screen alone would not find
            it, which is the whole reason this line exists. */}
        <p className="text-body-sm text-muted">
          Staff can also hand in their own notice from their Profile page —
          it shows up here the same way as one you start for them.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-faint"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, staff number or reason"
              aria-label="Search exits"
              className="pl-9"
            />
          </div>
          <SegmentedControl
            label="Which exits to show"
            value={view}
            onChange={setView}
            options={[
              { value: "open", label: "Open" },
              { value: "closed", label: "Closed" },
              { value: "all", label: "Everyone" },
            ]}
          />
        </div>

        {exits.loading ? (
          <Card>
            <CardBody className="flex flex-col gap-3">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </CardBody>
          </Card>
        ) : exits.rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={<DoorOpen aria-hidden="true" />}
              title={
                query.trim()
                  ? "Nobody matches that"
                  : view === "closed"
                    ? "No exits closed yet"
                    : "Nobody is leaving"
              }
              description={
                query.trim()
                  ? undefined
                  : view === "closed"
                    ? "Closed exits stay here for the record."
                    : "When somebody resigns, retires or their contract ends, they show up here with a checklist."
              }
              action={
                isHr && !query.trim() && view !== "closed" ? (
                  <Button variant="accent" onClick={() => setStarting(true)}>
                    Start an exit
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <Card>
            <CardBody className="flex flex-col gap-2">
              {exits.rows.map((row) => (
                <Link
                  key={row.id}
                  href={`/people/offboarding/${row.id}`}
                  className="flex flex-wrap items-center gap-4 rounded-md border border-line p-3 transition-colors hover:bg-canvas"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
                      {row.employee.name}
                      <Badge tone={statusTone(row.status)} size="sm">
                        {row.statusLabel}
                      </Badge>
                    </p>
                    <p className="mt-0.5 text-body-sm text-muted">
                      {row.employee.jobTitle}
                      {row.employee.departmentName
                        ? ` · ${row.employee.departmentName}`
                        : ""}{" "}
                      · {row.kindLabel}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-meta text-faint">
                      Last day
                    </p>
                    <p className="tabular text-body-sm font-medium text-ink">
                      {shortDate(row.lastWorkingDay)}
                    </p>
                  </div>

                  <ProgressMeter
                    className="w-full sm:w-44"
                    value={row.progress.percent}
                    label={`${row.progress.done} of ${row.progress.total} done`}
                    showValue={false}
                    tone={row.progress.percent === 100 ? "success" : "accent"}
                    size="sm"
                  />
                </Link>
              ))}
            </CardBody>
          </Card>
        )}
      </PageBody>

      {starting && (
        <StartExitDialog
          onClose={() => setStarting(false)}
          onStarted={() => {
            setStarting(false);
            exits.reload();
          }}
        />
      )}
    </>
  );
}
