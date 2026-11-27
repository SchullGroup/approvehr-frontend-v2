"use client";

import {
  Card,
  CardBody,
  Spinner,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { useCan } from "@/lib/permissions";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateShort } from "@/lib/time";
import { useCycleFairness } from "@/lib/store/performance";
import { pct } from "./charts";

/**
 * Who had their score moved at calibration, and why: the audit trail.
 *
 * It lives on the period page, beside the register, and **only once a score has
 * been moved** (the caller mounts it from the register's own rows, so a period
 * with no moves makes no extra read). It is one card with no heading: a list of
 * moves under a tab called Scores needs no title. The by-group figures are
 * fairness analysis, and sit on the fairness check's Groups tab.
 */
export function CalibrationAudit({ cycleId }: { cycleId: string }) {
  const allowed = useCan("VIEW_FAIRNESS");
  // periods=1: this is always an audit of this cycle only, not a rolling window.
  const detail = useCycleFairness(cycleId, 1, allowed);
  const data = detail.fairness;
  const timeZone = useOrgTimezone();

  if (!allowed || !detail.available) return null;

  if (detail.loading && !data) {
    return (
      <Card>
        <CardBody className="flex items-center gap-2 text-body-sm text-muted">
          <Spinner size="sm" />
          Loading calibration moves
        </CardBody>
      </Card>
    );
  }

  if (detail.error) {
    return (
      <LoadFailure
        subject="the calibration moves"
        error={detail.error}
        onRetry={detail.reload}
      />
    );
  }

  if (!data) return null;

  const { calibration } = data;
  if (calibration.moved === 0) return null;
  const latest = calibration.latest ?? [];
  if (latest.length === 0) return null;
  const date = (iso: string) => formatDateShort(iso, timeZone);

  return (
    <Card>
      <TableWrap caption="Calibration moves">
        <THead>
          <TH>Employee</TH>
          <TH className="text-right">Score</TH>
          <TH>By</TH>
          <TH>Reason</TH>
        </THead>
        <TBody>
          {latest.map((move) => (
            <TR key={move.id}>
              <TD>
                {move.employeeName}
                <span className="mt-0.5 block text-meta text-muted">
                  {date(move.at)}
                </span>
              </TD>
              <TD className="whitespace-nowrap text-right tabular-nums">
                {pct(move.previousBp ?? move.computedBp)} →{" "}
                {move.calibratedBp === null
                  ? `${pct(move.computedBp)} (put back)`
                  : pct(move.calibratedBp)}
              </TD>
              <TD>{move.actorName ?? "Not recorded"}</TD>
              <TD className="text-muted">{move.reason ?? "None given"}</TD>
            </TR>
          ))}
        </TBody>
      </TableWrap>
    </Card>
  );
}
