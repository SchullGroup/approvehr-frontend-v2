"use client";

import { useState } from "react";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { YourAppraisal } from "@/components/performance/your-appraisal";
import { LoadState } from "@/components/ui";
import { useCan, useIsManager } from "@/lib/permissions";
import { useAppraisals, useScoringWeights } from "@/lib/store/performance";
import { WhatNeedsYouTab } from "./now";
import { PeriodsTab } from "./periods";
import { SetupWizard } from "./setup/setup-wizard";
import { StartPeriodButton, StartPeriodDialog } from "./start-period";
import { useRouter } from "next/navigation";

/**
 * Performance, opening on the one thing it is for: the appraisal.
 *
 * What somebody sees depends on where the company is.
 *
 * | | |
 * |---|---|
 * | Never set up | One very large card that starts the set-up. |
 * | Set up, no period yet | One very large card that starts the first period. |
 * | A period exists | A card for each open period. |
 *
 * That is for whoever runs appraisals. Everybody else keeps their own list of
 * what is waiting on them. KPIs and weekly tasks have their own pages.
 */
export function PerformanceScreen() {
  const canSeeCompany = useCan("EDIT_RECORDS");
  const canManage = useCan("MANAGE_SETTINGS");
  const isManager = useIsManager();

  return (
    <>
      <PageHeader title="Performance" action={<StartPeriodButton withIcon />} />
      <PageBody>
        {canManage ? (
          /* An administrator is also somebody's employee, and has a form of
             their own like everybody else. It sits under the period cards and
             not above them: it draws only once the progress has been read, and
             arriving above what is already on screen would push it down. */
          <div className="flex flex-col gap-6">
            <AppraisalHome />
            <YourAppraisal />
          </div>
        ) : canSeeCompany ? (
          <div className="flex flex-col gap-6">
            <PeriodsTab />
            <WhatNeedsYouTab
              canSeeCompany={canSeeCompany}
              isManager={isManager}
            />
          </div>
        ) : (
          <WhatNeedsYouTab
            canSeeCompany={canSeeCompany}
            isManager={isManager}
          />
        )}
      </PageBody>
    </>
  );
}

function AppraisalHome() {
  const router = useRouter();
  const appraisals = useAppraisals();
  const scoring = useScoringWeights();
  const [setting, setSetting] = useState(false);
  const [starting, setStarting] = useState(false);

  const periods = appraisals.cycles;
  const setUp = periods.length > 0 || scoring.weights?.source === "saved";

  return (
    <LoadState
      loading={appraisals.loading || scoring.loading}
      error={appraisals.error}
      subject="the appraisals"
      onRetry={appraisals.reload}
      hasData={periods.length > 0}
      skeleton="list"
    >
      {!setUp ? (
        <BigCard
          title="Set up appraisals"
          action="Get started"
          onClick={() => setSetting(true)}
        />
      ) : periods.length === 0 ? (
        <BigCard
          title="Start your first appraisal"
          action="Start an appraisal"
          onClick={() => setStarting(true)}
          secondary={<ChangeMarks onClick={() => setSetting(true)} />}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <PeriodsTab />
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <ChangeMarks onClick={() => setSetting(true)} />
          </div>
        </div>
      )}

      {setting && (
        <SetupWizard
          open
          onClose={() => setSetting(false)}
          onDone={(start) => {
            setSetting(false);
            scoring.reload();
            appraisals.reload();
            if (start) setStarting(true);
          }}
        />
      )}
      {starting && (
        <StartPeriodDialog
          open
          onClose={() => setStarting(false)}
          onCreated={(period) => {
            setStarting(false);
            router.push(`/performance/periods/${period.id}`);
          }}
        />
      )}
    </LoadState>
  );
}

function ChangeMarks({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-body-sm text-accent-text hover:underline"
    >
      Change how scores are made up
    </button>
  );
}

function BigCard({
  title,
  action,
  onClick,
  secondary,
}: {
  title: string;
  action: string;
  onClick: () => void;
  secondary?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-5 rounded-2xl border border-line bg-surface p-8 text-center">
      <h2 className="text-h2 font-semibold text-ink">{title}</h2>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-accent px-8 text-body font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {action}
      </button>
      {secondary}
    </div>
  );
}
