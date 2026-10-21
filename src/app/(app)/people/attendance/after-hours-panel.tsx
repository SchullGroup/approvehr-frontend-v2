"use client";

import { useEffect, useState } from "react";
import { DoorOpen } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Spinner,
  Textarea,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";
import { attendanceApi, type ApiAfterHoursScan } from "@/lib/api/attendance";
import { useCan } from "@/lib/permissions";
import { useOrgTimezone, useSession } from "@/lib/store/session";
import { formatTime } from "@/lib/time";
import { shortDate } from "@/lib/today";

const NOTE_MIN = 3;
const NOTE_MAX = 300;

/**
 * Door scans outside working hours, waiting for HR.
 *
 * A scan at 21:40 might be somebody working late or somebody collecting a
 * forgotten bag, and the door cannot tell. So nothing outside working hours
 * reaches a timesheet until a person says so here.
 *
 * - **Dismiss** needs no reason: the scan stays on record and the day is left
 *   alone.
 * - **Count as extra hours** changes somebody's pay, so it asks for a note
 *   (3–300 characters) that is kept with the correction.
 *
 * Either way the row leaves the pending list, using what the API answered with
 * rather than a refetch. A 409 means somebody else decided it first, so the
 * row is dropped and the reader is told.
 *
 * Offline there is no door to scan, so the list is simply empty.
 */
export function AfterHoursPanel() {
  const allowed = useCan("EDIT_RECORDS");
  const { isConnected } = useSession();
  const timeZone = useOrgTimezone();
  const toast = useToast();

  const [scans, setScans] = useState<ApiAfterHoursScan[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [tick, setTick] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [counting, setCounting] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const ask = allowed && isConnected;

  useEffect(() => {
    if (!ask) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const rows = await attendanceApi.afterHours(
          { status: "PENDING" },
          controller.signal,
        );
        if (!cancelled) {
          setScans(rows);
          setError(null);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (!cancelled) {
          setScans([]);
          setError(e instanceof ApiError ? e : null);
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ask, tick]);

  if (!allowed) return null;

  const rows = ask ? scans : [];

  const leave = (id: string) =>
    setScans((current) => (current ?? []).filter((r) => r.punchId !== id));

  async function decide(
    id: string,
    action: () => Promise<unknown>,
    done: string,
  ) {
    setBusyId(id);
    try {
      await action();
      leave(id);
      if (counting === id) {
        setCounting(null);
        setNote("");
      }
      toast.push({ title: done, tone: "success" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) leave(id);
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          e instanceof ApiError
            ? e.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusyId(null);
    }
  }

  const trimmed = note.trim();
  const noteOk = trimmed.length >= NOTE_MIN && trimmed.length <= NOTE_MAX;

  return (
    <Card>
      <CardHeader
        level={2}
        title="After hours"
        description="Door scans outside working hours. Nothing here reaches a timesheet until you decide."
      />
      {error && (
        <CardBody>
          <LoadFailure
            subject="the after-hours scans"
            error={error}
            onRetry={() => setTick((t) => t + 1)}
          />
        </CardBody>
      )}
      {rows === null ? (
        <CardBody className="flex justify-center py-10">
          <Spinner />
        </CardBody>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<DoorOpen aria-hidden="true" />}
          title="Nothing waiting"
          description="No door scans outside working hours need a decision."
        />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((scan) => {
            const open = counting === scan.punchId;
            const busy = busyId === scan.punchId;
            return (
              <li key={scan.punchId} className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
                      <span>{scan.employeeName}</span>
                      {scan.nonWorkingDay && (
                        <Badge tone="info" size="sm">
                          weekend/holiday
                        </Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-meta text-muted">
                      <span>{shortDate(scan.workDate)}</span>
                      {" · "}
                      <span className="tabular">
                        {formatTime(scan.punchedAt, timeZone)}
                      </span>
                      {" · "}
                      <span>{scan.deviceLabel}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void decide(
                          scan.punchId,
                          () =>
                            attendanceApi.dismissAfterHours(scan.punchId, {}),
                          "Dismissed",
                        )
                      }
                    >
                      Dismiss
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setCounting(open ? null : scan.punchId);
                        setNote("");
                      }}
                    >
                      Count as extra hours
                    </Button>
                  </div>
                </div>

                {open && (
                  <div className="flex flex-col gap-3">
                    <Field
                      label="Note"
                      required
                      help={`Why this counts, ${String(NOTE_MIN)}–${String(NOTE_MAX)} characters. It is kept with the correction.`}
                    >
                      <Textarea
                        rows={2}
                        maxLength={NOTE_MAX}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </Field>
                    <div>
                      <Button
                        variant="accent"
                        size="sm"
                        disabled={!noteOk || busy}
                        loading={busy}
                        onClick={() =>
                          void decide(
                            scan.punchId,
                            () =>
                              attendanceApi.countAfterHours(scan.punchId, {
                                note: trimmed,
                              }),
                            "Counted as extra hours",
                          )
                        }
                      >
                        Count it
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
