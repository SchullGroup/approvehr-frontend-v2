"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  LoadState,
  useToast,
} from "@/components/ui";
import { LoadMore } from "@/components/portal/load-more";
import { ApiError } from "@/lib/api/client";
import type { ApiKudosReport, KudosReportAction } from "@/lib/api/wellness";
import type { PagedList } from "@/lib/store/paged-list";
import { useOrgTimezone } from "@/lib/store/session";
import { useWellnessActions } from "@/lib/store/wellness";
import { formatDateShort } from "@/lib/time";

/**
 * Reports of kudos, for the people who manage company settings.
 *
 * ## Who sees this is two answers, not one
 *
 * The screen draws it only when the person holds `MANAGE_SETTINGS` and the API
 * answered the list (`RecognitionScreen` decides, from both). A person without
 * the permission never asks, and an answer of "not yours" or "no such route"
 * leaves nothing here, not a greyed-out tab.
 *
 * ## It is the one place a private kudos is read by somebody else
 *
 * A report carries the words, the giver, the recipient and the reporter's name,
 * because an administrator cannot weigh a report without them. That is a choice
 * the reporter made in a dialog that said so, and it is written in the privacy
 * policy; it is not a way to browse kudos. Only open reports are listed, and
 * only the ones somebody sent.
 *
 * ## The tone is level
 *
 * Recognition is warm everywhere else. A report is somebody saying a thing was
 * not right, so this is plain: no mascot, no colour, no urgency, and the two
 * answers are named for what they do.
 */

type Pending = { report: ApiKudosReport; action: KudosReportAction };

export function KudosReports({ list }: { list: PagedList<ApiKudosReport> }) {
  const actions = useWellnessActions();
  const toast = useToast();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const resolve = async ({ report, action }: Pending) => {
    setBusy(true);
    try {
      await actions.resolveKudosReport(report.id, action);
      list.remove(report.id);
      setPending(null);
      toast.push({
        tone: "info",
        title: action === "REMOVE" ? "Kudos removed" : "Report dismissed",
        detail: "The report is closed.",
      });
    } catch (error) {
      /* A 404 here is most likely another administrator getting there first,
         because the list that brought us here answered a moment ago. A 409 is
         the same thing the other way round: they decided it differently. Either
         way the list is stale, so it is asked again. */
      const status = error instanceof ApiError ? error.status : null;
      const gone = status === 404;
      setPending(null);
      if (gone || status === 409) list.reload();
      toast.push({
        tone: "warning",
        title: "That did not work",
        detail: gone
          ? "That report is not there any more. Somebody may have dealt with it already."
          : error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="kudos-reports" className="flex flex-col gap-4">
      <div>
        <h2 id="kudos-reports" className="text-body-md font-semibold text-ink">
          Reported kudos
        </h2>
        <p className="mt-1 max-w-2xl text-body-sm text-muted">
          Kudos that people have reported, with what it says, who gave it, who
          it was for and who reported it. Only people who manage company
          settings can see this. Remove deletes the kudos for everybody. Dismiss
          leaves it as it is. Either one closes the report.
        </p>
      </div>

      <LoadState
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        hasData={list.rows.length > 0}
        subject="the reports"
        skeleton="list"
      >
        {list.rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Flag aria-hidden="true" />}
              title="No open reports"
              description="When somebody reports a kudos, it shows here."
              compact
            />
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {list.rows.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                onAct={(action) => setPending({ report, action })}
              />
            ))}
          </ul>
        )}
        {list.rows.length > 0 && (
          <LoadMore
            shown={list.rows.length}
            total={list.total}
            noun={["report", "reports"]}
            hasMore={list.hasMore}
            loading={list.loadingMore}
            error={list.moreError}
            onLoadMore={list.loadMore}
          />
        )}
      </LoadState>

      {pending && (
        <ConfirmDialog
          open
          onClose={() => setPending(null)}
          loading={busy}
          {...(pending.action === "REMOVE"
            ? {
                title: "Remove this kudos?",
                body: "It is deleted for everybody, the two people it was between included, and this report is closed.",
                confirmLabel: "Remove kudos",
                tone: "danger" as const,
              }
            : {
                title: "Dismiss this report?",
                body: "The kudos is left as it is and this report is closed. It stays hidden from the person who reported it.",
                confirmLabel: "Dismiss report",
                tone: "primary" as const,
              })}
          onConfirm={() => void resolve(pending)}
        />
      )}
    </section>
  );
}

function ReportCard({
  report,
  onAct,
}: {
  report: ApiKudosReport;
  onAct: (action: KudosReportAction) => void;
}) {
  const timeZone = useOrgTimezone();
  const { recognition } = report;
  const giver = recognition.giver?.name ?? null;
  const recipient = recognition.recipient?.name ?? null;
  const people =
    giver !== null && recipient !== null ? `${giver} to ${recipient}` : null;
  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-body">
        {giver !== null && recipient !== null ? (
          <span>
            <span className="font-medium text-ink">{giver}</span> thanked{" "}
            <span className="font-medium text-ink">{recipient}</span>
          </span>
        ) : (
          <span>
            This kudos was removed, so its words and names are no longer kept.
          </span>
        )}
        {recognition.createdAt !== null && (
          <span className="text-meta text-muted">
            {formatDateShort(recognition.createdAt, timeZone)}
          </span>
        )}
        {recognition.removed && (
          <Badge tone="neutral" size="sm">
            Already removed
          </Badge>
        )}
      </p>
      {recognition.message !== null && recognition.message.trim() !== "" && (
        <p className="mt-2 whitespace-pre-line rounded-xl bg-sunken px-4 py-3 text-body-md text-ink">
          {recognition.message}
        </p>
      )}
      <p className="mt-3 text-body-sm text-muted">
        Reported by{" "}
        <span className="font-medium text-ink">{report.reporter.name}</span> on{" "}
        {formatDateShort(report.createdAt, timeZone)}
      </p>
      {report.reason && (
        <p className="mt-1 whitespace-pre-line text-body-sm text-body">
          <span className="text-muted">They wrote: </span>
          {report.reason}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {!recognition.removed && (
          <Button
            variant="secondary"
            onClick={() => onAct("REMOVE")}
            aria-label={`Remove the kudos from ${people ?? "someone to someone"}`}
          >
            Remove kudos
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => onAct("DISMISS")}
          aria-label={`${recognition.removed ? "Close" : "Dismiss"} the report on the kudos from ${people ?? "someone to someone"}`}
        >
          {recognition.removed ? "Close report" : "Dismiss report"}
        </Button>
      </div>
    </li>
  );
}
