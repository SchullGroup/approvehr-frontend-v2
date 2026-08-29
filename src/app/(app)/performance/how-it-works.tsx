"use client";

import Link from "next/link";
import { Layers } from "lucide-react";
import { Badge, Disclosure, EmptyState, Spinner } from "@/components/ui";
import { weightLabel } from "@/lib/api/performance";
import { useFramework, useScoringWeights } from "@/lib/store/performance";

/**
 * The one place the product explains itself, closed by default.
 *
 * ## Why it exists
 *
 * A product owner read this module and could not work out how to create an
 * appraisal or where the periods were. Naming and paths carry most of that fix;
 * this carries the rest, because "objectives", "competencies" and "a weighted
 * composite" are three ideas somebody has to hold at once before the screens
 * make sense, and no button can teach them.
 *
 * `PARITY.md` Rule 4 says a sentence explaining *why* the product is doing
 * something should have been a button doing it. This is the exception the rule
 * implies rather than forbids: it explains what an appraisal **is**, not why the
 * software is behaving oddly, and it is behind a click so that nobody who
 * already knows has to read it. Rule 5's closed-by-default reference material,
 * exactly.
 *
 * ## Every figure here is read, not written
 *
 * The weights come from `GET /performance/scoring-weights` and the parts from
 * the seeded framework. Nothing on this panel is a paraphrase of the scoring
 * model — a paraphrase is how a help page ends up describing arithmetic the code
 * stopped doing two releases ago. The sentences that are not figures are the
 * rules `modules/performance/scoring.ts` enforces, in the order it enforces
 * them.
 *
 * Both hooks are inside components the `Disclosure` only mounts when it is
 * opened, so a reader who never opens this pays for no request.
 */
/**
 * Four lines, on the screen somebody came to do their own review on.
 *
 * This was the full seven-section explainer, opened from a disclosure. Most of
 * it is true and none of an employee's business: they cannot set the weights,
 * cannot freeze them, and can do nothing about a part with nothing recorded
 * against it. Read by somebody who came to write four sentences about their
 * year, it was the product explaining its internals.
 *
 * What is left is what changes what they do: what a period is, what they owe,
 * what their mark is made of, and what happens when it is given. The rest is a
 * page away for anybody who wants it — and it is where whoever runs a period
 * should be reading it anyway.
 */
export function HowItWorks() {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-canvas px-4 py-3.5">
      <p className="text-body-sm font-medium text-ink">
        How your appraisal works
      </p>
      <ul className="flex list-disc flex-col gap-1 pl-4 text-body-sm text-body">
        <li>
          A period is a stretch of time. You get one form inside it, and nobody
          is asked anything until it starts.
        </li>
        <li>
          You write your own review. Your manager writes theirs, and theirs is
          the rating of record.
        </li>
        <li>
          The mark comes from your agreed objectives and your competencies,
          each carrying a set share.
        </li>
        <li>
          When it is final you are told, and you either acknowledge it or say
          you disagree. Both are recorded.
        </li>
      </ul>
      <Link
        href="/performance/how-it-works"
        className="text-meta font-medium text-accent-text underline-offset-2 hover:underline"
      >
        The whole thing, in detail
      </Link>
    </div>
  );
}

export function HowItWorksBody() {
  const { weights, loading, source } = useScoringWeights();
  const rows = weights?.rows ?? [];
  const counted = rows.filter((row) => row.weightBp > 0);

  return (
    <div className="flex max-w-2xl flex-col gap-5 text-body-sm leading-relaxed text-body">
      <div>
        <p className="text-body-sm font-semibold text-ink">
          An appraisal period is a stretch of time
        </p>
        <p className="mt-1">
          A half, a quarter, a probation. Starting one gives every employee a
          form and tells them it is open. Everything below happens inside it,
          and a person&rsquo;s mark belongs to one period rather than to the
          year.
        </p>
      </div>

      <div>
        <p className="text-body-sm font-semibold text-ink">
          Objectives are what people aim at
        </p>
        <p className="mt-1">
          A target with a number on it, filed against the period. It has to be{" "}
          <strong className="font-medium text-ink">agreed before</strong> the
          period it covers, on{" "}
          <Link
            href="/performance/approvals"
            className="font-medium text-accent-text underline-offset-2 hover:underline"
          >
            the objectives queue
          </Link>
          , and only agreed ones are ever scored. A target agreed after the
          result is known is not a target.
        </p>
      </div>

      <div>
        <p className="text-body-sm font-semibold text-ink">
          Competencies are how they work
        </p>
        <p className="mt-1">
          Judgement, communication, leading a team. They come ready-made in four
          groups &mdash; you can rename them or switch them off &mdash; and
          somebody records a level against each one, once per person per period.
          Leadership is only rated for people who actually manage somebody; for
          everybody else it is left out rather than marked low.
        </p>
      </div>

      <div>
        <p className="text-body-sm font-semibold text-ink">
          The mark is the two of them, weighted
        </p>
        <p className="mt-1">
          Each part carries a share of the mark, and the shares add up to 100%
          exactly &mdash; there is no state where they do not, so there is
          nothing to reconcile afterwards.
        </p>

        {loading ? (
          <p className="mt-2 flex items-center gap-2 text-muted">
            <Spinner size="sm" />
            Reading the weights
          </p>
        ) : (
          <>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {counted.map((row) => (
                <li key={row.component} className="flex items-baseline gap-2">
                  <span className="tabular w-14 shrink-0 font-medium text-ink">
                    {weightLabel(row.weightBp)}
                  </span>
                  <span>{row.label}</span>
                </li>
              ))}
            </ul>
            {weights && (
              <p className="mt-2 text-meta text-muted">
                {source === "demo"
                  ? "The shipped shares. A real company can change them in settings."
                  : weights.source === "default"
                    ? "The shipped shares — nobody here has changed them."
                    : "Your company set these."}{" "}
                <Link
                  href="/settings/performance"
                  className="font-medium text-accent-text underline-offset-2 hover:underline"
                >
                  Change what each part is worth
                </Link>
              </p>
            )}
            {weights?.selfAssessmentNote && (
              <p className="mt-2">{weights.selfAssessmentNote}</p>
            )}
          </>
        )}
      </div>

      <div>
        <p className="text-body-sm font-semibold text-ink">
          The shares are frozen when the period opens
        </p>
        <p className="mt-1">
          They are copied onto the period the moment it starts. Changing them
          next quarter cannot move a mark already given, which is what makes a
          mark from two years ago still explainable.
        </p>
      </div>

      <div>
        <p className="text-body-sm font-semibold text-ink">
          Nothing recorded is not a nought
        </p>
        <p className="mt-1">
          A part with nothing behind it &mdash; no agreed objective, nobody
          rated the competencies, not a manager &mdash; is left out of the mark,
          and the remaining parts carry the difference. The screens say which
          part was left out and for how many people.{" "}
          <span className="text-ink">
            &ldquo;Scored nought&rdquo; and &ldquo;nothing was recorded&rdquo;
            are different things to say about a person.
          </span>
        </p>
      </div>

      <div>
        <p className="text-body-sm font-semibold text-ink">
          Then somebody is told, and answers
        </p>
        <p className="mt-1">
          The appraiser makes the mark final, the employee reads it, and either
          acknowledges it or formally disagrees. Both are recorded with a date.
          Acknowledging is not agreeing, and the screen says so where somebody
          is about to do it.
        </p>
      </div>
    </div>
  );
}

/**
 * The four parts an appraisal is made of, as a closed reference section.
 *
 * Reference-shaped by Rule 5's own test: it is a whole framework, it does not
 * change between periods, and nobody has to act on it. The count is on the
 * closed line, because a section whose summary carries no count has to be opened
 * before anybody learns whether it mattered.
 */
export function FrameworkDisclosure() {
  return (
    <Disclosure
      title="What an appraisal is made of"
      hint="The four groups of competencies, ready on day one. Rename or switch any of them off in settings."
      level={2}
    >
      <FrameworkBody />
    </Disclosure>
  );
}

function FrameworkBody() {
  const framework = useFramework();

  if (framework.loading) {
    return (
      <p className="flex items-center gap-2 text-body-sm text-muted">
        <Spinner size="sm" />
        Reading the framework
      </p>
    );
  }

  if (framework.groups.length === 0) {
    return (
      <EmptyState
        compact
        icon={<Layers aria-hidden="true" />}
        title="No framework yet"
        description="Finish setup and the four standard groups are created for you."
      />
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {framework.groups.map((group) => (
        <div key={group.category}>
          <p className="flex flex-wrap items-center gap-2 text-body-sm font-semibold text-ink">
            {group.category}
            {group.category === "Leadership" && (
              <Badge tone="neutral" size="sm">
                Managers only
              </Badge>
            )}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {group.competencies.map((competency) => (
              <li key={competency.id} className="text-body-sm text-body">
                {competency.name}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
