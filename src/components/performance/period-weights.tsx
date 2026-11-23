"use client";

import { RotateCcw } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { WeightsPie, sliceColour } from "./weights-pie";
import {
  SCORE_COMPONENT_ORDER,
  isLaterComponent,
  weightLabel,
  weightSetFromRows,
  type ApiScoringWeights,
  type CycleWeights,
  type LaterComponent,
  type ScoreComponent,
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

/** What is in each field, as typed. A later part is only there if the server spoke of it. */
export type WeightText = Record<
  Exclude<ScoreComponent, LaterComponent>,
  string
> &
  Partial<Record<LaterComponent, string>>;

/** The parts this text holds: every part there has always been, and a later one only when it is present. */
const partsOf = (
  held: Partial<Record<ScoreComponent, unknown>>,
): ScoreComponent[] =>
  SCORE_COMPONENT_ORDER.filter(
    (component) =>
      !isLaterComponent(component) || held[component] !== undefined,
  );

/**
 * The sources the company has a part for, from the Settings read. Every source
 * from an API that predates parts of the company's own (no `isPart`), and null
 * while the read has not arrived.
 */
export function companyPartsOf(
  settings: ApiScoringWeights | null,
): ScoreComponent[] | null {
  if (settings === null) return null;
  return settings.rows
    .filter((row) => row.isPart !== false)
    .map((row) => row.component);
}

/** Until Settings has been read, a source is named by itself: "Core competency". */
const sourceWords = (component: ScoreComponent): string => {
  const words = component.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The rows drawn: the parts held in the text, narrowed to `parts` when known. */
const shownOf = (
  text: Partial<Record<ScoreComponent, unknown>>,
  parts: readonly ScoreComponent[] | null | undefined,
): ScoreComponent[] =>
  partsOf(text).filter((component) => !parts || parts.includes(component));

const ROW_RULE = "Each weight is a whole number from 0 to 100.";
const TOTAL_RULE = "The weights have to add up to 100%.";

/** Basis points to the text a field shows. 2500 becomes "25". */
export function weightsToText(weights: WeightSet): WeightText {
  return Object.fromEntries(
    partsOf(weights).map((component) => [
      component,
      String((weights[component] ?? 0) / 100),
    ]),
  ) as WeightText;
}

/** The typed set in basis points. Only meaningful once `periodWeightsProblem` is null. */
export function weightsFromText(text: WeightText): WeightSet {
  return Object.fromEntries(
    partsOf(text).map((component) => [
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
 * What stops this set being saved, or null: a row that is not a whole number
 * from 0 to 100, or every part at zero. Any other total is fine, because the
 * weights are proportional.
 */
export function periodWeightsProblem(
  text: WeightText,
  only?: readonly ScoreComponent[] | null,
): string | null {
  const parts = shownOf(text, only);
  if (!parts.every((c) => wholePercent(text[c] ?? ""))) {
    return ROW_RULE;
  }
  const total = parts.reduce((sum, c) => sum + Number(text[c]), 0);
  return total === 100 ? null : TOTAL_RULE;
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
  parts?: readonly ScoreComponent[] | undefined;
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
    sourceWords(component);

  const only = givenParts ?? companyPartsOf(companyDefaults);
  const parts = shownOf(value, only);
  const problem = readOnly ? null : periodWeightsProblem(value, only);
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
      <h3 id="weights-heading" className="text-body-sm font-medium text-ink">
        How the mark is made up
      </h3>
      <WeightsPie
        fixed={readOnly}
        slices={parts.map((component) => ({
          id: component,
          label: labelOf(component),
          percent: Math.max(0, Math.round(Number(value[component]) || 0)),
        }))}
      />

      {parts.length === 0 && (
        <p role="status" className="text-body-sm text-warning-text">
          There are no scoring parts yet. Add them in Settings, under Appraisal
          scoring, and they appear here.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {parts.map((component, index) => {
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
                  <p className="flex items-center gap-2 text-body-sm text-ink">
                    <Dot index={index} />
                    {labelOf(component)}
                  </p>
                  <p className="tabular text-body-sm font-medium text-ink sm:text-right">
                    {weightLabel(Math.round(Number(text) * 100))}
                  </p>
                </>
              ) : (
                <>
                  <p
                    aria-hidden="true"
                    className="flex items-center gap-2 text-body-sm text-ink sm:pt-2"
                  >
                    <Dot index={index} />
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

      {problem && problem !== TOTAL_RULE && (
        <p role="status" className="text-body-sm text-warning-text">
          {problem}
        </p>
      )}

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

function Dot({ index }: { index: number }) {
  return (
    <span
      aria-hidden="true"
      className="size-2.5 shrink-0 rounded-full"
      style={{ background: sliceColour(index) }}
    />
  );
}
