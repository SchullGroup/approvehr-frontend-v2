"use client";

import { RotateCcw } from "lucide-react";
import { Badge, Button, Field, Input } from "@/components/ui";
import {
  FULL_WEIGHT_BP,
  SCORE_COMPONENT_ORDER,
  weightLabel,
  type ApiScoringWeights,
  type CycleWeights,
  type ScoreComponent,
  type WeightSet,
} from "@/lib/api/performance";

/**
 * How the mark is made up, chosen for one appraisal period.
 *
 * ## Whole percents, on purpose
 *
 * The company defaults in Settings take two decimal places, because a three-way
 * split of a company's own is a thing somebody types once. A period's weights
 * are chosen by whoever is setting the period up, in a hurry, and the rule is
 * "exactly 100%". A field that accepts 33.33 lets three of them make 99.99 and
 * a refusal nobody can connect to a row. So here a weight is a whole number
 * from 0 to 100, and what is sent is that number times 100.
 *
 * ## The value is what was typed
 *
 * `WeightText` holds text, so a half-typed field is not rewritten under the
 * person. Every figure derived from it is an integer number of basis points,
 * and nothing in here computes anybody's mark: the composite lives in the API.
 */

/** What is in each field, as typed. */
export type WeightText = Record<ScoreComponent, string>;

/** Used only when no company defaults have arrived to supply the words. */
const FALLBACK_LABELS: Record<ScoreComponent, string> = {
  OBJECTIVES: "Delivery against objectives",
  TASKS: "Weekly tasks",
  CORE_COMPETENCY: "Core competencies",
  BEHAVIOURAL_COMPETENCY: "Behavioural competencies",
  LEADERSHIP: "Leadership",
  SELF_ASSESSMENT: "Self-assessment",
};

const RULE = "These must add up to 100%.";

/** Basis points to the text a field shows. 2500 becomes "25". */
export function weightsToText(weights: WeightSet): WeightText {
  return Object.fromEntries(
    SCORE_COMPONENT_ORDER.map((component) => [
      component,
      String((weights[component] ?? 0) / 100),
    ]),
  ) as WeightText;
}

/** The typed set in basis points. Only meaningful once `periodWeightsProblem` is null. */
export function weightsFromText(text: WeightText): WeightSet {
  return Object.fromEntries(
    SCORE_COMPONENT_ORDER.map((component) => [
      component,
      Math.round(Number(text[component]) * 100),
    ]),
  ) as WeightSet;
}

/** A whole number from 0 to 100, and nothing else: no decimals, no blanks, no signs. */
function wholePercent(text: string): boolean {
  return /^\d{1,3}$/.test(text.trim()) && Number(text) <= 100;
}

/**
 * What stops this set being saved, or null.
 *
 * One sentence for both reasons — a bad row and a wrong total — because the
 * person's next step is the same: look at the rows.
 */
export function periodWeightsProblem(text: WeightText): string | null {
  if (!SCORE_COMPONENT_ORDER.every((c) => wholePercent(text[c] ?? ""))) {
    return RULE;
  }
  const total = SCORE_COMPONENT_ORDER.reduce(
    (sum, c) => sum + Number(text[c]),
    0,
  );
  return total === 100 ? null : RULE;
}

function totalBp(text: WeightText): number {
  return SCORE_COMPONENT_ORDER.reduce((sum, c) => {
    const n = Number(text[c]);
    return sum + (Number.isFinite(n) ? Math.round(n * 100) : 0);
  }, 0);
}

export function PeriodWeights({
  value,
  onChange,
  readOnly = false,
  companyDefaults,
  onUseDefaults,
  disabled = false,
  basis,
}: {
  value: WeightText;
  onChange: (next: WeightText) => void;
  /** The period has started: the same rows, no fields. */
  readOnly?: boolean;
  /** Supplies the words, and what "Use the company defaults" goes back to. */
  companyDefaults: ApiScoringWeights | null;
  /** Overrides the reset, for a caller that has to tell the server. */
  onUseDefaults?: () => void;
  disabled?: boolean;
  /**
   * Where a read-only set comes from. Only `frozen` was fixed at the start; a
   * period that started before snapshots existed reports `company` and moves
   * with the company's weights, so it must not be told it was fixed.
   */
  basis?: CycleWeights["basis"];
}) {
  const labelOf = (component: ScoreComponent) =>
    companyDefaults?.rows.find((row) => row.component === component)?.label ??
    FALLBACK_LABELS[component];

  const total = totalBp(value);
  const problem = readOnly ? null : periodWeightsProblem(value);

  const reset = () => {
    if (onUseDefaults) {
      onUseDefaults();
      return;
    }
    if (companyDefaults === null) return;
    onChange(
      weightsToText(
        Object.fromEntries(
          SCORE_COMPONENT_ORDER.map((c) => [
            c,
            companyDefaults.rows.find((row) => row.component === c)?.weightBp ??
              0,
          ]),
        ) as WeightSet,
      ),
    );
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="weights-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="weights-heading" className="text-body-sm font-medium text-ink">
          How the mark is made up
        </h3>
        <span className="flex items-center gap-2">
          <span className="text-meta text-muted">Total</span>
          <span data-testid="weights-total">
            <Badge
              tone={total === FULL_WEIGHT_BP ? "success" : "danger"}
              size="md"
              dot
            >
              {weightLabel(total)}
            </Badge>
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {SCORE_COMPONENT_ORDER.map((component) => {
          const text = value[component] ?? "";
          const bad = !readOnly && !wholePercent(text);
          return (
            <div
              key={component}
              data-weight-row
              className="grid gap-2 sm:grid-cols-[1fr_9rem] sm:items-start"
            >
              {readOnly ? (
                <>
                  <p className="text-body-sm text-ink">{labelOf(component)}</p>
                  <p className="tabular text-body-sm font-medium text-ink sm:text-right">
                    {weightLabel(Math.round(Number(text) * 100))}
                  </p>
                </>
              ) : (
                <>
                  <p
                    aria-hidden="true"
                    className="text-body-sm text-ink sm:pt-2"
                  >
                    {labelOf(component)}
                  </p>
                  <Field
                    label={labelOf(component)}
                    hideLabel
                    {...(bad ? { error: "Whole numbers only, 0 to 100." } : {})}
                  >
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      inputMode="numeric"
                      suffix="%"
                      value={text}
                      disabled={disabled}
                      onChange={(event) => {
                        const next = event.target.value;
                        onChange({ ...value, [component]: next });
                      }}
                    />
                  </Field>
                </>
              )}
            </div>
          );
        })}
      </div>

      {problem && (
        <p role="status" className="text-body-sm text-warning-text">
          {problem}
        </p>
      )}

      <p className="text-meta text-muted">
        If someone has no graded weekly tasks against this period&apos;s
        objectives, the Weekly tasks share is spread over the other parts.
      </p>

      {readOnly ? (
        basis === "frozen" ? (
          <p className="text-meta text-muted">
            Fixed when this period started.
          </p>
        ) : basis === "company" ? (
          <p className="text-meta text-muted">
            This period follows the company&apos;s weights as they are today.
          </p>
        ) : null
      ) : (
        <div>
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={reset}
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
            Use the company defaults
          </Button>
        </div>
      )}
    </section>
  );
}
