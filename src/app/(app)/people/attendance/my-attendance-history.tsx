"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  FilterBar,
  Input,
  Modal,
  Select,
  Spinner,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  Textarea,
  useToast,
  type AppliedFilter,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";
import type { ApiHistoryRow, HistoryStatusFilter } from "@/lib/api/attendance";
import {
  STATUS_LABEL,
  STATUS_TONE,
  useAttendanceHistory,
  useCorrectionActions,
  useMyCorrections,
} from "@/lib/store/attendance";
import { shortDate } from "@/lib/today";

const HISTORY_STATUS_LABEL: Record<HistoryStatusFilter, string> = {
  ...STATUS_LABEL,
  EARLY: "Left early",
};

/**
 * A plain employee's own day-by-day attendance, with a way to flag one that
 * looks wrong.
 *
 * Before this there was nowhere to see it at all — `MyAttendanceSummary`
 * above this gives the aggregate, and the company's day-by-day calendar
 * (`history-screen.tsx`) explicitly refuses anybody without `EDIT_RECORDS`
 * or a direct report, in its own words: "not your own". This is that missing
 * personal reading, filterable the same way a manager's roster search would
 * be, plus the request door `correct()` never had for the person the record
 * is about.
 */
export function MyAttendanceHistoryPanel() {
  const toast = useToast();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<HistoryStatusFilter | "">("");
  const [correcting, setCorrecting] = useState<ApiHistoryRow | null>(null);

  const history = useAttendanceHistory({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(status ? { status } : {}),
  });
  const corrections = useMyCorrections();

  /** A pending request against a given day, if there is one. */
  const pendingFor = (date: string) =>
    corrections.requests.find(
      (request) => request.workDate === date && request.status === "PENDING",
    );

  const applied: AppliedFilter[] = [
    ...(from || to
      ? [
          {
            label: "Dates",
            value:
              from && to
                ? `${shortDate(from)} to ${shortDate(to)}`
                : from
                  ? `From ${shortDate(from)}`
                  : `Up to ${shortDate(to)}`,
            onClear: () => {
              setFrom("");
              setTo("");
            },
          },
        ]
      : []),
    ...(status
      ? [
          {
            label: "Status",
            value: HISTORY_STATUS_LABEL[status],
            onClear: () => setStatus(""),
          },
        ]
      : []),
  ];

  return (
    <Card>
      <CardHeader
        title="Your day-by-day record"
        description="The last 30 days by default. Narrow it to a range or a status below."
      />
      <CardBody className="flex flex-col gap-4">
        <FilterBar
          applied={applied}
          onClearAll={() => {
            setFrom("");
            setTo("");
            setStatus("");
          }}
          count={history.rows.length}
          noun={["day", "days"]}
        >
          <Field label="From">
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
            />
          </Field>
          <Field label="To">
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
            />
          </Field>
          <Field label="Status">
            <Select
              value={status}
              placeholder="Any status"
              onChange={(event) =>
                setStatus(event.target.value as HistoryStatusFilter | "")
              }
            >
              {(Object.keys(HISTORY_STATUS_LABEL) as HistoryStatusFilter[]).map(
                (value) => (
                  <option key={value} value={value}>
                    {HISTORY_STATUS_LABEL[value]}
                  </option>
                ),
              )}
            </Select>
          </Field>
        </FilterBar>

        {history.error && (
          <LoadFailure subject="your attendance history" error={history.error} />
        )}

        {history.loading ? (
          <div className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading
          </div>
        ) : history.rows.length === 0 ? (
          <EmptyState
            compact
            title="Nothing in this range"
            description="Nothing was recorded, or nothing here matches the filter."
          />
        ) : (
          <TableWrap caption="Your attendance, one row per day">
            <THead>
              <TH>Date</TH>
              <TH>Status</TH>
              <TH>Clock in</TH>
              <TH>Clock out</TH>
              <TH>&nbsp;</TH>
            </THead>
            <TBody>
              {history.rows.map((row) => {
                const pending = pendingFor(row.date);
                return (
                  <TR key={row.date}>
                    <TD>{shortDate(row.date)}</TD>
                    <TD>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={STATUS_TONE[row.status]} size="sm">
                          {STATUS_LABEL[row.status]}
                        </Badge>
                        {row.earlyByMinutes > 0 && (
                          <Badge tone="warning" size="sm">
                            Left early
                          </Badge>
                        )}
                      </span>
                    </TD>
                    <TD>{row.clockIn ?? "—"}</TD>
                    <TD>{row.clockOut ?? "—"}</TD>
                    <TD align="right">
                      {pending ? (
                        <span className="text-meta text-muted">
                          Correction pending
                        </span>
                      ) : (
                        (row.status === "PRESENT" || row.status === "LATE" || row.status === "ABSENT") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCorrecting(row)}
                          >
                            <Pencil aria-hidden="true" className="size-3.5" />
                            Something wrong?
                          </Button>
                        )
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </TableWrap>
        )}
      </CardBody>

      {correcting && (
        <RequestCorrectionDialog
          row={correcting}
          onClose={() => setCorrecting(null)}
          onSent={() => {
            setCorrecting(null);
            corrections.reload();
            toast.push({
              title: "Sent to HR",
              tone: "success",
              detail: "You'll see it here once it's decided.",
            });
          }}
        />
      )}
    </Card>
  );
}

/**
 * Asking for one day to be put right.
 *
 * A proposal, not a write — the same shape `EmployeeChangeRequest` uses for
 * a bank account. HR sees this in the shared approvals queue and, on
 * approval, it is applied through the exact function an HR-typed fix already
 * uses. There is no "clear my clock-in" here on purpose: this form only ever
 * asks what a time should have been, never asks to erase one.
 */
function RequestCorrectionDialog({
  row,
  onClose,
  onSent,
}: {
  row: ApiHistoryRow;
  onClose: () => void;
  onSent: () => void;
}) {
  const actions = useCorrectionActions();
  const [clockIn, setClockIn] = useState(row.clockIn ?? "");
  const [clockOut, setClockOut] = useState(row.clockOut ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const changedIn = clockIn && clockIn !== row.clockIn ? clockIn : undefined;
    const changedOut = clockOut && clockOut !== row.clockOut ? clockOut : undefined;
    if (!changedIn && !changedOut) {
      setError("Change the clock-in or the clock-out time first.");
      return;
    }
    if (reason.trim().length < 10) {
      setError("Say a bit more — this is what HR has to go on.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await actions.requestCorrection({
        date: row.date,
        ...(changedIn ? { clockIn: changedIn } : {}),
        ...(changedOut ? { clockOut: changedOut } : {}),
        reason: reason.trim(),
      });
      onSent();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not send that.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${shortDate(row.date)} — something wrong?`}
      description="Say what it should say instead. HR sees this and decides; nothing changes until they agree."
      size="sm"
      footer={
        <>
          <Button disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" loading={saving} onClick={() => void send()}>
            Send to HR
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Clock in should be">
            <Input
              type="time"
              value={clockIn}
              disabled={saving}
              onChange={(event) => setClockIn(event.target.value)}
            />
          </Field>
          <Field label="Clock out should be">
            <Input
              type="time"
              value={clockOut}
              disabled={saving}
              onChange={(event) => setClockOut(event.target.value)}
            />
          </Field>
        </div>
        <p className="text-meta text-muted">
          The record currently says {row.clockIn ?? "no clock-in"} to{" "}
          {row.clockOut ?? "no clock-out"}.
        </p>
        <Field
          label="Why"
          required
          {...(error ? { error } : {})}
          help="A sentence is enough — this is the record of what happened."
        >
          <Textarea
            rows={3}
            value={reason}
            disabled={saving}
            placeholder="My phone died at lunchtime and I forgot to clock back in when I got back."
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
