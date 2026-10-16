"use client";

import { useState } from "react";
import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Field,
  Input,
  Skeleton,
  Stat,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import type { RetentionReport } from "@/lib/hiring/comms/model";
import { sentenceOf } from "@/lib/hiring/pipeline/errors";
import { useRetention } from "@/lib/hiring/pipeline/use-comms";
import { usePipelineGateway } from "@/lib/hiring/pipeline/use-pipeline";
import { formatDateShort } from "@/lib/time";
import { HiringSettingsShell } from "../settings-shell";

/**
 * How long rejected and withdrawn candidates are kept.
 *
 * ## The default is to keep, and the number is not ours to choose
 *
 * Nothing is deleted for a company that has not set a period, and there is no
 * suggested one. How long a company may keep a rejected applicant's CV and contact
 * details is a data-protection question for it and its advisers. The page says that
 * in one sentence and leaves the box empty.
 *
 * ## A week to change your mind
 *
 * Setting a period on a company with years of rejections would otherwise delete them
 * that night. So nothing is deleted until a week after the period is set or changed,
 * and the page shows what a period would do (how many are due, how many soon) before
 * that day arrives. Every rejected record also shows the date it is scheduled to go.
 */

const day = (iso: string): string =>
  formatDateShort(`${iso.slice(0, 10)}T00:00:00Z`, "UTC");

const MODE_NOTE: Record<RetentionReport["mode"], string | null> = {
  delete: null,
  report:
    "This deployment only reports what it would delete. It does not delete anybody yet.",
  off: "Deletion is switched off on this deployment, so nobody is deleted whatever the period says.",
};

export function RetentionScreen() {
  const gateway = usePipelineGateway();
  const retention = useRetention();
  const toast = useToast();
  const [typed, setTyped] = useState<string | null>(null);
  const [asking, setAsking] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const report = retention.data;
  const text = typed ?? (report?.months != null ? String(report.months) : "");
  const months = text.trim() === "" ? null : Number(text);
  const valid =
    months !== null && Number.isInteger(months) && months >= 1 && months <= 120;
  const changed = report !== null && months !== report.months;

  async function save(next: number | null) {
    setBusy(true);
    setProblem(null);
    try {
      await gateway.retention.set(next);
      setTyped(null);
      setAsking(null);
      retention.reload();
      toast.push({
        title:
          next === null
            ? "Rejected candidates are kept again"
            : `Rejected candidates are kept for ${String(next)} ${next === 1 ? "month" : "months"}`,
        tone: "success",
        ...(next === null
          ? {}
          : { detail: "Nothing is deleted until a week from now." }),
      });
    } catch (error) {
      setProblem(sentenceOf(error));
      setAsking(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <HiringSettingsShell
      active="/hiring/settings/retention"
      title="Data retention"
      description="How long a rejected or withdrawn candidate's details are kept. By default they are kept. How long is right is a decision for your company and its legal advice, so none is suggested."
    >
      {retention.loading ? (
        <>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only-focusable">
            Loading the retention period
          </span>
        </>
      ) : retention.error || !report ? (
        <LoadFailure
          subject="data retention"
          error={retention.error}
          onRetry={retention.reload}
          missingMeans="module"
        />
      ) : (
        <>
          <Card>
            <CardHeader
              title="Keep rejected candidates for"
              description={
                report.months === null
                  ? "Nobody is deleted. Set a number of months to start."
                  : `Rejected and withdrawn candidates are deleted ${String(report.months)} ${report.months === 1 ? "month" : "months"} after the last change to their application.`
              }
            />
            <CardBody className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end gap-3">
                <Field
                  label="Months"
                  help="A whole number from 1 to 120. Leave it empty to keep them."
                  className="w-40"
                  {...(typed !== null && text.trim() !== "" && !valid
                    ? { error: "A whole number of months, 1 to 120." }
                    : {})}
                >
                  <Input
                    inputMode="numeric"
                    value={text}
                    placeholder="Keep them"
                    onChange={(event) => setTyped(event.target.value)}
                  />
                </Field>
                <Button
                  variant="accent"
                  disabled={!changed || !valid || busy}
                  onClick={() => months !== null && setAsking(months)}
                >
                  Set this period
                </Button>
                {report.months !== null && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void save(null)}
                  >
                    Keep everybody
                  </Button>
                )}
              </div>

              {problem && (
                <p role="alert" className="text-body-sm text-danger-text">
                  {problem}
                </p>
              )}

              {report.purgeFrom && (
                <p className="text-body-sm text-body">
                  {report.purgeActive
                    ? `The week to change your mind ended on ${day(report.purgeFrom)}.`
                    : `Nothing is deleted before ${day(report.purgeFrom)}, a week after the period was set (${String(report.graceDays)} days).`}
                </p>
              )}
              {report.months !== null && MODE_NOTE[report.mode] && (
                <Callout tone="info" title="What happens here">
                  {MODE_NOTE[report.mode]}
                </Callout>
              )}
            </CardBody>
          </Card>

          {report.months !== null && (
            <Card>
              <CardHeader
                title="What this period would do"
                description="Counted now, from your own records. Nothing is changed by looking."
              />
              <CardBody className="grid gap-4 sm:grid-cols-3">
                <Stat
                  label="Due now"
                  value={report.due.candidates.toLocaleString("en-NG")}
                  hint={report.due.candidates === 1 ? "person" : "people"}
                />
                <Stat
                  label="Due within 30 days"
                  value={report.dueWithin30Days.candidates.toLocaleString(
                    "en-NG",
                  )}
                  hint={
                    report.dueWithin30Days.candidates === 1
                      ? "person"
                      : "people"
                  }
                />
                <Stat
                  label="Kept in the talent pool"
                  value={report.heldInTalentPool.toLocaleString("en-NG")}
                  hint={report.heldInTalentPool === 1 ? "person" : "people"}
                />
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="What is deleted, and what never is" />
            <CardBody className="grid gap-6 text-body-sm text-body sm:grid-cols-2">
              <div>
                <p className="font-medium text-ink">Deleted, for good</p>
                <ul className="mt-2 list-disc pl-5">
                  <li>Their applications, interviews and scorecards</li>
                  <li>Offers that were not accepted</li>
                  <li>Emails sent to them, and their tags</li>
                  <li>Their CV, their answers and their consent records</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-ink">Never deleted this way</p>
                <ul className="mt-2 list-disc pl-5">
                  <li>Anybody still in the process, or with an offer out</li>
                  <li>Anybody who was hired</li>
                  <li>Anybody you have kept in the talent pool</li>
                  <li>Applications nobody has looked at yet</li>
                </ul>
              </div>
            </CardBody>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={asking !== null}
        onClose={() => setAsking(null)}
        title={
          asking === null
            ? "Set the period?"
            : `Delete rejected candidates after ${String(asking)} ${asking === 1 ? "month" : "months"}?`
        }
        body="From a week from now, rejected and withdrawn candidates whose last change is older than that are deleted for good, a few at a time. Nobody in the process, hired or in the talent pool is touched. You can change it or clear it any time, and nothing is deleted in the first week."
        confirmLabel="Set this period"
        loading={busy}
        onConfirm={() => asking !== null && void save(asking)}
      />
    </HiringSettingsShell>
  );
}
