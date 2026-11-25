"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, CheckCheck, ChevronDown, Search } from "lucide-react";
import { Button, EmptyState, Input, TextLink } from "@/components/ui";
import type { ApiParticipant } from "@/lib/api/performance";
import { cn } from "@/lib/cn";
import { DepartmentCard } from "@/components/ui/department-card";
import { useDepartments } from "@/lib/store/departments";

/**
 * Everyone in the period, once each.
 *
 * A person appears one time, with their own review and each of their reviewers
 * under them, so a name is never repeated down the page. By default only people
 * who still have something to finish are shown; "Everyone" shows all of them.
 */

type Line = { key: string; who: string; sent: boolean; reviewId: string };

/** What is still owed on one person, as lines under their name. */
function linesOf(row: ApiParticipant): Line[] {
  return [
    ...(row.self
      ? [
          {
            key: `self-${row.self.reviewId}`,
            who: "Their own review",
            sent: row.self.submitted,
            reviewId: row.self.reviewId,
          },
        ]
      : []),
    ...row.managers.map((manager) => ({
      key: manager.reviewId,
      who: `Review by ${manager.managerName}`,
      sent: manager.submitted,
      reviewId: manager.reviewId,
    })),
  ];
}

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function PeriodPeople({
  rows,
  onRemind,
}: {
  rows: ApiParticipant[];
  /** Absent when there is nobody to remind, or the reader may not. */
  onRemind: (() => void) | null;
}) {
  const departments = useDepartments();
  const [show, setShow] = useState<"waiting" | "all">("waiting");
  const [query, setQuery] = useState("");
  /** `undefined` is the department cards; `null` is people with no department. */
  const [dept, setDept] = useState<string | null | undefined>(undefined);
  const [openId, setOpenId] = useState<string | null>(null);

  const nameOfDept = (id: string | null) =>
    id === null
      ? "No department"
      : (departments.flat.find((one) => one.id === id)?.name ??
        "No department");

  const people = useMemo(
    () =>
      rows.map((row) => {
        const lines = linesOf(row);
        return { row, lines, left: lines.filter((line) => !line.sent).length };
      }),
    [rows],
  );
  const waiting = people.filter((person) => person.left > 0);

  const cards = useMemo(() => {
    const byDept = new Map<string | null, typeof people>();
    for (const person of people) {
      const key = person.row.departmentId ?? null;
      byDept.set(key, [...(byDept.get(key) ?? []), person]);
    }
    return [...byDept.entries()]
      .map(([id, members]) => {
        const lines = members.reduce((n, m) => n + m.lines.length, 0);
        const left = members.reduce((n, m) => n + m.left, 0);
        return {
          id,
          members,
          lines,
          left,
          waitingPeople: members.filter((m) => m.left > 0).length,
        };
      })
      .sort((a, b) => b.waitingPeople - a.waitingPeople);
  }, [people]);

  const searching = query.trim() !== "";
  const pool =
    dept === undefined || searching
      ? people
      : (cards.find((card) => card.id === dept)?.members ?? []);
  const shown = (
    show === "waiting" ? pool.filter((p) => p.left > 0) : pool
  ).filter((person) =>
    person.row.employeeName.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const showingCards = dept === undefined && !searching;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Who to show"
          className="inline-flex rounded-lg border border-line bg-surface p-0.5"
        >
          {(
            [
              ["waiting", `Waiting ${String(waiting.length)}`],
              ["all", `Everyone ${String(people.length)}`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={show === id}
              onClick={() => setShow(id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-body-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
                show === id
                  ? "bg-accent-soft text-accent-text"
                  : "text-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative min-w-40 flex-1 sm:max-w-xs">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint"
          />
          <Input
            aria-label="Find a person"
            placeholder="Find a person"
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {onRemind && waiting.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onRemind}
            className="ml-auto"
          >
            Send a reminder
          </Button>
        )}
      </div>

      {dept !== undefined && !searching && (
        <button
          type="button"
          onClick={() => setDept(undefined)}
          className="inline-flex items-center gap-1.5 self-start text-body-sm font-medium text-accent-text hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          All departments
          <span className="text-muted">· {nameOfDept(dept)}</span>
        </button>
      )}

      {showingCards ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards
            .filter((card) => show === "all" || card.waitingPeople > 0)
            .map((card) => {
              const share =
                card.lines === 0 ? 0 : (card.lines - card.left) / card.lines;
              return (
                <li key={card.id ?? "none"}>
                  <DepartmentCard
                    name={nameOfDept(card.id)}
                    onClick={() => setDept(card.id)}
                    line={
                      card.waitingPeople === 0
                        ? `${String(card.members.length)} ${card.members.length === 1 ? "person" : "people"}, all in`
                        : `${String(card.waitingPeople)} of ${String(card.members.length)} still waiting`
                    }
                    members={card.members.map((m) => m.row.employeeName)}
                    progress={share}
                  />
                </li>
              );
            })}
        </ul>
      ) : shown.length === 0 ? (
        <EmptyState
          compact
          icon={<CheckCheck aria-hidden="true" />}
          title={
            searching
              ? "Nobody matches"
              : show === "waiting"
                ? "Everyone has finished"
                : "Nobody is in this period yet"
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map(({ row, lines, left }) => {
            const open = openId === row.employeeId;
            return (
              <li
                key={row.employeeId}
                className="rounded-xl border border-line bg-surface"
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : row.employeeId)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-sunken text-meta font-semibold text-body"
                    >
                      {initials(row.employeeName)}
                    </span>
                    <span className="truncate text-body-md font-medium text-ink">
                      {row.employeeName}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span
                      className={cn(
                        "text-meta",
                        left === 0 ? "text-success-text" : "text-muted",
                      )}
                    >
                      {left === 0
                        ? "All in"
                        : `${String(lines.length - left)} of ${String(lines.length)} in`}
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        "size-4 text-faint transition-transform duration-200 motion-reduce:transition-none",
                        open && "rotate-180",
                      )}
                    />
                  </span>
                </button>
                {open && (
                  <ul className="mx-4 mb-2 flex flex-col divide-y divide-line border-t border-line">
                    {lines.map((line) => (
                      <li
                        key={line.key}
                        className="flex items-center justify-between gap-3 py-2.5 text-body-sm"
                      >
                        <span className={line.sent ? "text-muted" : "text-ink"}>
                          {line.who}
                        </span>
                        {line.sent ? (
                          <span className="text-meta text-success-text">
                            Sent
                          </span>
                        ) : (
                          <TextLink
                            href={`/performance/reviews/${line.reviewId}`}
                          >
                            Open
                          </TextLink>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
