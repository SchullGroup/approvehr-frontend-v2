"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Sparkles } from "lucide-react";
import {
  Avatar,
  Card,
  EmptyState,
  SegmentedControl,
  Spinner,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import {
  STATUS,
  exactPct,
  exactPoints,
} from "@/components/performance/record-check";
import { SuggestButton } from "@/components/performance/suggestions";
import type {
  ApiClaim,
  ApiClaims,
  ApiReviewFlag,
  ApiReviewFlags,
} from "@/lib/api/performance";
import {
  useAutoReviewNote,
  useReviewBriefing,
  type SuggestState,
} from "@/lib/store/ai";
import { useReviewFlag } from "@/lib/store/performance";
import { cn } from "@/lib/cn";

type Filter = "all" | "below" | "above";

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
  const [filter, setFilter] = useState<Filter>("all");
  const [picked, setPicked] = useState<string | null>(null);
  const [showUnclear, setShowUnclear] = useState(false);
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
      <Card className="flex items-center gap-2 p-5 text-body-sm text-muted">
        <Spinner size="sm" />
        Comparing marks with records
      </Card>
    ) : null;
  }

  const flagged = flags.people.filter(
    (p) => p.status === "below" || p.status === "above",
  );
  const unclear = flags.people.filter((p) => p.status === "unclear");
  const visible = flagged.filter(
    (p) => filter === "all" || p.status === filter,
  );
  const selected =
    visible.find((p) => p.employeeId === picked) ?? visible[0] ?? null;
  const gap = String(flags.rules.gapBp / 100);

  return (
    <div className="flex flex-col gap-4">
      <Briefing cycleId={cycleId} gap={gap} hasFlags={flagged.length > 0} />

      {flagged.length === 0 ? (
        <Card>
          <EmptyState
            title="Nobody to review"
            description={`Every mark is within ${gap} points of the record, or there isn't enough evidence to tell.`}
          />
        </Card>
      ) : (
        <Card className="grid overflow-hidden lg:grid-cols-[minmax(280px,340px)_1fr]">
          <div className="flex flex-col border-line lg:border-r">
            <div className="border-b border-line p-3">
              <SegmentedControl
                label="Show"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: `All ${String(flagged.length)}` },
                  {
                    value: "below",
                    label: `Below ${String(flags.counts.below)}`,
                  },
                  {
                    value: "above",
                    label: `Above ${String(flags.counts.above)}`,
                  },
                ]}
              />
            </div>
            <ul className="flex-1 divide-y divide-line">
              {visible.map((person) => (
                <li key={person.employeeId}>
                  <PersonRow
                    person={person}
                    current={person.employeeId === selected?.employeeId}
                    onSelect={() => {
                      setPicked(person.employeeId);
                      // Stacked below the list on narrow screens, so bring it into view.
                      if (window.matchMedia("(max-width: 1023px)").matches)
                        requestAnimationFrame(() =>
                          detail.current?.scrollIntoView({
                            behavior: "smooth",
                          }),
                        );
                    }}
                  />
                </li>
              ))}
            </ul>
            {unclear.length > 0 && (
              <div className="border-t border-line px-4 py-3">
                <button
                  type="button"
                  onClick={() => setShowUnclear((v) => !v)}
                  aria-expanded={showUnclear}
                  className="text-left text-meta text-muted hover:text-ink"
                >
                  {unclear.length} can’t be checked — not enough evidence
                  <span aria-hidden="true"> {showUnclear ? "▴" : "▾"}</span>
                </button>
                {showUnclear && (
                  <ul className="mt-2 space-y-1">
                    {unclear.map((p) => (
                      <li key={p.employeeId} className="text-meta text-body">
                        {p.name}
                        <span className="text-muted"> · {role(p)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div
            ref={detail}
            className="scroll-mt-4 border-t border-line lg:border-t-0"
          >
            {selected && (
              <PersonDetail
                key={selected.employeeId}
                cycleId={cycleId}
                person={selected}
              />
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function Briefing({
  cycleId,
  gap,
  hasFlags,
}: {
  cycleId: string;
  gap: string;
  hasFlags: boolean;
}) {
  const briefing = useReviewBriefing();
  const note =
    briefing.outcome?.available === true
      ? briefing.outcome.suggestions[0]
      : undefined;
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[68ch]">
          <h3 className="text-h4 text-ink">
            Marks that don’t match the record
          </h3>
          <p className="mt-1 text-body-sm text-muted">
            People marked at least {gap} points away from what their objectives,
            peer feedback and past marks suggest. A flag is a reason to look,
            not a finding. Their own manager never sees it.
          </p>
        </div>
        {hasFlags && !note && !briefing.loading && (
          <SuggestButton
            label="Summarise the period"
            loading={briefing.loading}
            onClick={() => void briefing.ask({ cycleId })}
          />
        )}
      </div>
      {(briefing.loading || briefing.error || briefing.outcome) && (
        <div className="border-t border-line pt-3">
          <Prose state={briefing} label="Period summary" />
        </div>
      )}
    </Card>
  );
}

function PersonRow({
  person,
  current,
  onSelect,
}: {
  person: ApiReviewFlag;
  current: boolean;
  onSelect: () => void;
}) {
  const below = person.status === "below";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={current ? "true" : undefined}
      className={cn(
        "relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
        current ? "bg-sunken" : "hover:bg-canvas",
      )}
    >
      {current && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-0.5 bg-accent"
        />
      )}
      <Avatar name={person.name} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-sm font-medium text-ink">
          {person.name}
        </span>
        <span className="block truncate text-meta text-muted">
          {role(person)}
        </span>
      </span>
      {person.gapBp !== null && (
        <span className="flex shrink-0 items-center gap-1 text-meta font-semibold tabular-nums text-warning-text">
          {below ? (
            <ArrowDown aria-hidden="true" className="size-3.5" />
          ) : (
            <ArrowUp aria-hidden="true" className="size-3.5" />
          )}
          {String(Math.abs(person.gapBp) / 100)}
          <span className="sr-only">
            {" "}
            points {below ? "below" : "above"} their record
          </span>
        </span>
      )}
    </button>
  );
}

function PersonDetail({
  cycleId,
  person,
}: {
  cycleId: string;
  person: ApiReviewFlag;
}) {
  const note = useAutoReviewNote(cycleId, person.employeeId, true);
  const { claims } = useReviewFlag(cycleId, person.employeeId, true);
  const [view, setView] = useState<"claims" | "record">("claims");

  return (
    <div className="flex flex-col divide-y divide-line">
      <header className="flex flex-wrap items-center gap-3 p-5">
        <Avatar name={person.name} size="md" />
        <div className="min-w-0 flex-1 basis-48">
          <h3 className="text-h4 text-ink">{person.name}</h3>
          <p className="text-meta text-muted">{role(person)}</p>
        </div>
        <span className="rounded-full bg-warning-soft px-2.5 py-1 text-meta font-medium text-warning-text">
          {STATUS[person.status].label}
        </span>
      </header>

      <section className="p-5" aria-label="Mark against record">
        <MarkScale person={person} />
      </section>

      <section className="p-5">
        <Prose state={note} label="AI summary" onRetry={note.retry} />
      </section>

      <section className="p-5">
        <h4 className="text-meta font-semibold uppercase tracking-wide text-faint">
          Patterns that apply
        </h4>
        {person.patterns.length ? (
          <ul className="mt-2 space-y-2">
            {person.patterns.map((pattern) => (
              <li
                key={pattern.text}
                className="flex gap-2.5 text-body-sm text-body"
              >
                <span
                  aria-hidden="true"
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-warning"
                />
                {pattern.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-body-sm text-body">
            None. Their manager marks close to average and none of their groups
            is flagged.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4 p-5">
        <SegmentedControl
          className="self-start"
          label="Detail"
          value={view}
          onChange={setView}
          options={[
            { value: "claims", label: "What they wrote" },
            { value: "record", label: "The record" },
          ]}
        />
        {view === "claims" ? (
          claims ? (
            <ClaimsView claims={claims} />
          ) : (
            <p className="text-body-sm text-muted">Loading what was written…</p>
          )
        ) : (
          <RecordView person={person} />
        )}
      </section>
    </div>
  );
}

const clampPct = (bp: number) => Math.min(100, Math.max(0, bp / 100));

function MarkScale({ person }: { person: ApiReviewFlag }) {
  const mark = clampPct(person.markBp);
  const record =
    person.expectedBp === null ? null : clampPct(person.expectedBp);
  return (
    <div className="flex flex-col gap-5">
      <dl className="flex flex-wrap gap-x-10 gap-y-3">
        <div>
          <dt className="text-meta text-muted">Mark</dt>
          <dd className="text-h3 tabular-nums text-ink">
            {exactPct(person.markBp)}
          </dd>
        </div>
        <div>
          <dt className="text-meta text-muted">Record suggests</dt>
          <dd className="text-h3 tabular-nums text-ink">
            {person.expectedBp === null ? "—" : exactPct(person.expectedBp)}
          </dd>
        </div>
        {person.gapBp !== null && (
          <div>
            <dt className="text-meta text-muted">Gap</dt>
            <dd className="text-h3 tabular-nums text-warning-text">
              {exactPoints(person.gapBp)}
            </dd>
          </div>
        )}
      </dl>

      <div aria-hidden="true" className="relative mx-1 h-2">
        <div className="absolute inset-0 rounded-full bg-sunken" />
        {record !== null && (
          <div
            className="absolute inset-y-0 rounded-full bg-warning-soft"
            style={{
              left: `${String(Math.min(mark, record))}%`,
              width: `${String(Math.abs(mark - record))}%`,
            }}
          />
        )}
        {record !== null && (
          <span
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-surface"
            style={{ left: `${String(record)}%` }}
          />
        )}
        <span
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-surface"
          style={{ left: `${String(mark)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-meta text-muted">
        <span>0%</span>
        <span className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-ink" />
            Mark
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border-2 border-accent" />
            Record
          </span>
        </span>
        <span>100%</span>
      </div>
    </div>
  );
}

function Prose({
  state,
  label,
  onRetry,
}: {
  state: SuggestState;
  label: string;
  onRetry?: () => void;
}) {
  const outcome = state.outcome;
  const note = outcome?.available ? outcome.suggestions[0] : undefined;
  const writtenAt = outcome?.available ? outcome.writtenAt : undefined;
  const failure =
    state.error ?? (outcome && !outcome.available ? outcome.reason : null);

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-meta font-semibold uppercase tracking-wide text-accent-text">
        <Sparkles aria-hidden="true" className="size-3.5" />
        {label}
        {writtenAt && (
          <span className="font-normal normal-case tracking-normal text-muted">
            · written{" "}
            {new Date(writtenAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
            })}
          </span>
        )}
      </p>
      {state.loading ? (
        <div className="flex flex-col gap-2" aria-label="Writing">
          <span className="h-3.5 w-11/12 animate-pulse rounded bg-sunken" />
          <span className="h-3.5 w-full animate-pulse rounded bg-sunken" />
          <span className="h-3.5 w-2/3 animate-pulse rounded bg-sunken" />
        </div>
      ) : note ? (
        <>
          <p className="text-body-md font-semibold text-ink">{note.title}</p>
          <p className="max-w-[72ch] text-body-md text-body">{note.detail}</p>
          <p className="text-meta text-muted">
            Written by AI. It can be wrong.
          </p>
        </>
      ) : failure ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-body-sm text-muted">{failure}</p>
          {onRetry && (
            <SuggestButton
              label="Try again"
              loading={false}
              onClick={onRetry}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function ClaimsView({ claims }: { claims: ApiClaims }) {
  const employee = claims.employee;
  const selfWritten =
    employee !== null &&
    (employee.rating !== null ||
      employee.summary !== null ||
      employee.answers.length > 0);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="flex flex-col gap-4">
        {claims.manager.length ? (
          claims.manager.map((claim) => (
            <Claim
              key={claim.author}
              who="Manager"
              name={claim.author}
              claim={claim}
            />
          ))
        ) : (
          <Empty who="Manager" text="No written review submitted yet." />
        )}
      </div>
      <div className="flex flex-col gap-4">
        {employee && selfWritten ? (
          <Claim who="Employee" name="Self-review" claim={employee} />
        ) : (
          <Empty who="Employee" text="No self-review submitted yet." />
        )}
        {employee?.onFinalMark && (
          <p className="text-body-sm text-body">{employee.onFinalMark}</p>
        )}
      </div>
    </div>
  );
}

function Empty({ who, text }: { who: string; text: string }) {
  return (
    <div>
      <p className="text-meta font-semibold uppercase tracking-wide text-faint">
        {who}
      </p>
      <p className="mt-1 text-body-sm text-muted">{text}</p>
    </div>
  );
}

function Claim({
  who,
  name,
  claim,
}: {
  who: string;
  name: string;
  claim: ApiClaim;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-meta font-semibold uppercase tracking-wide text-faint">
          {who}
        </p>
        <p className="text-body-sm text-ink">
          <span className="font-medium">{name}</span>
          {claim.rating && (
            <span className="text-muted"> · {claim.rating}</span>
          )}
        </p>
      </div>
      {claim.summary && (
        <blockquote className="border-l-2 border-line-strong pl-3 text-body-sm text-ink">
          {claim.summary}
        </blockquote>
      )}
      {claim.answers.map((answer) => (
        <figure key={answer.question} className="flex flex-col gap-1">
          <figcaption className="text-meta text-muted">
            {answer.question}
          </figcaption>
          <blockquote className="border-l-2 border-line-strong pl-3 text-body-sm text-ink">
            {answer.answer}
          </blockquote>
        </figure>
      ))}
    </div>
  );
}

function RecordView({ person }: { person: ApiReviewFlag }) {
  const { objectives, peers, history } = person.evidence;
  const rows: [string, string][] = [
    [
      "Objectives",
      objectives.scoreBp === null
        ? "None agreed for this period"
        : `${exactPct(objectives.scoreBp)} achieved · ${String(objectives.agreed)} agreed, ${String(objectives.measured)} measured by key results`,
    ],
    [
      "Peer feedback",
      peers?.averageBp != null
        ? `${exactPct(peers.averageBp)} from ${String(peers.responses)} colleagues`
        : "Fewer than 3 colleagues answered",
    ],
    [
      "Previous periods",
      history
        ? `${exactPct(history.averageBp)} average over ${String(history.periods)}`
        : "None on record",
    ],
  ];
  return (
    <dl className="divide-y divide-line">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="grid gap-1 py-2.5 first:pt-0 sm:grid-cols-[160px_1fr]"
        >
          <dt className="text-meta text-muted">{label}</dt>
          <dd className="text-body-sm text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
