"use client";

import { useRef, useState } from "react";
import { ChevronDown, FileSearch, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge, Button, ButtonLink, Callout, Skeleton } from "@/components/ui";
import type {
  CriterionKind,
  Evidence,
  Explanation,
  ExplanationItem,
  ScreeningSubject,
} from "@/lib/hiring/screening/model";
import {
  STALE_NOTE,
  VERDICT_WORDS,
  statusWords,
} from "@/lib/hiring/screening/score";
import { useExplanation } from "@/lib/hiring/screening/use-screening";

/**
 * Why somebody has the score they have.
 *
 * ## What it shows, and what it does not
 *
 * One row per thing the advert asked for: matched, partly, not found, or unknown,
 * with the few words of the CV that say so, the points it earned, and how sure the
 * match is. The one-line formula and the version of the criteria it was worked out
 * with are at the top. **Never the CV itself**: only the short stretches the match
 * was made on, so reading this is not a way round the audited route that opens a
 * file.
 *
 * ## "Unknown" is not "missing"
 *
 * A CV that does not say how many years somebody has worked has not said it is
 * none. That row reads "Unknown", says it is left out of the score, and counts
 * neither for nor against.
 *
 * ## Staff only
 *
 * It is drawn on the record and on a queue row, both of which need the hiring
 * permissions. The narrow view an interview panelist has is a different screen and
 * shows no score.
 */

const GROUPS: { kind: CriterionKind; title: string }[] = [
  { kind: "MUST_HAVE", title: "Must-have skills" },
  { kind: "NICE_TO_HAVE", title: "Nice-to-have skills" },
  { kind: "YEARS", title: "Years of experience" },
  { kind: "EDUCATION", title: "Education level" },
  { kind: "LOCATION", title: "Location" },
];

const CONFIDENCE_WORDS = {
  HIGH: "Sure of this match",
  MEDIUM: "Fairly sure of this match",
  LOW: "Not very sure of this match",
} as const;

/** A short stretch of the CV with the matched words marked. */
function Snippet({ evidence }: { evidence: Evidence }) {
  return (
    <blockquote className="rounded-md border-l-2 border-accent-line bg-canvas px-3 py-1.5 text-meta leading-relaxed text-body [overflow-wrap:anywhere]">
      <span className="sr-only">From the CV: </span>
      {evidence.before}
      <mark className="rounded-sm bg-accent-soft px-0.5 font-medium text-ink">
        {evidence.match}
      </mark>
      {evidence.after}
    </blockquote>
  );
}

function Item({ item }: { item: ExplanationItem }) {
  const words = VERDICT_WORDS[item.verdict];
  return (
    <li className="flex flex-col gap-1.5 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 text-body-sm font-medium text-ink [overflow-wrap:anywhere]">
          {item.label}
        </span>
        <Badge tone={words.tone} size="sm">
          {words.label}
        </Badge>
        {item.confidence &&
          (item.verdict === "MATCHED" || item.verdict === "PARTIAL") && (
            <span className="text-meta text-muted">
              {CONFIDENCE_WORDS[item.confidence]}
            </span>
          )}
        <span className="tabular ml-auto text-meta text-muted">
          {item.verdict === "UNKNOWN"
            ? "Left out of the score"
            : `${String(item.points)} of ${String(item.outOf)} points`}
        </span>
      </div>
      {item.note && <p className="text-meta text-muted">{item.note}</p>}
      {item.evidence.map((evidence, index) => (
        <Snippet key={index} evidence={evidence} />
      ))}
    </li>
  );
}

/** Where they stand against the pass mark: a place to look, and who kept them if so. */
function StandingNote({ explanation }: { explanation: Explanation }) {
  const standing = explanation.standing;
  if (!standing) return null;
  if (standing.kept) {
    return (
      <Callout tone="neutral" title="Kept in the running">
        {standing.kept.by ?? "A person"} kept them in the running, and said:{" "}
        {standing.kept.reason}
      </Callout>
    );
  }
  if (!standing.below) return null;
  return (
    <Callout tone="warning" title="Below the pass mark">
      <ul className="list-disc pl-5">
        {standing.reasons.map((reason) => (
          <li key={reason.kind}>{reason.text}</li>
        ))}
      </ul>
      <p className="mt-2">A person decides what happens next.</p>
    </Callout>
  );
}

/**
 * The explanation as it was given. A pure view: the container below fetches it.
 */
export function ExplanationView({
  explanation,
  criteriaHref,
  onRetryReading,
}: {
  explanation: Explanation;
  /** Where criteria are written, for the "no criteria yet" case. */
  criteriaHref?: string | undefined;
  /** Present only where the API offers to read a CV again. */
  onRetryReading?: (() => Promise<void>) | undefined;
}) {
  const [retrying, setRetrying] = useState(false);
  const fit = {
    status: explanation.status,
    score: explanation.score,
    version: explanation.version,
    stale: explanation.stale,
  };
  const words = statusWords(fit);

  if (explanation.status === "NO_CRITERIA") {
    return (
      <div
        className="flex flex-col items-start gap-3"
        data-testid="explanation"
      >
        <p className="text-body-sm text-body">{words.detail}</p>
        {criteriaHref && (
          <ButtonLink href={criteriaHref} variant="secondary" size="sm">
            Add criteria
          </ButtonLink>
        )}
      </div>
    );
  }

  if (explanation.status !== "SCORED" || explanation.score === null) {
    const { extraction } = explanation;
    return (
      <div
        className="flex flex-col items-start gap-3"
        data-testid="explanation"
      >
        <p className="flex items-center gap-2 text-body-sm font-medium text-ink">
          {extraction.state === "NO_TEXT" ||
          extraction.state === "COULD_NOT_READ" ? (
            <TriangleAlert
              aria-hidden="true"
              className="size-4 text-warning-text"
            />
          ) : (
            <FileSearch aria-hidden="true" className="size-4 text-muted" />
          )}
          {words.label}
        </p>
        <p className="text-body-sm text-body">{words.detail}</p>
        {extraction.reason && (
          <p className="text-body-sm text-muted">{extraction.reason}</p>
        )}
        <StandingNote explanation={explanation} />
        {extraction.canRetry && onRetryReading && (
          <Button
            variant="secondary"
            size="sm"
            loading={retrying}
            onClick={() => {
              setRetrying(true);
              void onRetryReading().finally(() => setRetrying(false));
            }}
          >
            Try reading it again
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="explanation">
      <div className="flex flex-col gap-1">
        <p className="text-body-md font-semibold text-ink">
          Fit score <span className="tabular">{explanation.score}</span> out of
          100
        </p>
        {explanation.formula && (
          <p className="text-meta text-muted">
            How it is worked out: {explanation.formula}
          </p>
        )}
        <p className="text-meta text-muted">
          {explanation.version !== null
            ? `Worked out with version ${String(explanation.version)} of the criteria.`
            : ""}{" "}
          It is advice for the person reading. It decides nothing.
        </p>
      </div>

      <StandingNote explanation={explanation} />

      {explanation.stale && (
        <Callout tone="info" title="Scored with an older version">
          {STALE_NOTE}
          {explanation.currentVersion !== null && explanation.version !== null
            ? ` This score is from version ${String(explanation.version)}, and the advert is now on version ${String(explanation.currentVersion)}.`
            : ""}
        </Callout>
      )}

      <div className="flex flex-col gap-4">
        {GROUPS.map((group) => {
          const items = explanation.items.filter(
            (item) => item.kind === group.kind,
          );
          if (items.length === 0) return null;
          return (
            <section key={group.kind} aria-label={group.title}>
              <h4 className="text-meta font-semibold text-faint">
                {group.title}
              </h4>
              <ul className="divide-y divide-line">
                {items.map((item) => (
                  <Item key={item.id} item={item} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** The explanation, fetched. Used where it sits open on a record. */
export function ExplanationPanel({
  subject,
  criteriaHref,
  enabled = true,
}: {
  subject: ScreeningSubject;
  criteriaHref?: string | undefined;
  enabled?: boolean;
}) {
  const state = useExplanation(subject, enabled);

  if (state.loading) {
    return (
      <div>
        <Skeleton className="h-24 w-full" />
        <span className="sr-only-focusable">Loading the explanation</span>
      </div>
    );
  }
  if (state.error || !state.explanation) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p role="alert" className="text-body-sm text-danger-text">
          {state.error?.message ?? "The explanation could not be loaded."}
        </p>
        <Button variant="secondary" size="sm" onClick={state.reload}>
          Try again
        </Button>
      </div>
    );
  }
  return (
    <ExplanationView
      explanation={state.explanation}
      criteriaHref={criteriaHref}
      onRetryReading={state.canRetry ? state.retry : undefined}
    />
  );
}

/**
 * The same, behind a button on a queue row, fetched when somebody asks. A list of
 * two hundred should not carry two hundred explanations nobody opens.
 */
export function ExplanationDisclosure({
  subject,
  criteriaHref,
  label = "How this score was worked out",
}: {
  subject: ScreeningSubject;
  criteriaHref?: string | undefined;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const asked = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const panelId = `explanation-${subject.kind}-${subject.id}`;

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && !asked.current) {
            asked.current = true;
            setEnabled(true);
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-md py-1 text-body-sm font-medium text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
        {open ? "Hide the explanation" : label}
      </button>
      <div id={panelId} hidden={!open} className="mt-2">
        {open && (
          <ExplanationPanel
            subject={subject}
            criteriaHref={criteriaHref}
            enabled={enabled}
          />
        )}
      </div>
    </div>
  );
}
