"use client";

import { useState } from "react";
import { Scale } from "lucide-react";
import { Card, EmptyState, LoadState, Select } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { periodInPlay } from "@/lib/api/performance";
import { useAppraisals } from "@/lib/store/performance";
import { FairnessScreen } from "../periods/[id]/fairness/fairness-screen";

/**
 * The fairness check as a place of its own in Performance.
 *
 * It used to be reached only from inside one appraisal period, which hid it:
 * somebody who wanted to look at fairness had to know which period to open
 * first. Here it opens on the period in play, or the latest one, with a picker
 * for the rest, and the screen underneath is the same one.
 */
export function FairnessHome() {
  const appraisals = useAppraisals();
  const [picked, setPicked] = useState<string | null>(null);

  /* A draft has no marks to compare, so it is not offered. */
  const choices = appraisals.cycles.filter((cycle) => cycle.stage !== "DRAFT");
  const inPlay = periodInPlay(appraisals.cycles);
  const fallback =
    (inPlay && inPlay.stage !== "DRAFT" ? inPlay.id : undefined) ??
    choices[0]?.id ??
    null;
  const cycleId =
    picked && choices.some((cycle) => cycle.id === picked) ? picked : fallback;

  if (appraisals.loading || appraisals.error || cycleId === null) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ href: "/performance", label: "Performance" }]}
          title="Fairness check"
        />
        <PageBody>
          <LoadState
            loading={appraisals.loading}
            error={appraisals.error}
            subject="the appraisal periods"
            onRetry={appraisals.reload}
            hasData={!appraisals.loading && appraisals.error === null}
          >
            <Card>
              <EmptyState
                icon={<Scale aria-hidden="true" />}
                title="No period to check yet"
                description="The fairness check compares marks once an appraisal period has started."
              />
            </Card>
          </LoadState>
        </PageBody>
      </>
    );
  }

  return (
    <FairnessScreen
      key={cycleId}
      cycleId={cycleId}
      picker={
        choices.length > 1 ? (
          <Select
            aria-label="Appraisal period"
            value={cycleId}
            onChange={(event) => setPicked(event.target.value)}
          >
            {choices.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.name}
              </option>
            ))}
          </Select>
        ) : undefined
      }
    />
  );
}
