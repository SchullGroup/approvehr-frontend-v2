"use client";

import { useState } from "react";
import Link from "next/link";
import { DoorOpen, Search, UserMinus } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  EmptyState,
  Input,
  ProgressMeter,
  SegmentedControl,
  Skeleton,
  Stat,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { Can, useCan } from "@/lib/permissions";
import { useExits } from "@/lib/store/offboarding";
import { shortDate } from "@/lib/today";
import { statusTone } from "./status-tone";
import { StartExitDialog } from "./start-exit";

/**
 * Leavers.
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
        title="Leavers"
        description="Everyone on their way out, and what is left to do before they go."
        meta={
          exits.source === "demo" ? (
            <Badge tone="warning" size="sm">
              Demo · this browser only
            </Badge>
          ) : undefined
        }
        action={
          <Can permission="EDIT_RECORDS">
            <Button variant="accent" size="sm" onClick={() => setStarting(true)}>
              <UserMinus aria-hidden="true" className="size-4" />
              Record a leaver
            </Button>
          </Can>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {exits.error && (
          <Callout tone="danger" title="Could not load the list">
            {exits.error.message}
          </Callout>
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
              aria-label="Search leavers"
              className="pl-9"
            />
          </div>
          <SegmentedControl
            label="Which leavers to show"
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
                    Record a leaver
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
                    <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-medium text-ink">
                      {row.employee.name}
                      <Badge tone={statusTone(row.status)} size="sm">
                        {row.statusLabel}
                      </Badge>
                    </p>
                    <p className="mt-0.5 text-[0.875rem] text-muted">
                      {row.employee.jobTitle}
                      {row.employee.departmentName
                        ? ` · ${row.employee.departmentName}`
                        : ""}{" "}
                      · {row.kindLabel}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-[0.75rem] uppercase tracking-wide text-faint">
                      Last day
                    </p>
                    <p className="tabular text-[0.9375rem] font-medium text-ink">
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
