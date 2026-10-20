"use client";

import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button, Select, Spinner } from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { exactPct, exactPoints } from "@/components/performance/record-check";
import type {
  ApiClaim,
  ApiClaims,
  ApiReviewFlag,
  ApiReviewFlags,
} from "@/lib/api/performance";
import { useAutoReviewNote } from "@/lib/store/ai";
import { useReviewFlag } from "@/lib/store/performance";
import { cn } from "@/lib/cn";

export function flaggedCount(flags: ApiReviewFlags | null) {
  return flags ? flags.counts.below + flags.counts.above : 0;
}

const role = (p: ApiReviewFlag) =>
  [p.jobTitle, p.department].filter(Boolean).join(" · ") || "No role on file";

export function PeopleToReview({
  cycleId,
  flags,
  loading,
  error,
  reload,
}: {
  cycleId: string;
  flags: ApiReviewFlags | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}) {
  const [index, setIndex] = useState(0);
  const detail = useRef<HTMLDivElement>(null);

  if (error) {
    return (
      <LoadFailure
        subject="the people to review"
        error={error}
        onRetry={reload}
      />
    );
  }
  if (!flags) {
    return loading ? (
      <p className="flex items-center gap-2 py-8 text-body-sm text-muted">
        <Spinner size="sm" />
        Comparing marks with the evidence
      </p>
    ) : null;
  }

  const queue = flags.people.filter(
    (p) => p.status === "below" || p.status === "above",
  );
  const gap = String(flags.rules.gapBp / 100);
  if (!queue.length) {
    return (
      <p className="py-8 text-body-md text-body">
        Nobody to review. Every mark is within {gap} points of what the evidence
        suggests, or there isn’t enough evidence to tell.
      </p>
    );
  }

  const at = Math.min(index, queue.length - 1);
  const person = queue[at]!;
  const go = (next: number) => {
    setIndex(next);
    if (window.matchMedia("(max-width: 1023px)").matches)
      requestAnimationFrame(() =>
        detail.current?.scrollIntoView({ behavior: "smooth" }),
      );
  };

  return (
    <div className="grid pt-2 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-14">
      <nav
        aria-label="People to review"
        className="hidden lg:sticky lg:top-6 lg:block lg:self-start"
      >
        {(["below", "above"] as const).map((dir) => {
          const people = queue.filter((p) => p.status === dir);
          if (!people.length) return null;
          return (
            <div key={dir} className="mb-6">
              <h3 className="mb-2 px-2.5 text-meta font-semibold uppercase tracking-wide text-muted">
                {dir === "below" ? "Below their record" : "Above their record"}
              </h3>
              <ol className="space-y-1">
                {people.map((p) => {
                  const k = queue.indexOf(p);
                  return (
                    <li key={p.employeeId}>
                      <button
                        type="button"
                        onClick={() => go(k)}
                        aria-current={k === at ? "true" : undefined}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2.5 text-left text-body-sm transition-colors",
                          k === at
                            ? "bg-sunken font-medium text-ink"
                            : "text-body hover:bg-canvas",
                        )}
                      >
                        <span className="truncate">{p.name}</span>
                        {p.gapBp !== null && <Gap bp={p.gapBp} />}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
        {flags.counts.unclear > 0 && (
          <p className="px-2.5 text-meta text-muted">
            {flags.counts.unclear} more can’t be checked, not enough evidence.
          </p>
        )}
      </nav>

      <div ref={detail} className="min-w-0 scroll-mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <span className="hidden text-body-sm text-muted lg:inline">
            {at + 1} of {queue.length} to review
          </span>
          <div className="min-w-0 flex-1 lg:hidden">
            <Select
              aria-label="Jump to a person"
              value={String(at)}
              onChange={(event) => go(Number(event.target.value))}
            >
              {queue.map((p, k) => (
                <option key={p.employeeId} value={String(k)}>
                  {`${String(k + 1)} of ${String(queue.length)} · ${p.name}`}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={at === 0}
              onClick={() => go(at - 1)}
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              <span className="max-sm:sr-only">Previous</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={at === queue.length - 1}
              onClick={() => go(at + 1)}
            >
              <span className="max-sm:sr-only">Next</span>
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>
        <Person key={person.employeeId} cycleId={cycleId} person={person} />
      </div>
    </div>
  );
}

function Gap({ bp }: { bp: number }) {
  const Arrow = bp < 0 ? ArrowDown : ArrowUp;
  return (
    <span className="flex shrink-0 items-center gap-0.5 text-meta font-semibold tabular-nums text-warning-text">
      <Arrow aria-hidden="true" className="size-3.5" />
      {String(Math.abs(bp) / 100)}
      <span className="sr-only">
        {" "}
        points {bp < 0 ? "below" : "above"} the evidence
      </span>
    </span>
  );
}

function Person({
  cycleId,
  person,
}: {
  cycleId: string;
  person: ApiReviewFlag;
}) {
  const note = useAutoReviewNote(cycleId, person.employeeId, true);
  const { claims } = useReviewFlag(cycleId, person.employeeId, true);
  const summary = note.outcome?.available
    ? note.outcome.suggestions[0]
    : undefined;
  const writtenAt = note.outcome?.available
    ? note.outcome.writtenAt
    : undefined;
  const failure =
    note.error ??
    (note.outcome && !note.outcome.available ? note.outcome.reason : null);
  const noSummary = !summary && !note.loading;
  const [shown, setShown] = useState<boolean | null>(null);
  const open = shown ?? noSummary;

  return (
    <article className="pt-4">
      <h2 className="text-h3 text-ink">{person.name}</h2>
      <p className="mt-1 text-body-sm text-muted">{role(person)}</p>

      <Figures person={person} />

      <section className="mt-10 max-w-[84ch]">
        <p className="text-body-sm font-semibold text-ink">
          Summary
          {writtenAt && (
            <span className="font-normal text-muted">
              {" "}
              · written{" "}
              {new Date(writtenAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              })}
            </span>
          )}
        </p>
        {note.loading ? (
          <div
            className="mt-4 flex flex-col gap-2.5"
            aria-label="Writing the summary"
          >
            <span className="h-4 w-11/12 animate-pulse rounded bg-sunken" />
            <span className="h-4 w-full animate-pulse rounded bg-sunken" />
            <span className="h-4 w-2/3 animate-pulse rounded bg-sunken" />
          </div>
        ) : summary ? (
          <>
            <p className="mt-3 text-body-lg text-ink">{summary.detail}</p>
            <p className="mt-3 text-meta text-muted">Written by AI</p>
          </>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-body-sm text-muted">
              {failure ?? "No summary available."}
            </p>
            {failure && (
              <Button variant="secondary" size="sm" onClick={note.retry}>
                Try again
              </Button>
            )}
          </div>
        )}
      </section>

      <section className="mt-10 border-t border-line pt-6">
        <button
          type="button"
          onClick={() => setShown(!open)}
          aria-expanded={open}
          className="flex items-center gap-1 text-body-sm font-medium text-accent-text hover:underline"
        >
          {open ? "Hide what this is based on" : "See what this is based on"}
          {open ? (
            <ChevronUp aria-hidden="true" className="size-3.5" />
          ) : (
            <ChevronDown aria-hidden="true" className="size-3.5" />
          )}
        </button>
        {open && <Basis person={person} claims={claims} />}
      </section>
    </article>
  );
}

function Figures({ person }: { person: ApiReviewFlag }) {
  const figure = "mt-1 text-h3 tabular-nums sm:text-h2";
  return (
    <dl className="mt-6 grid grid-cols-3 gap-8">
      <div>
        <dt className="text-meta text-muted">Mark</dt>
        <dd className={cn(figure, "text-ink")}>{exactPct(person.markBp)}</dd>
      </div>
      <div>
        <dt className="text-meta text-muted">Evidence suggests</dt>
        <dd className={cn(figure, "text-ink")}>
          {person.expectedBp === null ? "None" : exactPct(person.expectedBp)}
        </dd>
      </div>
      {person.gapBp !== null && (
        <div>
          <dt className="text-meta text-muted">Gap (points)</dt>
          <dd className="mt-1">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-h3 tabular-nums sm:text-h2",
                "bg-warning-soft text-warning-text",
              )}
            >
              {exactPoints(person.gapBp).replace(" pts", "")}
            </span>
          </dd>
        </div>
      )}
    </dl>
  );
}

const heading = "mb-3 text-body-sm font-semibold text-ink";

// Only what has content is shown.
function Basis({
  person,
  claims,
}: {
  person: ApiReviewFlag;
  claims: ApiClaims | null;
}) {
  const { objectives, peers, history } = person.evidence;
  const employee = claims?.employee;
  const selfWritten =
    !!employee &&
    (employee.rating !== null ||
      employee.summary !== null ||
      employee.answers.length > 0);
  const written = !!claims && (claims.manager.length > 0 || !!employee);
  const record: [string, string][] = [
    ...(objectives.scoreBp === null
      ? []
      : [
          [
            "Objectives",
            `${exactPct(objectives.scoreBp)} achieved · ${String(objectives.agreed)} agreed, ${String(objectives.measured)} measured by key results`,
          ] as [string, string],
        ]),
    ...(peers?.averageBp != null
      ? [
          [
            "Peer feedback",
            `${exactPct(peers.averageBp)} from ${String(peers.responses)} colleagues`,
          ] as [string, string],
        ]
      : []),
    ...(history
      ? [
          [
            "Previous periods",
            `${exactPct(history.averageBp)} average over ${String(history.periods)}`,
          ] as [string, string],
        ]
      : []),
  ];

  const hasContent = person.patterns.length > 0 || written || record.length > 0;

  if (!hasContent) {
    return (
      <p className="mt-6 text-body-sm text-muted">
        No detailed evidence on file for this person yet.
      </p>
    );
  }

  return (
    <div className="mt-6 flex max-w-[72ch] flex-col gap-8">
      {person.patterns.length > 0 && (
        <div>
          <h3 className={heading}>Patterns that apply</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-body-sm text-body">
            {person.patterns.map((p) => (
              <li key={p.text}>{p.text}</li>
            ))}
          </ul>
        </div>
      )}

      {written && (
        <div>
          <h3 className={heading}>What each side wrote</h3>
          {claims.manager.map((claim) => (
            <Claim
              key={claim.author}
              who={`${claim.author}, manager`}
              claim={claim}
            />
          ))}
          {employee && selfWritten && (
            <Claim who={`${person.firstName}, self-review`} claim={employee} />
          )}
          {employee?.onFinalMark && (
            <p className="text-body-sm text-body">{employee.onFinalMark}</p>
          )}
        </div>
      )}

      {record.length > 0 && (
        <div>
          <h3 className={heading}>How the evidence figure is worked out</h3>
          <dl className="text-body-sm">
            {record.map(([label, value]) => (
              <div
                key={label}
                className="grid gap-0.5 py-1.5 sm:grid-cols-[160px_1fr] sm:gap-4"
              >
                <dt className="text-muted">{label}</dt>
                <dd className="text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function Claim({ who, claim }: { who: string; claim: ApiClaim }) {
  return (
    <div className="mb-6 last:mb-0">
      <p className="text-body-sm text-muted">
        <span className="font-medium text-ink">{who}</span>
        {claim.rating && ` · ${claim.rating}`}
      </p>
      {claim.summary && (
        <blockquote className="mt-2 border-l-2 border-line-strong pl-3 text-body-sm text-ink">
          {claim.summary}
        </blockquote>
      )}
      {claim.answers.map((answer) => (
        <figure key={answer.question} className="mt-3">
          <figcaption className="text-meta text-muted">
            {answer.question}
          </figcaption>
          <blockquote className="mt-1 border-l-2 border-line-strong pl-3 text-body-sm text-ink">
            {answer.answer}
          </blockquote>
        </figure>
      ))}
    </div>
  );
}
