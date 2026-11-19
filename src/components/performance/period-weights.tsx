"use client";

import { RotateCcw } from "lucide-react";
import { Badge, Button, Field, Input } from "@/components/ui";
import {
  SCORE_COMPONENT_ORDER,
  isLaterComponent,
  overFullWeightNote,
  weightLabel,
  weightSetFromRows,
  type ApiScoringWeights,
  type CycleWeights,
  type PartKey,
  type WeightSet,
} from "@/lib/api/performance";

/**
 * How the mark is made up, chosen for one appraisal period.
 *
 * ## Whole percents, on purpose
 *
 * The weights in Settings take two decimal places, because a three-way
 * split of a company's own is a thing somebody types once. A period's weights
 * are chosen by whoever is setting the period up, in a hurry, so here a weight
 * is a whole number from 0 to 100, and what is sent is that number times 100.
 *
 * ## Proportional
 *
 * The weights need not make 100%: each part counts in proportion to the total.
 * The only set refused is every part at zero, which cannot make a mark.
 *
 * ## The value is what was typed
 *
 * `WeightText` holds text, so a half-typed field is not rewritten under the
 * person. Every figure derived from it is an integer number of basis points,
 * and nothing in here computes anybody's mark: the composite lives in the API.
 *
 * ## Only the company's parts have a row
 *
 * The rows are the parts the company wrote in Settings, under Appraisal
 * scoring, by their names there, and no others (`companyPartsOf`). A source the
 * company has no part for is still in the text, at the 0 the server holds for
 * it, so the whole set is sent, but it is not drawn, added up or checked.
 *
 * ## A part the server has not heard of has no row
 *
 * Manager appraisal is a `LaterComponent`: a server that predates it sends no
 * weight for it, so the text holds no key for it and there is no row, no total
 * and no rule about it. Drawing one would offer a weight the server drops, and
 * sending a 0 for it would write over one set somewhere newer.
 */

/** What is in each field, as typed, by part key. A later part is only there if the server spoke of it. */
export type WeightText = Record<PartKey, string>;

/**
 * The parts this text holds: every built-in part there has always been, a
 * later one only when it is present, and then the company's own parts.
 */
const partsOf = (held: Partial<Record<PartKey, unknown>>): PartKey[] => [
  ...SCORE_COMPONENT_ORDER.filter(
    (component) =>
      !isLaterComponent(component) || held[component] !== undefined,
  ),
  ...Object.keys(held).filter(
    (key) => !(SCORE_COMPONENT_ORDER as readonly string[]).includes(key),
  ),
];

/** What a field holds. A part the set does not mention weighs 0. */
const typedOf = (text: WeightText, component: PartKey): string =>
  text[component] ?? "0";

/**
 * The sources the company has a part for, from the Settings read. Every source
 * from an API that predates parts of the company's own (no `isPart`), and null
 * while the read has not arrived.
 */
export function companyPartsOf(
  settings: ApiScoringWeights | null,
): PartKey[] | null {
  if (settings === null) return null;
  return settings.rows
    .filter((row) => row.isPart !== false)
    .map((row) => row.component);
}

/**
 * Until Settings has been read, a built-in part is named by itself ("Core
 * competency"), and a company's own part plainly.
 */
const sourceWords = (component: PartKey): string => {
  if (component.startsWith("part_")) return "A part of your own";
  const words = component.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * The rows drawn: `parts` when known, in their order, or the parts held in
 * the text. A later built-in part is drawn only when the text holds it.
 */
const shownOf = (
  text: Partial<Record<PartKey, unknown>>,
  parts: readonly PartKey[] | null | undefined,
): PartKey[] =>
  parts
    ? parts.filter(
        (component) =>
          !isLaterComponent(component) || text[component] !== undefined,
      )
    : partsOf(text);

const ROW_RULE = "Each weight is a whole number from 0 to 100.";
const ZERO_RULE = "Give at least one part a weight above 0%.";

/** Basis points to the text a field shows. 2500 becomes "25". */
export function weightsToText(weights: WeightSet): WeightText {
  return Object.fromEntries(
    partsOf(weights).map((component) => [
      component,
      String((weights[component] ?? 0) / 100),
    ]),
  );
}

/** The typed set in basis points. Only meaningful once `periodWeightsProblem` is null. */
export function weightsFromText(text: WeightText): WeightSet {
  return Object.fromEntries(
    partsOf(text).map((component) => [
      component,
      Math.round(Number(typedOf(text, component)) * 100),
    ]),
  );
}

/** A whole number from 0 to 100, and nothing else: no decimals, no blanks, no signs. */
function wholePercent(text: string): boolean {
  return /^\d{1,3}$/.test(text.trim()) && Number(text) <= 100;
}

/**
 * What stops this set being saved, or null: a row that is not a whole number
 * from 0 to 100, or every part at zero. Any other total is fine, because the
 * weights are proportional.
 */
export function periodWeightsProblem(
  text: WeightText,
  only?: readonly PartKey[] | null,
): string | null {
  const parts = shownOf(text, only);
  if (!parts.every((c) => wholePercent(typedOf(text, c)))) {
    return ROW_RULE;
  }
  const total = parts.reduce((sum, c) => sum + Number(typedOf(text, c)), 0);
  return total > 0 ? null : ZERO_RULE;
}

function totalBp(text: WeightText, only: readonly PartKey[] | null): number {
  return shownOf(text, only).reduce((sum, c) => {
    const n = Number(typedOf(text, c));
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
  parts: givenParts,
  details,
}: {
  value: WeightText;
  onChange: (next: WeightText) => void;
  /** The period has started: the same rows, no fields. */
  readOnly?: boolean;
  /** Supplies the names, which parts there are, and what the reset goes back to. */
  companyDefaults: ApiScoringWeights | null;
  /**
   * The parts to list, when the period says (`CycleWeights.parts`). Otherwise
   * the company's parts from Settings.
   */
  parts?: readonly PartKey[] | undefined;
  /** The period's own names for its parts (`CycleWeights.details`), frozen ones included. */
  details?: CycleWeights["details"];
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
  const labelOf = (component: PartKey) =>
    details?.find((part) => part.key === component)?.label ??
    companyDefaults?.rows.find((row) => row.component === component)?.label ??
    sourceWords(component);

  const only = givenParts ?? companyPartsOf(companyDefaults);
  const parts = shownOf(value, only);
  const total = totalBp(value, only);
  const problem = readOnly ? null : periodWeightsProblem(value, only);
  /* Said only for a set that can be read: a row that is not a whole number has
     no figure to add up. Where the set is fixed (the period has started) it
     says what is so and gives no advice nobody could follow. */
  const overNote =
    problem === null
      ? overFullWeightNote(total, { canChange: !readOnly })
      : null;

  const reset = () => {
    if (onUseDefaults) {
      onUseDefaults();
      return;
    }
    if (companyDefaults === null) return;
    /* A part the company's read does not carry is left out, not set to 0: the
       period's own text keeps the rows its server spoke of. */
    onChange(weightsToText(weightSetFromRows(companyDefaults.rows)));
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
            <Badge tone={total > 0 ? "neutral" : "danger"} size="md" dot>
              {weightLabel(total)}
            </Badge>
          </span>
        </span>
      </div>

      {parts.length === 0 && (
        <p role="status" className="text-body-sm text-warning-text">
          There are no scoring parts yet. Add them in Settings, under Appraisal
          scoring, and they appear here.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {parts.map((component) => {
          const text = typedOf(value, component);
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

      {overNote && (
        <p role="status" className="text-body-sm text-warning-text">
          {overNote}
        </p>
      )}

      <p className="text-meta text-muted">
        Each part counts in proportion to the total, so the weights do not have
        to make 100%.
      </p>

      {parts.includes("TASKS") && (
        <p className="text-meta text-muted">
          If someone has no graded weekly tasks against this period&apos;s
          objectives, the {labelOf("TASKS")} share is spread over the other
          parts.
        </p>
      )}

      {parts.includes("MANAGER_APPRAISAL") && (
        <p className="text-meta text-muted">
          If no appraiser has sent an overall mark for someone, the{" "}
          {labelOf("MANAGER_APPRAISAL")} share is spread over the other parts.
        </p>
      )}

      {readOnly ? (
        basis === "frozen" ? (
          <p className="text-meta text-muted">
            Fixed when this period started.
          </p>
        ) : basis === "company" ? (
          <p className="text-meta text-muted">
            This period follows the weights in Settings as they are today.
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
            Use the weights in Settings
          </Button>
        </div>
      )}
    </section>
  );
}
