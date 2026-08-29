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
 * ## Where this appears and where it does not
 *
 * On a **manager review only**. Not on a self-review, and that is a decision
 * rather than an oversight: this checks whether a judgement of somebody else
 * would survive being read back in a dispute, and a self-review is not the
 * rating of record. "I am disorganised" is a person's own account of their own
 * work, and flagging it would be both patronising and wrong — an employee
 * mentioning their own maternity leave is disclosure they are entitled to make.
 *
 * ## It never blocks, and it says so in the box
 *
 * The API accepts the review either way. `FINDINGS_CAVEAT` is rendered with
 * every list, because a checker that presents itself as a verdict gets argued
 * with and one that presents itself as a prompt gets read. It also admits what
 * it cannot do: four rules cannot tell whether a review is fair.
 *
 * ## Quoted, never paraphrased
 *
 * Each row shows the words that were actually written. That is the whole
 * difference between this and a model saying "this reads as judgemental" — a
 * quote is a fact the writer can act on or dismiss at a glance, and an opinion
 * about their tone is an argument.
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
          <span className="text-meta font-semibold uppercase tracking-[0.08em] text-muted">
            {LABELS[finding.kind]}
          </span>
          {/* The words as written. A quote is a fact; a characterisation of
              somebody's tone is an argument. */}
          <q className="text-body-sm font-medium text-ink">{finding.phrase}</q>
        </span>
        <p className="mt-0.5 text-body-sm text-body">{finding.says}</p>
        <p className="mt-0.5 text-body-sm text-muted">{finding.instead}</p>
      </span>
    </li>
  );
}

/**
 * `texts` is every box on the form that carries prose.
 *
 * Recomputed on each keystroke, which is affordable because there is no request
 * behind it — see the header of `review-language.ts` on why this is not the
 * assistant.
 */
export function LanguageCheck({
  texts,
  /**
   * Who the review is about.
   *
   * Without it, "Chidera is quite disorganised" is invisible and only the
   * pronoun forms are caught — which is not how most reviews are written. See
   * `nameAlternatives` in `review-language.ts`.
   */
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

  /* Nothing matched. Deliberately renders nothing rather than a green tick:
     four rules cannot certify a review, and a tick would claim they had. */
  if (findings.length === 0) return null;

  return (
    <Callout
      tone={acknowledged ? "warning" : "info"}
      title={
        acknowledged
          ? `${findingsHeadline(findings.length)} — press Send again to send it anyway`
          : findingsHeadline(findings.length)
      }
    >
      <ul className="mt-1 flex flex-col gap-3">
        {findings.map((finding) => (
          <Row key={`${String(finding.at)}-${finding.phrase}`} finding={finding} />
        ))}
      </ul>
      <p className="mt-3 text-body-sm text-muted">{FINDINGS_CAVEAT}</p>
    </Callout>
  );
}
