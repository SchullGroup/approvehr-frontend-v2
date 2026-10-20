"use client";

import { useMemo } from "react";
import { PenLine, ShieldAlert, Scale, UserRound } from "lucide-react";
import { Callout } from "@/components/ui";
import {
  FINDINGS_CAVEAT,
  findingsAcross,
  findingsHeadline,
  type Finding,
  type FindingKind,
} from "@/lib/performance/review-language";

/**
 * What a mark could not be defended on, shown while somebody writes it.
 *
 * Manager reviews only, never self-reviews: this checks whether a judgement
 * of someone else would survive a dispute, which doesn't apply to a person's
 * own account of their own work.
 *
 * Never blocks sending — the API accepts the review either way, and
 * `FINDINGS_CAVEAT` says so plus that four rules can't judge fairness.
 *
 * Always quotes the exact words written rather than paraphrasing a judgement
 * ("this reads as judgemental") — a quote is a fact to act on or dismiss.
 */

const ICONS: Record<FindingKind, React.ReactNode> = {
  character: <UserRound aria-hidden="true" />,
  absolute: <Scale aria-hidden="true" />,
  sensitive: <ShieldAlert aria-hidden="true" />,
  comparison: <PenLine aria-hidden="true" />,
};

const LABELS: Record<FindingKind, string> = {
  character: "About the person",
  absolute: "Cannot be shown",
  sensitive: "Not about performance",
  comparison: "Against a colleague",
};

function Row({ finding }: { finding: Finding }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface text-warning-text [&>svg]:size-3.5"
      >
        {ICONS[finding.kind]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="text-meta font-semibold text-muted">
            {LABELS[finding.kind]}
          </span>
          {/* Quoted as written, never characterised. */}
          <q className="text-body-sm font-medium text-ink">{finding.phrase}</q>
        </span>
        <p className="mt-0.5 text-body-sm text-body">{finding.says}</p>
        <p className="mt-0.5 text-body-sm text-muted">{finding.instead}</p>
      </span>
    </li>
  );
}

/**
 * `texts` is every box on the form that carries prose. Recomputed on each
 * keystroke — affordable since it's local, not a request (see
 * `review-language.ts`).
 */
export function LanguageCheck({
  texts,
  /** Who the review is about — without it, only pronoun forms are caught, not
   *  a name used directly (e.g. "Chidera is..."). See `nameAlternatives`. */
  subjectName,
  /** True once somebody has pressed Send and been shown this. */
  acknowledged = false,
}: {
  texts: string[];
  subjectName?: string;
  acknowledged?: boolean;
}) {
  const findings = useMemo(
    () => findingsAcross(texts, subjectName),
    [texts, subjectName],
  );

  /* No matches: renders nothing rather than a green tick — four rules cannot
     certify a review as good. */
  if (findings.length === 0) return null;

  return (
    <Callout
      tone={acknowledged ? "warning" : "info"}
      title={
        acknowledged
          ? `${findingsHeadline(findings.length)}. Press Send again to send it anyway`
          : findingsHeadline(findings.length)
      }
    >
      <ul className="mt-1 flex flex-col gap-3">
        {findings.map((finding) => (
          <Row
            key={`${String(finding.at)}-${finding.phrase}`}
            finding={finding}
          />
        ))}
      </ul>
      <p className="mt-3 text-body-sm text-muted">{FINDINGS_CAVEAT}</p>
    </Callout>
  );
}
