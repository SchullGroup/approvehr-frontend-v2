"use client";

import {
  Card,
  CardBody,
  CardHeader,
  Spinner,
  Stat,
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
import { pct, points } from "./charts";

/**
 * Calibration moves audit — shown on the period page once the cycle is at
 * CALIBRATION or PUBLISHED stage.
 *
 * This deliberately lives here rather than inside the fairness check.
 * The fairness check is a tool for identifying which marks to adjust
 * *during* calibration. The calibration audit is the answer to a different,
 * later question: "What did we actually change, and did the changes look
 * fair?" Showing both in the same screen mixed two moments in time.
 *
 * Rendered by the period page — where it sits beside the register of who
 * was marked — rather than behind the fairness-check link, so HR cannot
 * publish without at least scrolling past it.
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
  const date = (iso: string) => formatDateShort(iso, timeZone);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Calibration moves"
          description="Marks adjusted after the manager stage closed. Shown here so the audit trail is visible before publishing."
        />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Marks moved" value={String(calibration.moved)} />
            <Stat label="Moved up" value={String(calibration.up)} />
            <Stat label="Moved down" value={String(calibration.down)} />
          </div>
        </CardBody>

        {calibration.byGroup.length > 0 && (
          <TableWrap caption="Calibration moves by group">
            <THead>
              <TH>Grouping</TH>
              <TH>Group</TH>
              <TH className="text-right">Moves</TH>
              <TH className="text-right">Average move</TH>
            </THead>
            <TBody>
              {calibration.byGroup.flatMap((dim) =>
                dim.comparable && dim.groups
                  ? dim.groups.map((g) => (
                      <TR key={`${dim.key}-${g.label}`}>
                        <TD>{dim.label}</TD>
                        <TD>{g.label}</TD>
                        <TD className="text-right tabular-nums">{g.moves}</TD>
                        <TD className="text-right tabular-nums">
                          {points(g.averageMoveBp)}
                        </TD>
                      </TR>
                    ))
                  : [
                      <TR key={dim.key}>
                        <TD>{dim.label}</TD>
                        <TD className="text-muted" colSpan={3}>
                          Too few moves to compare yet
                        </TD>
                      </TR>,
                    ],
              )}
            </TBody>
          </TableWrap>
        )}
      </Card>

      {calibration.latest && calibration.latest.length > 0 && (
        <Card>
          <CardHeader level={3} title="Latest moves" />
          <TableWrap caption="Latest calibration moves">
            <THead>
              <TH>Date</TH>
              <TH>Employee</TH>
              <TH className="text-right">Mark</TH>
              <TH>By</TH>
              <TH>Reason</TH>
            </THead>
            <TBody>
              {calibration.latest.map((move) => (
                <TR key={move.id}>
                  <TD className="whitespace-nowrap">{date(move.at)}</TD>
                  <TD>{move.employeeName}</TD>
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
      )}
    </div>
  );
}
