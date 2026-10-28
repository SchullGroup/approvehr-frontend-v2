"use client";

import { useState } from "react";
import { Button, Card, CardBody, useToast } from "@/components/ui";
import {
  PeriodWeights,
  periodWeightsProblem,
  weightsFromText,
  weightsToText,
  type WeightText,
} from "@/components/performance/period-weights";
import { ApiError } from "@/lib/api/client";
import type { ApiCycle, CycleWeights } from "@/lib/api/performance";
import { useCycleMutations, useScoringWeights } from "@/lib/store/performance";

/**
 * How the mark is made up, on the period's own screen.
 *
 * Editable while the period is a draft, read-only from the moment it starts:
 * the weights are copied onto the period then, and a mark already awarded has
 * to keep explaining itself against the weights that produced it. The API
 * refuses a change after start with a 409, and its sentence is shown if it
 * ever arrives; the read-only view is so nobody gets as far as meeting it.
 */
export function PeriodWeightsSection({
  period,
  onChanged,
}: {
  period: ApiCycle;
  onChanged: () => void;
}) {
  const { weights: companyDefaults } = useScoringWeights();

  /* An API older than per-period weights sends none. There is nothing true to
     show, so the section is not there at all rather than crashing the page. */
  const weights = period.weights;
  if (!weights) return null;

  if (period.stage !== "DRAFT") {
    return (
      <Card>
        <CardBody>
          <PeriodWeights
            readOnly
            basis={weights.basis}
            value={weightsToText(weights.values)}
            onChange={() => undefined}
            companyDefaults={companyDefaults}
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        {/* Keyed by what the server holds, so a save or a reset replaces the
            typed text with the stored set instead of leaving it to drift. */}
        <DraftWeights
          key={JSON.stringify(weights.values)}
          period={period}
          weights={weights}
          companyDefaults={companyDefaults}
          onChanged={onChanged}
        />
      </CardBody>
    </Card>
  );
}

function DraftWeights({
  period,
  weights,
  companyDefaults,
  onChanged,
}: {
  period: ApiCycle;
  weights: CycleWeights;
  companyDefaults: ReturnType<typeof useScoringWeights>["weights"];
  onChanged: () => void;
}) {
  const periods = useCycleMutations();
  const toast = useToast();
  const stored = weightsToText(weights.values);
  const [value, setValue] = useState<WeightText>(stored);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = periodWeightsProblem(value);
  const dirty = JSON.stringify(value) !== JSON.stringify(stored);

  const run = async (
    body: { weights: ReturnType<typeof weightsFromText> | null },
    done: string,
  ) => {
    setSaving(true);
    setError(null);
    try {
      await periods.updateCycle(period.id, body);
      /* Back to what the server holds. The component is keyed by those values,
         so it is only remounted when they change; when a reset lands on the
         same set, this is what clears the text typed over it. */
      if (body.weights === null) setValue(stored);
      onChanged();
      toast.push({ title: done, tone: "success" });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not save that. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-meta text-muted">
        {weights.basis === "period"
          ? "Set for this period."
          : "Using the company defaults."}
      </p>
      <PeriodWeights
        value={value}
        onChange={setValue}
        companyDefaults={companyDefaults}
        disabled={saving}
        onUseDefaults={() =>
          void run({ weights: null }, "Using the company defaults")
        }
      />
      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-body-sm text-ink"
        >
          {error}
        </p>
      )}
      <div>
        <Button
          variant="accent"
          size="sm"
          loading={saving}
          disabled={problem !== null || !dirty}
          onClick={() =>
            void run({ weights: weightsFromText(value) }, "Weights saved")
          }
        >
          Save the weights
        </Button>
      </div>
    </div>
  );
}
